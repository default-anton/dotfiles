import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition } from "@mariozechner/pi-coding-agent";

const SingleEditParameters = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description: "Path to the existing file to edit. Prefer cwd-relative paths; absolute paths are allowed when needed.",
    },
    oldText: {
      type: "string",
      description:
        "Non-empty exact current file text to replace. It must occur exactly once in the file. If it occurs multiple times, read more context and include the smallest stable surrounding unchanged text that makes the match unique. Do not guess which occurrence to edit.",
    },
    newText: {
      type: "string",
      description:
        "Replacement text for oldText. Use an empty string to delete oldText. Include any unchanged context from oldText that should remain when editing a larger block.",
    },
  },
  required: ["path", "oldText", "newText"],
  additionalProperties: false,
} as const;

function prepareSingleEditArguments(args: unknown): unknown {
  if (!args || typeof args !== "object") {
    return args;
  }

  const input = args as {
    oldText?: unknown;
    newText?: unknown;
    edits?: Array<{ oldText?: unknown; newText?: unknown }>;
  };

  if (typeof input.oldText === "string" && typeof input.newText === "string") {
    return args;
  }

  if (!Array.isArray(input.edits) || input.edits.length !== 1) {
    return args;
  }

  const [edit] = input.edits;
  if (!edit || typeof edit.oldText !== "string" || typeof edit.newText !== "string") {
    return args;
  }

  const { edits: _edits, ...rest } = input;
  return {
    ...rest,
    oldText: edit.oldText,
    newText: edit.newText,
  };
}

export default function editSingleExtension(pi: ExtensionAPI) {
  const originalEdit = createEditToolDefinition(process.cwd());

  pi.registerTool({
    name: "edit",
    label: "edit",
    description:
      "Edit exactly one existing file by replacing exactly one unique oldText block with newText. One call performs one replacement only. For multiple separate sections in the same file, use multiple edit calls; for nearby, touching, nested, or overlapping changes, merge them into one larger oldText/newText block. Keep oldText as small as possible while still unique. If oldText is not unique or not found, read the file/context again before retrying; do not guess.",
    parameters: SingleEditParameters,
    prepareArguments: prepareSingleEditArguments,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return originalEdit.execute(
        toolCallId,
        {
          path: params.path,
          edits: [{ oldText: params.oldText, newText: params.newText }],
        },
        signal,
        onUpdate,
        ctx,
      );
    },
    renderCall: originalEdit.renderCall,
    renderResult: originalEdit.renderResult,
  });
}
