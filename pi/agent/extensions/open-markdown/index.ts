import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import { open } from "glimpseui";
import { fileReferencePreviewPlugin, renderFileReferencePlaceholders } from "./file-reference-preview.ts";

const stylesheet = readFileSync(new URL("./markdown.css", import.meta.url), "utf8");
const windows = new Set<unknown>();

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface RenderEnv {
  headings: Heading[];
  slugCounts: Map<string, number>;
  cwd: string;
  filePreviewCount: number;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

markdown.use(fileReferencePreviewPlugin);

markdown.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const renderEnv = env as RenderEnv;
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  const level = Number(token.tag.slice(1));
  const text = nextToken?.type === "inline" ? nextToken.content : token.tag;
  const id = uniqueSlug(text, renderEnv.slugCounts);

  token.attrSet("id", id);
  renderEnv.headings.push({ level, text, id });

  return self.renderToken(tokens, index, options);
};

function uniqueSlug(text: string, counts: Map<string, number>): string {
  const base =
    text
      .normalize("NFKD")
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";

  const count = counts.get(base) ?? 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textFromAssistantContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block): block is { type: "text"; text: string } => {
      return !!block && typeof block === "object" && block.type === "text" && typeof block.text === "string";
    })
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function lastAssistantMarkdown(ctx: { sessionManager: { getBranch(): unknown[] } }): string | undefined {
  const branch = ctx.sessionManager.getBranch();

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i] as { type?: string; message?: { role?: string; content?: unknown } };
    if (entry.type !== "message" || entry.message?.role !== "assistant") {
      continue;
    }

    const text = textFromAssistantContent(entry.message.content);
    if (text) {
      return text;
    }
  }

  return undefined;
}

async function markdownSource(args: string, ctx: { cwd: string; sessionManager: { getBranch(): unknown[] } }) {
  const target = args.trim();
  if (!target) {
    return {
      title: "Pi: Last Assistant Message",
      markdown: lastAssistantMarkdown(ctx),
    };
  }

  const path = isAbsolute(target) ? target : resolve(ctx.cwd, target);
  return {
    title: `Pi: ${basename(path)}`,
    markdown: await readFile(path, "utf8"),
  };
}

function render(markdownText: string, title: string, cwd: string): string {
  const env: RenderEnv = { headings: [], slugCounts: new Map(), cwd, filePreviewCount: 0 };
  const body = renderFileReferencePlaceholders(markdown.render(markdownText, env), env);
  const toc = env.headings.length > 0 ? renderToc(env.headings) : "";
  const layoutClass = env.headings.length > 0 ? "layout has-toc" : "layout";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${stylesheet}</style>
</head>
<body>
  <main class="${layoutClass}">
    ${toc}
    <article class="content">${body}</article>
  </main>
</body>
</html>`;
}

function renderToc(headings: Heading[]): string {
  const links = headings
    .map((heading) => {
      return `<a class="level-${heading.level}" href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>`;
    })
    .join("\n");

  return `<nav class="toc" aria-label="Table of contents"><strong>Contents</strong>${links}</nav>`;
}

function trackWindow(win: unknown): void {
  windows.add(win);
  if (win && typeof win === "object" && "on" in win && typeof win.on === "function") {
    win.on("closed", () => windows.delete(win));
  }
}

export default function openMarkdownExtension(pi: ExtensionAPI) {
  pi.registerCommand("open", {
    description: "Open the last assistant markdown message, or a markdown file path, in Glimpse",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      let source: { title: string; markdown?: string };
      try {
        source = await markdownSource(args, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not read markdown: ${message}`, "error");
        return;
      }

      if (!source.markdown) {
        ctx.ui.notify("No assistant markdown message found", "warning");
        return;
      }

      const win = open(render(source.markdown, source.title, ctx.cwd), {
        width: 1150,
        height: 850,
        title: source.title,
        openLinks: true,
      });
      trackWindow(win);
    },
  });
}
