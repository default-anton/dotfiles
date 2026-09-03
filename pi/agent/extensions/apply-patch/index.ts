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
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import {
  createApplyPatchAvailability,
  supportsApplyPatch,
} from "./lib/availability.ts";
import { APPLY_PATCH_GRAMMAR, parsePatch } from "./lib/patch.ts";
import {
  applyVerifiedPatch,
  verifyPatch,
  type VerifiedPatch,
} from "./lib/workspace.ts";

const applyPatchSchema = Type.Object(
  {
    input: Type.String({
      minLength: 1,
      description: "Raw patch text beginning with *** Begin Patch and ending with *** End Patch.",
    }),
  },
  { additionalProperties: false },
);

type ApplyPatchInput = Static<typeof applyPatchSchema>;

type ApplyPatchDetails = {
  diff?: string;
  patch: string;
  changedFiles: string[];
};

type ApplyPatchPreview =
  | { diff: string; changedFiles: string[] }
  | { error: string };

type ApplyPatchCallComponent = Box & {
  preview?: ApplyPatchPreview;
  previewArgsKey?: string;
  previewPending: boolean;
  settled: boolean;
  settledError: boolean;
};

type ApplyPatchRenderState = {
  callComponent?: ApplyPatchCallComponent;
};

type ApplyPatchResult = {
  content: Array<{ type: string; text?: string }>;
  details?: ApplyPatchDetails;
};

const TOOL_NAME = "apply_patch";

function createApplyPatchCallComponent(): ApplyPatchCallComponent {
  return Object.assign(new Box(1, 1, (text: string) => text), {
    preview: undefined as ApplyPatchPreview | undefined,
    previewArgsKey: undefined as string | undefined,
    previewPending: false,
    settled: false,
    settledError: false,
  });
}

function getApplyPatchCallComponent(
  state: ApplyPatchRenderState,
  lastComponent: unknown,
): ApplyPatchCallComponent {
  if (lastComponent instanceof Box) {
    const component = lastComponent as ApplyPatchCallComponent;
    state.callComponent = component;
    return component;
  }
  if (state.callComponent) return state.callComponent;

  const component = createApplyPatchCallComponent();
  state.callComponent = component;
  return component;
}

function generateVerifiedDiff(verified: VerifiedPatch): string {
  return verified.changes
    .map((change) => {
      const { diff } = generateDiffString(
        change.oldContent,
        change.newContent,
      );
      return verified.changes.length === 1
        ? diff
        : `${change.path}\n${diff}`;
    })
    .join("\n");
}

function generateVerifiedUnifiedPatch(verified: VerifiedPatch): string {
  return verified.changes
    .map((change) =>
      generateUnifiedPatch(change.path, change.oldContent, change.newContent)
    )
    .join("\n");
}

function formatChangedFiles(changedFiles: string[], theme: Theme): string {
  const visible = changedFiles.slice(0, 2).join(", ");
  const remaining = changedFiles.length - 2;
  const suffix = remaining > 0 ? ` +${remaining}` : "";
  return theme.fg("accent", `${visible}${suffix}`);
}

function formatApplyPatchCall(
  preview: ApplyPatchPreview | undefined,
  theme: Theme,
): string {
  const title = theme.fg("toolTitle", theme.bold(TOOL_NAME));
  if (!preview || "error" in preview || preview.changedFiles.length === 0) {
    return title;
  }
  return `${title} ${formatChangedFiles(preview.changedFiles, theme)}`;
}

function getApplyPatchHeaderBg(
  preview: ApplyPatchPreview | undefined,
  settled: boolean,
  settledError: boolean,
  theme: Theme,
): (text: string) => string {
  if (settledError) return (text) => theme.bg("toolErrorBg", text);
  if (settled) return (text) => theme.bg("toolSuccessBg", text);
  if (preview && "error" in preview) {
    return (text) => theme.bg("toolErrorBg", text);
  }
  return (text) => theme.bg("toolPendingBg", text);
}

function buildApplyPatchCallComponent(
  component: ApplyPatchCallComponent,
  theme: Theme,
  expanded: boolean,
): ApplyPatchCallComponent {
  component.setBgFn(
    getApplyPatchHeaderBg(
      component.preview,
      component.settled,
      component.settledError,
      theme,
    ),
  );
  component.clear();
  component.addChild(
    new Text(formatApplyPatchCall(component.preview, theme), 0, 0),
  );

  if (
    component.preview &&
    ("error" in component.preview || expanded)
  ) {
    const body = "error" in component.preview
      ? theme.fg("error", component.preview.error)
      : renderDiff(component.preview.diff);
    component.addChild(new Spacer(1));
    component.addChild(new Text(body, 0, 0));
  }

  return component;
}

function setApplyPatchPreview(
  component: ApplyPatchCallComponent,
  preview: ApplyPatchPreview,
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
      (current.diff !== preview.diff ||
        current.changedFiles.join("\n") !== preview.changedFiles.join("\n")));

  component.preview = preview;
  component.previewArgsKey = argsKey;
  component.previewPending = false;
  return changed;
}

async function computeApplyPatchPreview(
  input: ApplyPatchInput,
  cwd: string,
): Promise<ApplyPatchPreview> {
  try {
    const patch = parsePatch(input.input);
    const verified = await withFileMutationQueue(
      cwd,
      () => verifyPatch(patch, cwd),
    );
    return {
      diff: generateVerifiedDiff(verified),
      changedFiles: verified.summary,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function getApplyPatchResultText(result: ApplyPatchResult): string {
  return result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
}

function formatApplyPatchResult(
  preview: ApplyPatchPreview | undefined,
  result: ApplyPatchResult,
  theme: Theme,
  isError: boolean,
  expanded: boolean,
): string | undefined {
  const previewDiff = preview && !("error" in preview)
    ? preview.diff
    : undefined;
  const previewError = preview && "error" in preview
    ? preview.error
    : undefined;
  const resultText = getApplyPatchResultText(result);

  if (isError) {
    if (!resultText || resultText === previewError) return undefined;
    return theme.fg("error", resultText);
  }

  const resultDiff = result.details?.diff;
  if (typeof resultDiff === "string") {
    return expanded && resultDiff !== previewDiff
      ? renderDiff(resultDiff)
      : undefined;
  }
  return resultText ? theme.fg("toolOutput", resultText) : undefined;
}

export default function applyPatchExtension(pi: ExtensionAPI) {
  let initialized = false;
  const availability = createApplyPatchAvailability(
    () => pi.getActiveTools(),
    (names) => pi.setActiveTools(names),
  );

  pi.registerTool({
    name: TOOL_NAME,
    label: "apply_patch",
    description:
      "Apply a patch to files in the working directory. This is a freeform tool: send raw patch text with *** Begin Patch and *** End Patch. Use *** Add File, *** Delete File, or *** Update File headers; prefix update lines with +, -, or a space.",
    promptSnippet: "Apply multi-file patches with context-based edits",
    promptGuidelines: [
      "Use apply_patch for file edits, additions, deletions, and moves.",
      "Keep patch paths relative to the working directory and include enough unchanged context for updates to match.",
    ],
    parameters: applyPatchSchema,
    constrainedSampling: {
      type: "grammar",
      variants: { openai_lark: APPLY_PATCH_GRAMMAR },
    },
    executionMode: "sequential",
    renderShell: "self",

    async execute(_toolCallId, input: ApplyPatchInput, signal, _onUpdate, ctx) {
      if (!supportsApplyPatch(ctx.model)) {
        throw new Error("apply_patch is available only for supported OpenAI Responses models.");
      }
      const patch = parsePatch(input.input);
      return withFileMutationQueue(ctx.cwd, async () => {
        const verified = await verifyPatch(patch, ctx.cwd);
        await applyVerifiedPatch(verified, signal);
        const text = `Success. Updated the following files:\n${verified.summary.join("\n")}`;
        const details: ApplyPatchDetails = {
          diff: generateVerifiedDiff(verified),
          patch: generateVerifiedUnifiedPatch(verified),
          changedFiles: verified.summary,
        };
        return { content: [{ type: "text" as const, text }], details };
      });
    },

    renderCall(args, theme, context) {
      const state = context.state as ApplyPatchRenderState;
      const component = getApplyPatchCallComponent(
        state,
        context.lastComponent,
      );
      const input = args as ApplyPatchInput;
      const canPreview = typeof input?.input === "string" &&
        input.input.length > 0;
      const argsKey = context.argsComplete && canPreview
        ? input.input
        : undefined;

      if (component.previewArgsKey !== argsKey) {
        component.preview = undefined;
        component.previewArgsKey = argsKey;
        component.previewPending = false;
        component.settled = false;
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
        void computeApplyPatchPreview(input, context.cwd).then((preview) => {
          if (
            component.previewArgsKey === requestKey &&
            !component.settled
          ) {
            setApplyPatchPreview(component, preview, requestKey);
            context.invalidate();
          }
        });
      }

      return buildApplyPatchCallComponent(
        component,
        theme,
        context.expanded,
      );
    },

    renderResult(result, { expanded }, theme, context) {
      const state = context.state as ApplyPatchRenderState;
      const callComponent = state.callComponent;
      const input = context.args as ApplyPatchInput;
      const argsKey = typeof input?.input === "string"
        ? input.input
        : undefined;
      const typedResult = result as ApplyPatchResult;
      const resultDiff = context.isError
        ? undefined
        : typedResult.details?.diff;
      let changed = false;

      if (callComponent) {
        if (!callComponent.settled) {
          callComponent.settled = true;
          changed = true;
        }
        if (context.isError) {
          const errorText = getApplyPatchResultText(typedResult);
          if (errorText) {
            changed =
              setApplyPatchPreview(
                callComponent,
                { error: errorText },
                argsKey,
              ) || changed;
          } else if (
            callComponent.preview &&
            !("error" in callComponent.preview)
          ) {
            callComponent.preview = undefined;
            callComponent.previewArgsKey = argsKey;
            callComponent.previewPending = false;
            changed = true;
          }
        } else if (typeof resultDiff === "string") {
          changed =
            setApplyPatchPreview(
              callComponent,
              {
                diff: resultDiff,
                changedFiles: typedResult.details?.changedFiles ?? [],
              },
              argsKey,
            ) || changed;
        }
        if (callComponent.settledError !== context.isError) {
          callComponent.settledError = context.isError;
          changed = true;
        }
        if (changed) {
          buildApplyPatchCallComponent(
            callComponent,
            theme,
            expanded,
          );
        }
      }

      const output = formatApplyPatchResult(
        callComponent?.preview,
        typedResult,
        theme,
        context.isError,
        expanded,
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

  pi.on("session_start", (_event, ctx) => {
    initialized = true;
    availability.initialize(ctx.model);
  });
  pi.on("model_select", (_event, ctx) => {
    if (initialized) availability.sync(ctx.model);
  });
  pi.on("before_agent_start", (_event, ctx) => {
    if (!initialized) {
      initialized = true;
      availability.initialize(ctx.model);
    } else {
      availability.sync(ctx.model);
    }
  });
}
