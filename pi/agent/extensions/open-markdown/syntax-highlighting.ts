import { bundledLanguages, createHighlighter, type BundledLanguage, type BundledTheme, type Highlighter } from "shiki";

const LIGHT_THEME: BundledTheme = "github-light-default";
const DARK_THEME: BundledTheme = "github-dark-default";
const FALLBACK_LANGUAGE = "text";
const COMMON_LANGUAGES: BundledLanguage[] = [
  "bash",
  "c",
  "clojure",
  "cpp",
  "csharp",
  "css",
  "diff",
  "elixir",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "lua",
  "markdown",
  "php",
  "python",
  "ruby",
  "rust",
  "shellscript",
  "sql",
  "swift",
  "toml",
  "typescript",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "zsh",
];

const LANGUAGE_ALIASES = new Map<string, BundledLanguage>([
  ["c++", "cpp"],
  ["c#", "csharp"],
  ["js", "javascript"],
  ["md", "markdown"],
  ["sh", "shellscript"],
  ["ts", "typescript"],
  ["yml", "yaml"],
]);

export interface CodeHighlighter {
  ensureLanguages(languages: Iterable<string | undefined>): Promise<void>;
  renderBlock(code: string, language: string | undefined): string;
  renderLines(lines: string[], language: string): string[];
}

let highlighterPromise: Promise<ShikiCodeHighlighter> | undefined;

export function getCodeHighlighter(): Promise<CodeHighlighter> {
  highlighterPromise ??= createShikiCodeHighlighter();
  return highlighterPromise;
}

export function collectMarkdownCodeLanguages(markdownText: string): string[] {
  const languages = new Set<string>();
  const fencePattern = /^(?: {0,3})(`{3,}|~{3,})[ \t]*([^\s`~{]*)/gm;

  for (const match of markdownText.matchAll(fencePattern)) {
    if (match[2]) {
      languages.add(match[2]);
    }
  }

  return [...languages];
}

async function createShikiCodeHighlighter(): Promise<ShikiCodeHighlighter> {
  const highlighter = await createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: COMMON_LANGUAGES,
  });
  return new ShikiCodeHighlighter(highlighter);
}

class ShikiCodeHighlighter implements CodeHighlighter {
  private readonly highlighter: Highlighter;
  private loadedLanguages = new Set<string>(COMMON_LANGUAGES);
  private languageLoads = new Map<string, Promise<void>>();

  constructor(highlighter: Highlighter) {
    this.highlighter = highlighter;
  }

  async ensureLanguages(languages: Iterable<string | undefined>): Promise<void> {
    const loads: Promise<void>[] = [];

    for (const language of languages) {
      const normalized = normalizeLanguage(language);
      if (this.loadedLanguages.has(normalized) || !(normalized in bundledLanguages)) {
        continue;
      }

      let load = this.languageLoads.get(normalized);
      if (!load) {
        load = this.highlighter.loadLanguage(normalized as BundledLanguage).then(() => {
          this.loadedLanguages.add(normalized);
        });
        this.languageLoads.set(normalized, load);
        void load.then(
          () => this.languageLoads.delete(normalized),
          () => this.languageLoads.delete(normalized),
        );
      }
      loads.push(load);
    }

    await Promise.all(loads);
  }

  renderBlock(code: string, language: string | undefined): string {
    return this.highlighter.codeToHtml(code, {
      lang: normalizeLanguage(language),
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
    });
  }

  renderLines(lines: string[], language: string): string[] {
    const result = this.highlighter.codeToTokens(lines.join("\n"), {
      lang: normalizeLanguage(language),
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
    });

    return lines.map((_, index) => {
      const tokens = result.tokens[index] ?? [];
      return tokens.map((token) => `<span style="${styleToString(token.htmlStyle)}">${escapeHtml(token.content)}</span>`).join("");
    });
  }
}

function normalizeLanguage(language: string | undefined): BundledLanguage | "text" {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) {
    return FALLBACK_LANGUAGE;
  }

  const aliased = LANGUAGE_ALIASES.get(normalized) ?? normalized;
  return aliased in bundledLanguages ? (aliased as BundledLanguage) : FALLBACK_LANGUAGE;
}

function styleToString(style: Record<string, string | number> | string | undefined): string {
  if (!style) {
    return "";
  }

  if (typeof style === "string") {
    return style;
  }

  return Object.entries(style)
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(";");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}
