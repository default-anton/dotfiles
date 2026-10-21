import { convertToLlm, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const HANDOFF_ENTRY = "handoff-compaction";
const HANDOFF_PROMPT = "I’ll ask you to do this tomorrow. Give me a self-contained prompt that I can give you in a fresh session without the context of this conversation. Include the context you need to get up to speed quickly and continue the work correctly, excluding AGENTS instructions. If we created or discussed relevant documents, reference them by path instead of repeating their contents.";

export default function handoffCompactionExtension(pi: ExtensionAPI) {
  pi.registerEntryRenderer<{ prompt: string }>(HANDOFF_ENTRY, (entry, options, theme) => {
    const heading = theme.fg("accent", "Handoff request");
    return new Text(options.expanded ? `${heading}\n\n${entry.data?.prompt ?? ""}` : heading, 1, 1);
  });

  pi.on("session_before_compact", async (event, ctx) => {
    const prompt = [
      "You are running out of context. Let’s continue tomorrow.",
      event.customInstructions?.trim(),
      HANDOFF_PROMPT,
      "Respond with only the handoff prompt. Do not call any tools.",
    ].filter(Boolean).join("\n\n");

    try {
      const model = ctx.model;
      if (!model) throw new Error("No model selected");

      const messages = convertToLlm(ctx.sessionManager.buildSessionProjection().messages);
      messages.push({ role: "user", content: prompt, timestamp: Date.now() });

      let preview = "";
      const updatePreview = () => {
        if (ctx.hasUI) {
          ctx.ui.setWidget(HANDOFF_ENTRY, [
            "Generating handoff…",
            prompt,
            "",
            ...preview.split("\n").slice(-8),
          ]);
        }
      };
      updatePreview();

      const thinkingLevel = ctx.thinkingLevel ?? pi.getThinkingLevel();
      const stream = ctx.modelRegistry.streamSimple(model, {
        messages,
      }, {
        reasoning: model.reasoning && thinkingLevel !== "off" ? thinkingLevel : undefined,
        signal: event.signal,
        sessionId: ctx.sessionManager.getSessionId(),
      });

      for await (const update of stream) {
        if (update.type === "text_delta") {
          preview += update.delta;
          updatePreview();
        }
      }
      const response = await stream.result();
      event.signal.throwIfAborted();
      if (response.stopReason !== "stop") {
        throw new Error(response.errorMessage ?? `Handoff ended with ${response.stopReason}`);
      }
      if (response.content.some((block) => block.type === "toolCall")) {
        throw new Error("Handoff returned a tool call instead of text");
      }
      const summary = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      if (!summary.trim()) throw new Error("Handoff response was empty");

      pi.appendEntry(HANDOFF_ENTRY, { prompt });
      const boundary = ctx.sessionManager.getLeafEntry();
      if (boundary?.type !== "custom" || boundary.customType !== HANDOFF_ENTRY) {
        throw new Error("Could not establish the handoff boundary");
      }

      return {
        compaction: {
          summary,
          firstKeptEntryId: boundary.id,
          tokensBefore: event.preparation.tokensBefore,
          usage: response.usage,
          details: { prompt },
        },
      };
    } catch (error) {
      if (!event.signal.aborted) {
        ctx.ui.notify(`Handoff failed; compaction cancelled: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
      return { cancel: true };
    } finally {
      if (ctx.hasUI) ctx.ui.setWidget(HANDOFF_ENTRY, undefined);
    }
  });
}
