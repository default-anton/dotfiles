import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AssistantMessage, Message, StopReason, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type StepStatus = "success" | "error" | "aborted" | "no_output" | "process_error" | "timeout";

type StepStatusPayload = {
  status: StepStatus;
  stepId?: string;
  runId?: string;
  stopReason: StopReason | "unknown";
  errorMessage?: string;
  outputFile: string;
  finishedAt: string;
};

function isAssistantMessage(message: Message): message is AssistantMessage {
  return message.role === "assistant";
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((item): item is TextContent => item.type === "text")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildFailureArtifact(
  status: Exclude<StepStatus, "success">,
  stepId: string | undefined,
  stopReason: StopReason | "unknown",
  errorMessage: string | undefined,
): string {
  const lines = [
    `# Subagent step failed (${status})`,
    "",
    `- step: ${stepId ?? "unknown"}`,
    `- stopReason: ${stopReason}`,
  ];

  if (errorMessage) {
    lines.push(`- error: ${errorMessage}`);
  }

  return `${lines.join("\n")}\n`;
}

function classifyStatus(
  stopReason: StopReason | "unknown",
  text: string,
  errorMessage: string | undefined,
): StepStatus {
  if (stopReason === "error" || Boolean(errorMessage)) {
    return "error";
  }

  if (stopReason === "aborted") {
    return "aborted";
  }

  if (!text.trim()) {
    return "no_output";
  }

  return "success";
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export default function subagentRunBridge(pi: ExtensionAPI) {
  const outputFile = process.env.SUBAGENT_OUTPUT_FILE?.trim();
  const statusFile = process.env.SUBAGENT_STATUS_FILE?.trim();

  if (!outputFile || !statusFile) {
    return;
  }

  const stepId = process.env.SUBAGENT_STEP_ID?.trim() || undefined;
  const runId = process.env.SUBAGENT_RUN_ID?.trim() || undefined;
  let statusWritten = false;

  async function persistResult(
    status: StepStatus,
    stopReason: StopReason | "unknown",
    errorMessage: string | undefined,
    artifactMarkdown: string,
  ): Promise<void> {
    await writeAtomic(outputFile, artifactMarkdown.endsWith("\n") ? artifactMarkdown : `${artifactMarkdown}\n`);

    const payload: StepStatusPayload = {
      status,
      stepId,
      runId,
      stopReason,
      errorMessage,
      outputFile,
      finishedAt: new Date().toISOString(),
    };

    await writeAtomic(statusFile, `${JSON.stringify(payload, null, 2)}\n`);
    statusWritten = true;
  }

  pi.on("agent_end", async (event, ctx) => {
    try {
      const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
      const stopReason = lastAssistant?.stopReason ?? "unknown";
      const errorMessage = lastAssistant?.errorMessage?.trim() || undefined;
      const text = lastAssistant ? extractAssistantText(lastAssistant) : "";
      const status = classifyStatus(stopReason, text, errorMessage);

      const artifactMarkdown =
        status === "success" ? text : buildFailureArtifact(status, stepId, stopReason, errorMessage);

      await persistResult(status, stopReason, errorMessage, artifactMarkdown);
    } catch {
      // Wrapper fallback writes process_error if status file is missing.
    }

    ctx.shutdown();
  });

  pi.on("session_shutdown", async () => {
    if (statusWritten) {
      return;
    }

    try {
      const artifactExists = await fileExists(outputFile);
      const fallbackArtifact = artifactExists
        ? ""
        : buildFailureArtifact(
            "aborted",
            stepId,
            "aborted",
            "Session shutdown before subagent completion was captured.",
          );

      if (!artifactExists) {
        await writeAtomic(outputFile, fallbackArtifact);
      }

      const payload: StepStatusPayload = {
        status: "aborted",
        stepId,
        runId,
        stopReason: "aborted",
        errorMessage: "Session shutdown before subagent completion was captured.",
        outputFile,
        finishedAt: new Date().toISOString(),
      };

      await writeAtomic(statusFile, `${JSON.stringify(payload, null, 2)}\n`);
      statusWritten = true;
    } catch {
      // Wrapper fallback handles missing status file.
    }
  });
}
