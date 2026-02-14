import * as path from "node:path";
import {
  convertToLlm,
  serializeConversation,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionEntry,
} from "@mariozechner/pi-coding-agent";
import {
  buildWorkflowContext,
  buildWorkflowTask,
  findLastAssistantText,
  loadWorkflowDefinitions,
  restoreState,
  stateToEntry,
  type ActiveWorkflowState,
  type WorkflowDefinition,
  utcTimestamp,
  workflowRunnerConstants,
  writeStepOutput,
} from "./lib";

const { INTERNAL_NEXT_COMMAND, INTERNAL_STOP_COMMAND, STATE_ENTRY_TYPE } = workflowRunnerConstants;
const STATUS_KEY = "workflow-runner";

export default function workflowRunnerExtension(pi: ExtensionAPI) {
  let activeWorkflow: ActiveWorkflowState | null = null;
  let awaitingWorkflowRun = false;
  let workflowCommandsLoaded = false;

  async function persistState() {
    pi.appendEntry(STATE_ENTRY_TYPE, stateToEntry(activeWorkflow));
  }

  function updateStatus(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    if (!activeWorkflow) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const total = activeWorkflow.steps.length;
    const stepNumber = Math.min(activeWorkflow.currentStepIndex + 1, total);
    const mode = awaitingWorkflowRun ? "running" : "ready";
    ctx.ui.setStatus(STATUS_KEY, `wf /${activeWorkflow.workflowSlug} ${stepNumber}/${total} ${mode}`);
  }

  async function queueNextStep(ctx: ExtensionContext) {
    if (!activeWorkflow) return;

    if (ctx.isIdle()) {
      pi.sendUserMessage(`/${INTERNAL_NEXT_COMMAND}`);
    } else {
      pi.sendUserMessage(`/${INTERNAL_NEXT_COMMAND}`, { deliverAs: "followUp" });
    }
  }

  function serializeCurrentConversation(ctx: ExtensionCommandContext): string {
    const messages = ctx.sessionManager
      .getBranch()
      .filter((entry): entry is SessionEntry & { type: "message" } => entry.type === "message")
      .map((entry) => entry.message)
      .filter((message) => message.role === "user" || message.role === "assistant");

    return serializeConversation(convertToLlm(messages));
  }

  async function executeCurrentStep(ctx: ExtensionCommandContext) {
    if (!activeWorkflow) return;

    const step = activeWorkflow.steps[activeWorkflow.currentStepIndex];
    if (!step) {
      activeWorkflow = null;
      awaitingWorkflowRun = false;
      await persistState();
      updateStatus(ctx);
      return;
    }

    if (!ctx.isIdle()) await ctx.waitForIdle();

    const parentSession = ctx.sessionManager.getSessionFile();
    const switched = parentSession ? await ctx.newSession({ parentSession }) : await ctx.newSession();
    if (switched.cancelled) {
      if (ctx.hasUI) ctx.ui.notify("Workflow step cancelled (session switch blocked)", "warning");
      return;
    }

    activeWorkflow.waitingForWorkflowStepPrompt = true;
    awaitingWorkflowRun = true;
    await persistState();
    updateStatus(ctx);

    if (ctx.hasUI) {
      ctx.ui.notify(
        `Workflow /${activeWorkflow.workflowSlug}: step ${activeWorkflow.currentStepIndex + 1}/${activeWorkflow.steps.length} -> ${step.invocation}`,
        "info",
      );
    }

    pi.sendUserMessage(step.invocation);
  }

  function registerWorkflowCommand(workflow: WorkflowDefinition) {
    pi.registerCommand(workflow.slug, {
      description: workflow.description || `Run workflow /${workflow.slug}`,
      handler: async (args, ctx) => {
        if (activeWorkflow) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `Workflow already running: /${activeWorkflow.workflowSlug}. Stop it with /${INTERNAL_STOP_COMMAND} first.`,
              "warning",
            );
          }
          return;
        }

        const conversationContext = serializeCurrentConversation(ctx);
        const task = buildWorkflowTask(conversationContext, args);

        activeWorkflow = {
          workflowSlug: workflow.slug,
          workflowDescription: workflow.description,
          workflowSourcePath: workflow.sourcePath,
          task,
          runDir: path.join(ctx.cwd, ".workflow", `${workflow.slug}-${utcTimestamp()}`),
          startedAt: new Date().toISOString(),
          steps: workflow.steps,
          currentStepIndex: 0,
          waitingForWorkflowStepPrompt: false,
        };

        await persistState();
        updateStatus(ctx);
        await executeCurrentStep(ctx);
      },
    });
  }

  async function ensureWorkflowCommands(ctx: ExtensionContext) {
    if (workflowCommandsLoaded) return;

    const workflows = await loadWorkflowDefinitions(ctx.cwd);
    for (const workflow of workflows) {
      registerWorkflowCommand(workflow);
    }

    workflowCommandsLoaded = true;
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureWorkflowCommands(ctx);

    activeWorkflow = restoreState(ctx.sessionManager.getEntries(), STATE_ENTRY_TYPE);
    awaitingWorkflowRun = false;
    updateStatus(ctx);

    if (!ctx.hasUI || !activeWorkflow) return;

    const step = activeWorkflow.steps[activeWorkflow.currentStepIndex];
    if (!step) return;

    ctx.ui.notify(
      `Restored workflow /${activeWorkflow.workflowSlug} at step ${activeWorkflow.currentStepIndex + 1}/${activeWorkflow.steps.length}`,
      "info",
    );
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (!activeWorkflow || !awaitingWorkflowRun || !activeWorkflow.waitingForWorkflowStepPrompt) return;

    const currentStep = activeWorkflow.steps[activeWorkflow.currentStepIndex];
    if (!currentStep) return;

    activeWorkflow.waitingForWorkflowStepPrompt = false;
    await persistState();
    updateStatus(ctx);

    return {
      message: {
        customType: "workflow-runner-context",
        content: buildWorkflowContext(activeWorkflow, currentStep),
        display: false,
      },
    };
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!activeWorkflow || !awaitingWorkflowRun) return;

    const step = activeWorkflow.steps[activeWorkflow.currentStepIndex];
    if (!step) {
      activeWorkflow = null;
      awaitingWorkflowRun = false;
      await persistState();
      updateStatus(ctx);
      return;
    }

    const output = findLastAssistantText(event.messages);
    const outputPath = await writeStepOutput(activeWorkflow, step, output);

    activeWorkflow.currentStepIndex += 1;
    awaitingWorkflowRun = false;

    if (activeWorkflow.currentStepIndex >= activeWorkflow.steps.length) {
      const completed = activeWorkflow;
      activeWorkflow = null;
      await persistState();
      updateStatus(ctx);

      if (ctx.hasUI) {
        ctx.ui.notify(`Workflow /${completed.workflowSlug} finished. Artifacts: ${completed.runDir}`, "info");
      }
      return;
    }

    await persistState();
    updateStatus(ctx);
    if (ctx.hasUI) ctx.ui.notify(`Saved step output -> ${outputPath}`, "info");
    await queueNextStep(ctx);
  });

  pi.registerCommand(INTERNAL_NEXT_COMMAND, {
    description: "Internal workflow step runner",
    handler: async (_args, ctx) => {
      await executeCurrentStep(ctx);
    },
  });

  pi.registerCommand(INTERNAL_STOP_COMMAND, {
    description: "Stop active workflow",
    handler: async (_args, ctx) => {
      if (!activeWorkflow) {
        if (ctx.hasUI) ctx.ui.notify("No active workflow", "info");
        return;
      }

      const stopped = activeWorkflow;
      activeWorkflow = null;
      awaitingWorkflowRun = false;
      await persistState();
      updateStatus(ctx);
      if (ctx.hasUI) ctx.ui.notify(`Stopped workflow /${stopped.workflowSlug}`, "warning");
    },
  });

}
