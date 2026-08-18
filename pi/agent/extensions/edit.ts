import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  generateDiffString,
  generateUnifiedPatch,
  renderDiff,
  withFileMutationQueue,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Spacer,
  Text,
  getCapabilities,
  hyperlink,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const replacementSchema = Type.Object(
  {
    old_text: Type.String({
      minLength: 1,
      description: "Text to replace. Include enough context to make it unique.",
    }),
    new_text: Type.String({
      description: "Replacement text. Use an empty string to delete old_text.",
    }),
    replace_all: Type.Optional(
      Type.Boolean({
        default: false,
        description: "Replace every match. If false, old_text must match once.",
      }),
    ),
  },
  { additionalProperties: false },
);

const editSchema = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      description: "Path to the file. Prefer a path relative to the working directory; absolute paths and ~/... are also supported.",
    }),
    edits: Type.Array(replacementSchema, {
      minItems: 1,
      description: "Exact replacements to apply in order.",
    }),
  },
  { additionalProperties: false },
);

type EditInput = Static<typeof editSchema>;
type Replacement = Static<typeof replacementSchema>;

type EditDetails = {
  diff: string;
  patch: string;
  firstChangedLine?: number;
};

type TextReplacement = {
  index: number;
  length: number;
  newText: string;
};

type LineSpan = {
  start: number;
  end: number;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Operation aborted");
}

function resolvePath(path: string, cwd: string): string {
  const normalizedPath = path.startsWith("@") ? path.slice(1) : path;
  const expandedPath = normalizedPath === "~"
    ? homedir()
    : normalizedPath.startsWith("~/")
      ? resolve(homedir(), normalizedPath.slice(2))
      : normalizedPath;

  return isAbsolute(expandedPath) ? expandedPath : resolve(cwd, expandedPath);
}

function decodeText(buffer: Buffer, path: string): string {
  if (buffer.includes(0)) {
    throw new Error(`Could not edit binary file: ${path}.`);
  }

  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error(`Could not edit binary or non-UTF-8 file: ${path}.`);
  }
}

function stripBom(content: string): { bom: string; text: string } {
  return content.startsWith("\uFEFF")
    ? { bom: "\uFEFF", text: content.slice(1) }
    : { bom: "", text: content };
}

function detectLineEnding(content: string): "\r\n" | "\n" {
  const firstLf = content.indexOf("\n");
  if (firstLf === -1) return "\n";
  return firstLf > 0 && content[firstLf - 1] === "\r" ? "\r\n" : "\n";
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(content: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? content.replace(/\n/g, "\r\n") : content;
}

function normalizeForFuzzyMatch(content: string): string {
  return content
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

function matchIndexes(content: string, search: string): number[] {
  if (search.length === 0) return [];

  const indexes: number[] = [];
  let offset = 0;
  while (offset <= content.length - search.length) {
    const index = content.indexOf(search, offset);
    if (index === -1) break;
    indexes.push(index);
    offset = index + search.length;
  }
  return indexes;
}

function validateMatchCount(
  indexes: number[],
  replacement: Replacement,
  editIndex: number,
  path: string,
): void {
  if (indexes.length === 0) {
    throw new Error(
      `Could not find edits[${editIndex}].old_text in ${path}, including after fuzzy normalization.`,
    );
  }

  if (!replacement.replace_all && indexes.length !== 1) {
    throw new Error(
      `Found ${indexes.length} occurrences of edits[${editIndex}].old_text in ${path}. Add context to make it unique or set replace_all to true.`,
    );
  }
}

function applyReplacements(content: string, replacements: TextReplacement[], offset = 0): string {
  let result = content;
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    const start = replacement.index - offset;
    result =
      result.slice(0, start) +
      replacement.newText +
      result.slice(start + replacement.length);
  }
  return result;
}

function splitLinesWithEndings(content: string): string[] {
  return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function getLineSpans(content: string): LineSpan[] {
  let offset = 0;
  return splitLinesWithEndings(content).map((line) => {
    const span = { start: offset, end: offset + line.length };
    offset = span.end;
    return span;
  });
}

function getReplacementLineRange(lines: LineSpan[], replacement: TextReplacement): {
  startLine: number;
  endLine: number;
} {
  const replacementEnd = replacement.index + replacement.length;
  const startLine = lines.findIndex(
    (line) => replacement.index >= line.start && replacement.index < line.end,
  );
  if (startLine === -1) {
    throw new Error("Replacement range is outside the file.");
  }

  let endLine = startLine;
  while (endLine < lines.length && lines[endLine].end < replacementEnd) {
    endLine += 1;
  }
  if (endLine >= lines.length) {
    throw new Error("Replacement range is outside the file.");
  }

  return { startLine, endLine: endLine + 1 };
}

function applyFuzzyReplacements(
  originalContent: string,
  fuzzyContent: string,
  replacements: TextReplacement[],
): string {
  const originalLines = splitLinesWithEndings(originalContent);
  const fuzzyLines = getLineSpans(fuzzyContent);
  if (originalLines.length !== fuzzyLines.length) {
    throw new Error("Could not preserve unchanged lines after fuzzy normalization.");
  }

  const groups: Array<{
    startLine: number;
    endLine: number;
    replacements: TextReplacement[];
  }> = [];

  for (const replacement of replacements) {
    const range = getReplacementLineRange(fuzzyLines, replacement);
    const current = groups[groups.length - 1];
    if (current && range.startLine < current.endLine) {
      current.endLine = Math.max(current.endLine, range.endLine);
      current.replacements.push(replacement);
    } else {
      groups.push({ ...range, replacements: [replacement] });
    }
  }

  let originalLineIndex = 0;
  let result = "";
  for (const group of groups) {
    result += originalLines.slice(originalLineIndex, group.startLine).join("");

    const start = fuzzyLines[group.startLine].start;
    const end = fuzzyLines[group.endLine - 1].end;
    result += applyReplacements(
      fuzzyContent.slice(start, end),
      group.replacements,
      start,
    );
    originalLineIndex = group.endLine;
  }

  return result + originalLines.slice(originalLineIndex).join("");
}

function applyReplacement(
  content: string,
  replacement: Replacement,
  editIndex: number,
  path: string,
): { content: string; count: number } {
  const oldText = normalizeLineEndings(replacement.old_text);
  const newText = normalizeLineEndings(replacement.new_text);
  const exactIndexes = matchIndexes(content, oldText);

  if (exactIndexes.length > 0) {
    validateMatchCount(exactIndexes, replacement, editIndex, path);
    const selectedIndexes = replacement.replace_all ? exactIndexes : exactIndexes.slice(0, 1);
    return {
      content: applyReplacements(
        content,
        selectedIndexes.map((index) => ({ index, length: oldText.length, newText })),
      ),
      count: selectedIndexes.length,
    };
  }

  const fuzzyContent = normalizeForFuzzyMatch(content);
  const fuzzyOldText = normalizeForFuzzyMatch(oldText);
  const fuzzyIndexes = matchIndexes(fuzzyContent, fuzzyOldText);
  validateMatchCount(fuzzyIndexes, replacement, editIndex, path);
  const selectedIndexes = replacement.replace_all ? fuzzyIndexes : fuzzyIndexes.slice(0, 1);
  const replacements = selectedIndexes.map((index) => ({
    index,
    length: fuzzyOldText.length,
    newText,
  }));

  return {
    content: applyFuzzyReplacements(content, fuzzyContent, replacements),
    count: replacements.length,
  };
}

function applyEdits(content: string, edits: Replacement[], path: string): {
  content: string;
  replacementCount: number;
} {
  let nextContent = content;
  let replacementCount = 0;

  for (const [index, replacement] of edits.entries()) {
    const result = applyReplacement(nextContent, replacement, index, path);
    nextContent = result.content;
    replacementCount += result.count;
  }

  if (nextContent === content) {
    throw new Error(`No changes made to ${path}.`);
  }

  return { content: nextContent, replacementCount };
}

type EditPreview =
  | { diff: string; firstChangedLine?: number }
  | { error: string };

type EditCallComponent = Box & {
  preview?: EditPreview;
  previewArgsKey?: string;
  previewPending: boolean;
  settledError: boolean;
};

type EditRenderState = {
  callComponent?: EditCallComponent;
};

type EditResult = {
  content: Array<{ type: string; text?: string }>;
  details?: EditDetails;
};

function createEditCallComponent(): EditCallComponent {
  return Object.assign(new Box(1, 1, (text: string) => text), {
    preview: undefined as EditPreview | undefined,
    previewArgsKey: undefined as string | undefined,
    previewPending: false,
    settledError: false,
  });
}

function getEditCallComponent(
  state: EditRenderState,
  lastComponent: unknown,
): EditCallComponent {
  if (lastComponent instanceof Box) {
    const component = lastComponent as EditCallComponent;
    state.callComponent = component;
    return component;
  }
  if (state.callComponent) return state.callComponent;

  const component = createEditCallComponent();
  state.callComponent = component;
  return component;
}

function renderPath(path: unknown, theme: Theme, cwd: string): string {
  if (typeof path !== "string") return theme.fg("error", "[invalid arg]");
  if (!path) return theme.fg("toolOutput", "...");

  const displayPath = path.startsWith(homedir())
    ? `~${path.slice(homedir().length)}`
    : path;
  const styledPath = theme.fg("accent", displayPath);
  if (!getCapabilities().hyperlinks) return styledPath;

  return hyperlink(styledPath, pathToFileURL(resolvePath(path, cwd)).href);
}

function formatEditCall(args: Partial<EditInput> | undefined, theme: Theme, cwd: string): string {
  return `${theme.fg("toolTitle", theme.bold("edit"))} ${renderPath(args?.path, theme, cwd)}`;
}

function getEditHeaderBg(
  preview: EditPreview | undefined,
  settledError: boolean,
  theme: Theme,
): (text: string) => string {
  if (preview) {
    return "error" in preview
      ? (text) => theme.bg("toolErrorBg", text)
      : (text) => theme.bg("toolSuccessBg", text);
  }
  return settledError
    ? (text) => theme.bg("toolErrorBg", text)
    : (text) => theme.bg("toolPendingBg", text);
}

function buildEditCallComponent(
  component: EditCallComponent,
  args: Partial<EditInput> | undefined,
  theme: Theme,
  cwd: string,
): EditCallComponent {
  component.setBgFn(getEditHeaderBg(component.preview, component.settledError, theme));
  component.clear();
  component.addChild(new Text(formatEditCall(args, theme, cwd), 0, 0));

  if (component.preview) {
    const body = "error" in component.preview
      ? theme.fg("error", component.preview.error)
      : renderDiff(component.preview.diff);
    component.addChild(new Spacer(1));
    component.addChild(new Text(body, 0, 0));
  }

  return component;
}

function setEditPreview(
  component: EditCallComponent,
  preview: EditPreview,
  argsKey: string | undefined,
): boolean {
  const current = component.preview;
  const changed =
    current === undefined ||
    ("error" in current && "error" in preview
      ? current.error !== preview.error
      : "error" in current !== "error" in preview) ||
    (!("error" in current) &&
      !("error" in preview) &&
      (current.diff !== preview.diff || current.firstChangedLine !== preview.firstChangedLine));

  component.preview = preview;
  component.previewArgsKey = argsKey;
  component.previewPending = false;
  return changed;
}

async function computeEditPreview(
  input: EditInput,
  cwd: string,
): Promise<EditPreview> {
  try {
    const absolutePath = resolvePath(input.path, cwd);
    await access(absolutePath, constants.R_OK);
    const rawContent = decodeText(await readFile(absolutePath), input.path);
    const { text } = stripBom(rawContent);
    const originalContent = normalizeLineEndings(text);
    const { content } = applyEdits(originalContent, input.edits, input.path);
    return generateDiffString(originalContent, content);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function formatEditResult(
  args: Partial<EditInput> | undefined,
  preview: EditPreview | undefined,
  result: EditResult,
  theme: Theme,
  isError: boolean,
): string | undefined {
  const previewDiff = preview && !("error" in preview) ? preview.diff : undefined;
  const previewError = preview && "error" in preview ? preview.error : undefined;

  if (isError) {
    const errorText = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    if (!errorText || errorText === previewError) return undefined;
    return theme.fg("error", errorText);
  }

  const resultDiff = result.details?.diff;
  if (resultDiff && resultDiff !== previewDiff) {
    return renderDiff(resultDiff, { filePath: args?.path });
  }
  return undefined;
}

export default function editExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "edit",
    label: "edit",
    description:
      "Edit an existing text file by replacing exact text. Apply edits in order and write only if every edit succeeds. Return the number of successful replacements.",
    promptSnippet: "Edit existing text files with ordered exact replacements",
    promptGuidelines: [
      "Use edit for targeted changes to existing text files.",
      "For edit, include enough context in old_text to make it unique unless replace_all is true.",
      "For edit, use an empty new_text to delete matched text.",
    ],
    parameters: editSchema,
    renderShell: "self",

    async execute(_toolCallId, input: EditInput, signal, _onUpdate, ctx) {
      const absolutePath = resolvePath(input.path, ctx.cwd);

      return withFileMutationQueue(absolutePath, async () => {
        throwIfAborted(signal);

        try {
          await access(absolutePath, constants.R_OK | constants.W_OK);
        } catch (error) {
          throwIfAborted(signal);
          const code = (error as NodeJS.ErrnoException).code;
          throw new Error(
            `Could not edit file: ${input.path}.${code ? ` Error code: ${code}.` : ""}`,
          );
        }

        throwIfAborted(signal);
        const rawContent = decodeText(await readFile(absolutePath), input.path);
        throwIfAborted(signal);

        const { bom, text } = stripBom(rawContent);
        const lineEnding = detectLineEnding(text);
        const originalContent = normalizeLineEndings(text);
        const { content: newContent, replacementCount } = applyEdits(
          originalContent,
          input.edits,
          input.path,
        );

        throwIfAborted(signal);
        await writeFile(
          absolutePath,
          bom + restoreLineEndings(newContent, lineEnding),
          "utf8",
        );
        throwIfAborted(signal);

        const { diff, firstChangedLine } = generateDiffString(
          originalContent,
          newContent,
        );
        const details: EditDetails = {
          diff,
          patch: generateUnifiedPatch(input.path, originalContent, newContent),
          firstChangedLine,
        };
        const noun = replacementCount === 1 ? "occurrence" : "occurrences";

        return {
          content: [{ type: "text" as const, text: `Replaced ${replacementCount} ${noun}.` }],
          details,
        };
      });
    },

    renderCall(args, theme, context) {
      const state = context.state as EditRenderState;
      const component = getEditCallComponent(state, context.lastComponent);
      const input = args as EditInput;
      const canPreview =
        typeof input?.path === "string" &&
        Array.isArray(input.edits) &&
        input.edits.length > 0 &&
        input.edits.every(
          (edit) =>
            typeof edit?.old_text === "string" &&
            typeof edit?.new_text === "string",
        );
      const argsKey = canPreview
        ? JSON.stringify({ path: input.path, edits: input.edits })
        : undefined;

      if (component.previewArgsKey !== argsKey) {
        component.preview = undefined;
        component.previewArgsKey = argsKey;
        component.previewPending = false;
        component.settledError = false;
      }

      if (
        context.argsComplete &&
        canPreview &&
        !component.preview &&
        !component.previewPending
      ) {
        component.previewPending = true;
        const requestKey = argsKey;
        void computeEditPreview(input, context.cwd).then((preview) => {
          if (component.previewArgsKey === requestKey) {
            setEditPreview(component, preview, requestKey);
            context.invalidate();
          }
        });
      }

      return buildEditCallComponent(component, args, theme, context.cwd);
    },

    renderResult(result, _options, theme, context) {
      const state = context.state as EditRenderState;
      const callComponent = state.callComponent;
      const input = context.args as EditInput;
      const argsKey = input?.path && Array.isArray(input.edits)
        ? JSON.stringify({ path: input.path, edits: input.edits })
        : undefined;
      const typedResult = result as EditResult;
      const resultDiff = context.isError ? undefined : typedResult.details?.diff;
      let changed = false;

      if (callComponent) {
        if (typeof resultDiff === "string") {
          changed =
            setEditPreview(
              callComponent,
              {
                diff: resultDiff,
                firstChangedLine: typedResult.details?.firstChangedLine,
              },
              argsKey,
            ) || changed;
        }
        if (callComponent.settledError !== context.isError) {
          callComponent.settledError = context.isError;
          changed = true;
        }
        if (changed) {
          buildEditCallComponent(callComponent, input, theme, context.cwd);
        }
      }

      const output = formatEditResult(
        input,
        callComponent?.preview,
        typedResult,
        theme,
        context.isError,
      );
      const component =
        (context.lastComponent as Container | undefined) ?? new Container();
      component.clear();
      if (output) {
        component.addChild(new Spacer(1));
        component.addChild(new Text(output, 1, 0));
      }
      return component;
    },
  });
}
