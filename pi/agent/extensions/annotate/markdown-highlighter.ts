import pierreDark from "@pierre/theme/pierre-dark";
import pierreLight from "@pierre/theme/pierre-light";
import {
  bundledLanguages,
  createHighlighter,
  createOnigurumaEngine,
  type BundledLanguage,
} from "shiki";

export interface MarkdownSyntaxToken {
  start: number;
  end: number;
  lightColor: string;
  darkColor: string;
  fontStyle: number;
}

export interface HighlightedMarkdown {
  tokens: MarkdownSyntaxToken[];
  lightForeground: string;
  lightBackground: string;
  darkForeground: string;
  darkBackground: string;
}

type ShikiHighlighter = Awaited<ReturnType<typeof createHighlighter>>;
type ShikiToken = {
  content: string;
  offset: number;
  color?: string;
  fontStyle?: number;
};
type PositionedToken = ShikiToken & { end: number };

let highlighterPromise: Promise<ShikiHighlighter> | undefined;

export async function highlightMarkdown(
  source: string,
): Promise<HighlightedMarkdown> {
  const highlighter = await getHighlighter();
  await loadFencedLanguages(highlighter, source);

  const light = highlighter.codeToTokens(source, {
    lang: "markdown",
    theme: "pierre-light",
  });
  const dark = highlighter.codeToTokens(source, {
    lang: "markdown",
    theme: "pierre-dark",
  });

  return {
    tokens: mergeThemeTokens(
      flattenTokens(light.tokens),
      flattenTokens(dark.tokens),
      light.fg,
      dark.fg,
    ),
    lightForeground: light.fg,
    lightBackground: light.bg,
    darkForeground: dark.fg,
    darkBackground: dark.bg,
  };
}

function getHighlighter(): Promise<ShikiHighlighter> {
  highlighterPromise ??= createHighlighter({
    themes: [pierreLight, pierreDark],
    langs: ["markdown"],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  });
  return highlighterPromise;
}

async function loadFencedLanguages(
  highlighter: ShikiHighlighter,
  source: string,
): Promise<void> {
  const loaded = new Set(highlighter.getLoadedLanguages());
  const languages = new Set<string>();
  const fencePattern = /^ {0,3}(?:`{3,}|~{3,})\s*([\w.+#-]+)/gm;

  for (const match of source.matchAll(fencePattern)) {
    const language = match[1]?.toLowerCase();
    if (language && language in bundledLanguages && !loaded.has(language)) {
      languages.add(language);
    }
  }

  await Promise.all(
    Array.from(languages, (language) =>
      highlighter.loadLanguage(language as BundledLanguage),
    ),
  );
}

function flattenTokens(lines: ShikiToken[][]): PositionedToken[] {
  return lines.flatMap((line) =>
    line
      .filter((token) => token.content.length > 0)
      .map((token) => ({ ...token, end: token.offset + token.content.length })),
  );
}

function mergeThemeTokens(
  lightTokens: PositionedToken[],
  darkTokens: PositionedToken[],
  lightForeground: string,
  darkForeground: string,
): MarkdownSyntaxToken[] {
  const boundaries = new Set<number>();
  for (const token of [...lightTokens, ...darkTokens]) {
    boundaries.add(token.offset);
    boundaries.add(token.end);
  }

  const points = Array.from(boundaries).sort((left, right) => left - right);
  const merged: MarkdownSyntaxToken[] = [];
  let lightIndex = 0;
  let darkIndex = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    while (lightTokens[lightIndex]?.end <= start) lightIndex += 1;
    while (darkTokens[darkIndex]?.end <= start) darkIndex += 1;

    const light = coveringToken(lightTokens[lightIndex], start, end);
    const dark = coveringToken(darkTokens[darkIndex], start, end);
    if (!light && !dark) continue;

    merged.push({
      start,
      end,
      lightColor: light?.color ?? lightForeground,
      darkColor: dark?.color ?? darkForeground,
      fontStyle: (light?.fontStyle ?? 0) | (dark?.fontStyle ?? 0),
    });
  }

  return merged;
}

function coveringToken(
  token: PositionedToken | undefined,
  start: number,
  end: number,
): PositionedToken | undefined {
  return token && token.offset <= start && token.end >= end ? token : undefined;
}
