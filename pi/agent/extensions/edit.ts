import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createEditToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const SingleEditParameters = Type.Object(
  {
    path: Type.String({ description: "Relative (prefered) or absolute path to the file to edit" }),
    oldText: Type.String({
      description: "Exact text to replace. Must match exactly once in the file. If repeated, include the smallest nearby unchanged context that makes it unique.",
    }),
    newText: Type.String(),
  },
  { additionalProperties: false },
);

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
    description: "Edit a file by exact text replacement",
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
