import {
  generateUnifiedPatch,
  withFileMutationQueue,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import {
  createApplyPatchAvailability,
  supportsApplyPatch,
} from "./lib/availability.ts";
import { APPLY_PATCH_GRAMMAR, parsePatch } from "./lib/patch.ts";
import { applyVerifiedPatch, verifyPatch } from "./lib/workspace.ts";

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
  patch: string;
  changedFiles: string[];
};

const TOOL_NAME = "apply_patch";

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

    async execute(_toolCallId, input: ApplyPatchInput, signal, _onUpdate, ctx) {
      if (!supportsApplyPatch(ctx.model)) {
        throw new Error("apply_patch is available only for supported OpenAI Responses models.");
      }
      const patch = parsePatch(input.input);
      return withFileMutationQueue(ctx.cwd, async () => {
        const verified = await verifyPatch(patch, ctx.cwd);
        await applyVerifiedPatch(verified, signal);
        const unifiedPatch = verified.changes
          .map((change) => generateUnifiedPatch(change.path, change.oldContent, change.newContent))
          .join("\n");
        const text = `Success. Updated the following files:\n${verified.summary.join("\n")}`;
        const details: ApplyPatchDetails = {
          patch: unifiedPatch,
          changedFiles: verified.summary,
        };
        return { content: [{ type: "text" as const, text }], details };
      });
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
