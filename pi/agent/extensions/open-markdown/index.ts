import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createRequire } from "node:module";
import { basename, isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import MarkdownIt from "markdown-it";
import { open } from "glimpseui";

const require = createRequire(import.meta.url);
const windows = new Set<unknown>();

interface Heading {
  level: number;
  text: string;
  id: string;
}

interface RenderEnv {
  headings: Heading[];
  slugCounts: Map<string, number>;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

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

function picoCss(): string {
  try {
    return require("node:fs").readFileSync(require.resolve("@picocss/pico/css/pico.min.css"), "utf8");
  } catch {
    return "";
  }
}

function render(markdownText: string, title: string): string {
  const env: RenderEnv = { headings: [], slugCounts: new Map() };
  const body = markdown.render(markdownText, env);
  const toc = env.headings.length > 0 ? renderToc(env.headings) : "";
  const layoutClass = env.headings.length > 0 ? "layout has-toc" : "layout";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${picoCss()}</style>
  <style>
    :root {
      --pico-font-size: 100%;
      --pico-line-height: 1.62;
      --font-sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      --font-heading: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      --font-mono: ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace;
      --page-max-width: 1220px;
      --toc-width: 260px;
      --surface: color-mix(in srgb, var(--pico-background-color) 86%, var(--pico-card-background-color));
      --panel: color-mix(in srgb, var(--pico-card-background-color) 94%, var(--pico-primary) 6%);
    }

    html {
      scroll-behavior: smooth;
      font-family: var(--font-sans);
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 16px;
      letter-spacing: -0.006em;
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--pico-primary) 16%, transparent), transparent 34rem),
        linear-gradient(180deg, var(--surface), var(--pico-background-color));
    }

    .layout {
      max-width: var(--page-max-width);
      margin: 0 auto;
      padding: 36px 30px 64px;
    }

    .layout.has-toc {
      display: grid;
      grid-template-columns: var(--toc-width) minmax(0, 880px);
      gap: 34px;
      align-items: start;
    }

    .toc {
      display: block;
      position: sticky;
      top: 24px;
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: 18px;
      border: 1px solid color-mix(in srgb, var(--pico-muted-border-color) 78%, transparent);
      border-radius: 16px;
      background: color-mix(in srgb, var(--panel) 92%, transparent);
      box-shadow: 0 18px 50px color-mix(in srgb, var(--pico-color) 10%, transparent);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }

    .toc strong {
      display: block;
      margin-bottom: 12px;
      color: var(--pico-color);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .toc a {
      display: block !important;
      width: 100%;
      margin: 0;
      padding: 5px 8px;
      border-radius: 8px;
      color: var(--pico-muted-color);
      text-decoration: none;
      font-size: 0.84rem;
      font-weight: 500;
      line-height: 1.36;
    }

    .toc a:hover {
      color: var(--pico-primary);
      background: color-mix(in srgb, var(--pico-primary) 10%, transparent);
    }

    .toc .level-3 { padding-left: 20px; }
    .toc .level-4 { padding-left: 32px; }
    .toc .level-5, .toc .level-6 { padding-left: 44px; }

    .content {
      min-width: 0;
      padding: 38px 46px;
      border: 1px solid color-mix(in srgb, var(--pico-muted-border-color) 74%, transparent);
      border-radius: 18px;
      background: color-mix(in srgb, var(--pico-card-background-color) 96%, transparent);
      box-shadow: 0 20px 70px color-mix(in srgb, var(--pico-color) 8%, transparent);
      font-size: 1rem;
      line-height: 1.68;
    }

    .content > :first-child { margin-top: 0; }
    .content > :last-child { margin-bottom: 0; }
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
      scroll-margin-top: 24px;
      font-family: var(--font-heading);
      font-weight: 720;
      line-height: 1.18;
      letter-spacing: -0.035em;
      text-wrap: balance;
    }
    .content h1 { margin-bottom: 1.25rem; font-size: clamp(2rem, 4vw, 3rem); }
    .content h2 { margin-top: 2.5rem; padding-top: 0.45rem; border-top: 1px solid var(--pico-muted-border-color); font-size: 1.55rem; }
    .content h3 { margin-top: 1.9rem; font-size: 1.22rem; letter-spacing: -0.025em; }
    .content h4, .content h5, .content h6 { letter-spacing: -0.018em; }
    .content p, .content li { color: color-mix(in srgb, var(--pico-color) 88%, var(--pico-muted-color)); }
    .content p { margin-bottom: 1.05rem; }
    .content li { margin: 0.25rem 0; }
    .content blockquote { border-left-color: var(--pico-primary); background: color-mix(in srgb, var(--pico-primary) 7%, transparent); border-radius: 0 10px 10px 0; }
    .content pre { padding: 18px; overflow: auto; border-radius: 12px; border: 1px solid var(--pico-muted-border-color); line-height: 1.5; }
    .content code, .content kbd, .content samp, .content pre { font-family: var(--font-mono); font-size: 0.92em; font-variant-ligatures: none; }
    .content :not(pre) > code {
      padding: 0.15em 0.36em;
      border: 1px solid color-mix(in srgb, var(--pico-muted-border-color) 80%, transparent);
      border-radius: 6px;
      background: color-mix(in srgb, var(--pico-code-background-color, var(--pico-muted-border-color)) 72%, transparent);
      white-space: break-spaces;
    }
    .content code { white-space: pre-wrap; }
    .content pre code { padding: 0; border: 0; background: transparent; white-space: pre; }
    .content table { display: block; width: 100%; overflow-x: auto; }

    @media (max-width: 900px) {
      .layout.has-toc { display: block; }
      .toc { position: static; margin-bottom: 24px; }
      .content { padding: 28px 24px; }
    }
  </style>
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

      const win = open(render(source.markdown, source.title), {
        width: 1150,
        height: 850,
        title: source.title,
        openLinks: true,
      });
      trackWindow(win);
    },
  });
}
