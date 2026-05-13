import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type { CodeHighlighter } from "./syntax-highlighting.ts";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REFERENCES = 50;
const MAX_RENDERED_LINES = 80;

interface LineSegment {
  start: number;
  end: number;
}

interface FileReference {
  raw: string;
  path: string;
  lineSpec: string;
  segments: LineSegment[];
}

interface SnippetLine {
  number?: number;
  text: string;
  gap?: boolean;
}

interface Snippet {
  absolutePath: string;
  language: string;
  truncated: boolean;
  lines: SnippetLine[];
}

interface FilePreviewEnv {
  cwd?: string;
  filePreviewCount?: number;
  highlighter?: CodeHighlighter;
}

type PreviewMode = "block" | "compact";

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  [".bash", "bash"],
  [".c", "c"],
  [".cc", "cpp"],
  [".clj", "clojure"],
  [".cpp", "cpp"],
  [".cs", "csharp"],
  [".css", "css"],
  [".ex", "elixir"],
  [".exs", "elixir"],
  [".go", "go"],
  [".html", "html"],
  [".java", "java"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsx", "jsx"],
  [".kt", "kotlin"],
  [".lua", "lua"],
  [".md", "markdown"],
  [".php", "php"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".sh", "bash"],
  [".sql", "sql"],
  [".swift", "swift"],
  [".toml", "toml"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".vue", "vue"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".zsh", "bash"],
]);

const REFERENCE_PATTERN = /(^|[^\w@./-])((?:\.\/)?[\w@./+-][\w@./+-]*):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;

export function fileReferencePreviewPlugin(markdown: MarkdownIt): void {
  markdown.core.ruler.after("inline", "file_reference_previews", (state) => {
    markTableCells(state.tokens);
    transformParagraphReferences(state.tokens, state.Token, state.env as FilePreviewEnv);
    expandTableReferenceTokens(state.tokens, state.Token);
  });

  const originalCodeInline = markdown.renderer.rules.code_inline;
  markdown.renderer.rules.code_inline = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const mode = token.meta?.fileRefMode as PreviewMode | undefined;
    const preview = mode ? renderReference(token.content, env as FilePreviewEnv, mode) : undefined;
    if (preview) {
      return preview;
    }

    return originalCodeInline ? originalCodeInline(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };

  const originalParagraphOpen = markdown.renderer.rules.paragraph_open;
  markdown.renderer.rules.paragraph_open = (tokens, index, options, env, self) => {
    if (tokens[index + 1]?.meta?.fileRefStandalone) {
      return "";
    }

    return originalParagraphOpen ? originalParagraphOpen(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };

  const originalParagraphClose = markdown.renderer.rules.paragraph_close;
  markdown.renderer.rules.paragraph_close = (tokens, index, options, env, self) => {
    if (tokens[index - 1]?.meta?.fileRefStandalone) {
      return "";
    }

    return originalParagraphClose ? originalParagraphClose(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
  };
}

function markTableCells(tokens: Token[]): void {
  let inCell = false;

  for (const token of tokens) {
    if (token.type === "td_open" || token.type === "th_open") {
      inCell = true;
      continue;
    }

    if (token.type === "td_close" || token.type === "th_close") {
      inCell = false;
      continue;
    }

    if (token.type === "inline" && inCell) {
      token.meta = { ...token.meta, fileRefCompact: true };
      for (const child of token.children ?? []) {
        child.meta = { ...child.meta, fileRefMode: "compact" };
      }
    }
  }
}

function transformParagraphReferences(tokens: Token[], TokenConstructor: typeof Token, env: FilePreviewEnv): void {
  for (let index = 0; index < tokens.length - 2; index++) {
    const open = tokens[index];
    const inline = tokens[index + 1];
    const close = tokens[index + 2];

    if (open.type !== "paragraph_open" || inline.type !== "inline" || close.type !== "paragraph_close") {
      continue;
    }

    if (inline.meta?.fileRefCompact || !inline.children?.length) {
      continue;
    }

    const replacement = paragraphReplacement(open, inline, close, TokenConstructor, env);
    if (!replacement) {
      continue;
    }

    tokens.splice(index, 3, ...replacement);
    index += replacement.length - 1;
  }
}

function paragraphReplacement(
  open: Token,
  inline: Token,
  close: Token,
  TokenConstructor: typeof Token,
  env: FilePreviewEnv,
): Token[] | undefined {
  const output: Token[] = [];
  let currentChildren: Token[] = [];
  let changed = false;

  const flushParagraph = () => {
    if (currentChildren.length === 0) {
      return;
    }

    const nextOpen = cloneToken(open, TokenConstructor);
    const nextInline = cloneToken(inline, TokenConstructor);
    const nextClose = cloneToken(close, TokenConstructor);
    nextInline.children = currentChildren;
    nextInline.content = currentChildren.map((child) => child.content).join("");
    output.push(nextOpen, nextInline, nextClose);
    currentChildren = [];
  };

  for (const child of inline.children ?? []) {
    if (child.type === "code_inline") {
      const preview = renderReference(child.content.trim(), env, "block");
      if (preview) {
        flushParagraph();
        output.push(htmlBlockToken(preview, TokenConstructor));
        changed = true;
        continue;
      }

      currentChildren.push(child);
      continue;
    }

    if (child.type === "text") {
      const parts = splitParagraphTextReferences(child.content, TokenConstructor, env);
      changed ||= parts.changed;
      for (const part of parts.tokens) {
        if (part.type === "html_block") {
          flushParagraph();
          output.push(part);
        } else {
          currentChildren.push(part);
        }
      }
      continue;
    }

    currentChildren.push(child);
  }

  flushParagraph();
  return changed ? output : undefined;
}

function splitParagraphTextReferences(
  text: string,
  TokenConstructor: typeof Token,
  env: FilePreviewEnv,
): { tokens: Token[]; changed: boolean } {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let changed = false;

  REFERENCE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const prefix = match[1] ?? "";
    const raw = `${match[2]}:${match[3]}`;
    const start = match.index + prefix.length;
    const end = start + raw.length;
    const preview = renderReference(raw, env, "block");

    if (!preview) {
      continue;
    }

    if (start > lastIndex) {
      tokens.push(textToken(text.slice(lastIndex, start), TokenConstructor));
    }
    tokens.push(htmlBlockToken(preview, TokenConstructor));
    lastIndex = end;
    changed = true;
  }

  if (!changed) {
    return { tokens: [textToken(text, TokenConstructor)], changed: false };
  }

  if (lastIndex < text.length) {
    tokens.push(textToken(text.slice(lastIndex), TokenConstructor));
  }

  return { tokens, changed };
}

function cloneToken(token: Token, TokenConstructor: typeof Token): Token {
  const cloned = new TokenConstructor(token.type, token.tag, token.nesting);
  Object.assign(cloned, token);
  cloned.attrs = token.attrs ? token.attrs.map((attr) => [...attr] as [string, string]) : null;
  cloned.meta = token.meta ? { ...token.meta } : null;
  return cloned;
}

function textToken(content: string, TokenConstructor: typeof Token): Token {
  const token = new TokenConstructor("text", "", 0);
  token.content = content;
  return token;
}

function htmlBlockToken(content: string, TokenConstructor: typeof Token): Token {
  const token = new TokenConstructor("html_block", "", 0);
  token.content = content;
  token.block = true;
  return token;
}

function expandTableReferenceTokens(tokens: Token[], TokenConstructor: typeof Token): void {
  for (const token of tokens) {
    if (token.type !== "inline" || !token.children?.length) {
      continue;
    }

    if (!token.meta?.fileRefCompact) {
      continue;
    }

    const mode: PreviewMode = "compact";
    const children: Token[] = [];
    let changed = false;

    for (const child of token.children) {
      if (child.type === "code_inline") {
        if (parseFileReference(child.content.trim())?.raw === child.content.trim()) {
          child.meta = { ...child.meta, fileRefMode: mode };
        }
        children.push(child);
        continue;
      }

      if (child.type !== "text") {
        children.push(child);
        continue;
      }

      const parts = splitTextReferences(child.content, mode, TokenConstructor);
      changed ||= parts.length !== 1 || parts[0] !== child;
      children.push(...parts);
    }

    if (changed) {
      token.children = children;
    }
  }
}

function splitTextReferences(text: string, mode: PreviewMode, TokenConstructor: typeof Token): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;

  REFERENCE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const prefix = match[1] ?? "";
    const raw = `${match[2]}:${match[3]}`;
    const start = match.index + prefix.length;
    const end = start + raw.length;

    if (!parseFileReference(raw)) {
      continue;
    }

    if (start > lastIndex) {
      const token = new TokenConstructor("text", "", 0);
      token.content = text.slice(lastIndex, start);
      tokens.push(token);
    }

    const token = new TokenConstructor("html_inline", "", 0);
    token.content = `<!--pi-file-ref:${mode}:${encodeURIComponent(raw)}-->`;
    tokens.push(token);
    lastIndex = end;
  }

  if (lastIndex === 0) {
    const token = new TokenConstructor("text", "", 0);
    token.content = text;
    return [token];
  }

  if (lastIndex < text.length) {
    const token = new TokenConstructor("text", "", 0);
    token.content = text.slice(lastIndex);
    tokens.push(token);
  }

  return tokens;
}

export function renderFileReferencePlaceholders(html: string, env: FilePreviewEnv): string {
  return html.replace(/<!--pi-file-ref:(block|compact):([^>]+)-->/g, (_match, mode: PreviewMode, encoded: string) => {
    return renderReference(decodeURIComponent(encoded), env, mode) ?? escapeHtml(decodeURIComponent(encoded));
  });
}

function renderReference(raw: string, env: FilePreviewEnv, mode: PreviewMode): string | undefined {
  const reference = parseFileReference(raw.trim());
  if (!reference || !env.cwd) {
    return undefined;
  }

  if ((env.filePreviewCount ?? 0) >= MAX_REFERENCES) {
    return undefined;
  }

  const snippet = readSnippet(env.cwd, reference);
  if (!snippet) {
    return undefined;
  }

  env.filePreviewCount = (env.filePreviewCount ?? 0) + 1;
  return renderSnippet(reference, snippet, mode, env.highlighter);
}

function parseFileReference(text: string): FileReference | undefined {
  const match = text.match(/^((?:\.\/)?[\w@./+-][\w@./+-]*):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/);
  if (!match) {
    return undefined;
  }

  const path = match[1];
  if (path.includes(":") || path.endsWith("/") || path.includes("//")) {
    return undefined;
  }

  const segments = parseLineSpec(match[2]);
  if (!segments.length) {
    return undefined;
  }

  return { raw: text, path, lineSpec: match[2], segments };
}

function parseLineSpec(lineSpec: string): LineSegment[] {
  const segments: LineSegment[] = [];
  for (const part of lineSpec.split(",")) {
    const [startText, endText] = part.split("-");
    const start = Number(startText);
    const end = Number(endText ?? startText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      return [];
    }
    segments.push({ start, end });
  }

  return segments;
}

function readSnippet(cwd: string, reference: FileReference): Snippet | undefined {
  const absolutePath = resolveSafePath(cwd, reference.path);
  if (!absolutePath || !existsSync(absolutePath)) {
    return undefined;
  }

  let content: string;
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
      return undefined;
    }

    content = readFileSync(absolutePath, "utf8");
  } catch {
    return undefined;
  }

  if (content.includes("\0")) {
    return undefined;
  }

  const sourceLines = content.split(/\r?\n/);
  if (sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === "") {
    sourceLines.pop();
  }

  const lines: SnippetLine[] = [];
  let previousLine = 0;
  let renderedLineCount = 0;
  let truncated = false;

  for (const segment of reference.segments) {
    if (segment.start > sourceLines.length || segment.end > sourceLines.length) {
      return undefined;
    }

    const end = segment.end;
    if (previousLine > 0 && segment.start > previousLine + 1) {
      lines.push({ text: "⋮", gap: true });
    }

    for (let lineNumber = segment.start; lineNumber <= end; lineNumber++) {
      if (renderedLineCount >= MAX_RENDERED_LINES) {
        truncated = true;
        break;
      }

      lines.push({ number: lineNumber, text: sourceLines[lineNumber - 1] ?? "" });
      renderedLineCount++;
    }

    if (truncated) {
      break;
    }
    previousLine = end;
  }

  return {
    absolutePath,
    language: languageForPath(reference.path),
    lines,
    truncated,
  };
}

function resolveSafePath(cwd: string, referencePath: string): string | undefined {
  if (isAbsolute(referencePath)) {
    return undefined;
  }

  const absoluteCwd = resolve(cwd);
  const absolutePath = resolve(absoluteCwd, referencePath);
  const relativePath = relative(absoluteCwd, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || relativePath.includes(`..${sep}`) || isAbsolute(relativePath)) {
    return undefined;
  }

  return absolutePath;
}

function languageForPath(path: string): string {
  return LANGUAGE_BY_EXTENSION.get(extname(path).toLowerCase()) ?? "text";
}

function renderSnippet(reference: FileReference, snippet: Snippet, mode: PreviewMode, highlighter: CodeHighlighter | undefined): string {
  const code = renderSnippetLines(snippet, highlighter).join("");
  const truncated = snippet.truncated ? `<div class="file-ref-truncated">Preview truncated after ${MAX_RENDERED_LINES} lines.</div>` : "";
  const title = escapeHtml(reference.raw);
  const languageClass = escapeHtml(`language-${snippet.language}`);

  if (mode === "compact") {
    return `<details class="file-ref-preview compact"><summary>${title}</summary><pre class="shiki file-ref-code"><code class="${languageClass}">${code}</code></pre>${truncated}</details>`;
  }

  return `<figure class="file-ref-preview"><figcaption>${title}</figcaption><pre class="shiki file-ref-code"><code class="${languageClass}">${code}</code></pre>${truncated}</figure>`;
}

function renderSnippetLines(snippet: Snippet, highlighter: CodeHighlighter | undefined): string[] {
  const rendered: string[] = [];
  let pendingLines: SnippetLine[] = [];

  const flushPending = () => {
    if (pendingLines.length === 0) {
      return;
    }

    const highlightedLines = highlighter
      ? highlighter.renderLines(
          pendingLines.map((line) => line.text),
          snippet.language,
        )
      : pendingLines.map((line) => escapeHtml(line.text));

    pendingLines.forEach((line, index) => {
      rendered.push(renderSnippetLine(line, highlightedLines[index] ?? ""));
    });
    pendingLines = [];
  };

  for (const line of snippet.lines) {
    if (line.gap) {
      flushPending();
      rendered.push(renderGapLine(line));
      continue;
    }

    pendingLines.push(line);
  }

  flushPending();
  return rendered;
}

function renderSnippetLine(line: SnippetLine, code: string): string {
  return `<span class="line"><span class="line-number">${line.number}</span><span class="line-code">${code}</span></span>`;
}

function renderGapLine(line: SnippetLine): string {
  return `<span class="line gap"><span class="line-number" aria-hidden="true"> </span><span class="line-code">${escapeHtml(line.text)}</span></span>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
