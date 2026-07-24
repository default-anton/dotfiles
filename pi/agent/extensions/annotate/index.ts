import { realpath, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { annotateMarkdown } from "./annotator.ts";
import { formatAnnotationPrompt } from "./format-annotations.ts";

function unwrapPathArgument(args: string): string {
  let value = args.trim();

  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }

  if (value.startsWith("@")) {
    value = value.slice(1);
  }

  return value;
}

async function resolveMarkdownPath(args: string, cwd: string): Promise<string> {
  const requestedPath = unwrapPathArgument(args);
  if (!requestedPath) {
    throw new Error("Usage: /annotate <path-to-file.md>");
  }

  const path = await realpath(resolve(cwd, requestedPath));
  const info = await stat(path);

  if (!info.isFile()) {
    throw new Error("The selected path is not a file");
  }

  const extension = extname(path).toLowerCase();
  if (extension !== ".md" && extension !== ".markdown") {
    throw new Error("The selected file must be Markdown");
  }

  return path;
}

export default function annotateExtension(pi: ExtensionAPI) {
  pi.registerCommand("annotate", {
    description: "Annotate raw Markdown and insert or send the comments",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/annotate requires interactive mode", "error");
        return;
      }

      try {
        const path = await resolveMarkdownPath(args, ctx.cwd);
        await ctx.waitForIdle();

        ctx.ui.setStatus("annotate", "Annotating Markdown");

        const result = await annotateMarkdown(path, ctx.cwd);
        if (!result) {
          ctx.ui.notify("Annotation cancelled", "info");
          return;
        }

        if (result.annotations.length === 0) {
          ctx.ui.notify("No comments were added", "warning");
          return;
        }

        const message = formatAnnotationPrompt(result);

        if (result.action === "insert") {
          ctx.ui.setEditorText(message);
          ctx.ui.notify("Annotations inserted into the editor", "info");
          return;
        }

        if (ctx.isIdle()) {
          pi.sendUserMessage(message);
        } else {
          pi.sendUserMessage(message, { deliverAs: "followUp" });
          ctx.ui.notify("Annotations queued as a follow-up", "info");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Annotate failed: ${message}`, "error");
      } finally {
        ctx.ui.setStatus("annotate", undefined);
      }
    },
  });
}
