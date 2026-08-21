import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
  keyHint,
  truncateHead,
  type ExtensionAPI,
  type Theme,
} from "@earendil-works/pi-coding-agent";

interface FetchWebArgs {
  urls: string[];
  objective?: string;
}

interface SearchWebArgs {
  objective: string;
  search_queries: string[];
}

interface ParallelExtractResponse {
  extract_id: string;
  results: Array<{
    url: string;
    title?: string | null;
    publish_date?: string | null;
    excerpts: string[];
    full_content?: string | null;
  }>;
  errors: Array<{
    url: string;
    error_type: string;
    http_status_code: number | null;
    content: string | null;
  }>;
  warnings?: Array<{
    type: string;
    message: string;
    detail?: Record<string, unknown> | null;
  }> | null;
  usage?: Array<{ name: string; count: number }> | null;
  session_id: string;
}

interface ParallelSearchResponse {
  search_id: string;
  results: Array<{
    url: string;
    title?: string | null;
    publish_date?: string | null;
    excerpts: string[];
  }>;
  warnings?: Array<{
    type: string;
    message: string;
    detail?: Record<string, unknown> | null;
  }> | null;
  usage?: Array<{ name: string; count: number }> | null;
  session_id: string;
}

function getApiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;

  const error = body.error;
  if (!error || typeof error !== "object" || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

async function callParallel<T>(
  endpoint: "extract" | "search",
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const apiKey = process.env.PARALLEL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PARALLEL_API_KEY is not configured.");
  }

  const response = await fetch(`https://api.parallel.ai/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal,
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Parallel ${endpoint} returned an invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = getApiErrorMessage(body);
    throw new Error(
      `Parallel ${endpoint} failed (HTTP ${response.status})${message ? `: ${message}` : "."}`,
    );
  }

  return body as T;
}

function isExtractResponse(body: unknown): body is ParallelExtractResponse {
  return !!body &&
    typeof body === "object" &&
    "extract_id" in body &&
    typeof body.extract_id === "string" &&
    "session_id" in body &&
    typeof body.session_id === "string" &&
    "results" in body &&
    Array.isArray(body.results) &&
    "errors" in body &&
    Array.isArray(body.errors);
}

function isSearchResponse(body: unknown): body is ParallelSearchResponse {
  return !!body &&
    typeof body === "object" &&
    "search_id" in body &&
    typeof body.search_id === "string" &&
    "session_id" in body &&
    typeof body.session_id === "string" &&
    "results" in body &&
    Array.isArray(body.results);
}

async function formatResult(result: unknown) {
  const output = JSON.stringify(result);
  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) return truncation.content;

  const directory = await mkdtemp(join(tmpdir(), "pi-web-"));
  const outputPath = join(directory, "output.json");
  await writeFile(outputPath, output, "utf8");

  return `${truncation.content}\n\n[Output truncated: showing ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}. Full output saved to: ${outputPath}]`;
}

function compactText(value: string, maxLength = 120): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

type WebResult = {
  url: string;
  title?: string | null;
  publish_date?: string | null;
  excerpts: string[];
  full_content?: string | null;
};

type WebError = ParallelExtractResponse["errors"][number];
type WebWarning = NonNullable<ParallelExtractResponse["warnings"]>[number];
type WebToolDetails = {
  results: WebResult[];
  errors: WebError[];
  warnings: WebWarning[];
};

function getResultTitle(result: WebResult): string {
  if (result.title?.trim()) return compactText(result.title);

  const content = result.full_content || result.excerpts.join("\n");
  const heading = content.match(/^#{1,6}\s+(.+?)\s*#*$/m)?.[1];
  return compactText(heading || result.url);
}

function getResultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function getToolDetails(
  results: WebResult[],
  errors: WebError[] = [],
  warnings: WebWarning[] = [],
): WebToolDetails {
  return {
    results: results.map((result) => ({
      url: result.url,
      title: getResultTitle(result),
      publish_date: result.publish_date,
      excerpts: result.excerpts.slice(0, 1).map((excerpt) => compactText(excerpt, 500)),
    })),
    errors,
    warnings,
  };
}

function parseWebToolDetails(value: unknown): WebToolDetails | undefined {
  if (!value || typeof value !== "object" || !("results" in value) || !Array.isArray(value.results)) {
    return undefined;
  }

  const errors = "errors" in value && Array.isArray(value.errors) ? value.errors : [];
  const warnings = "warnings" in value && Array.isArray(value.warnings) ? value.warnings : [];
  return { results: value.results as WebResult[], errors, warnings };
}

function renderWebResult(
  results: WebResult[],
  errors: WebError[],
  warnings: WebWarning[],
  expanded: boolean,
  includeExcerpts: boolean,
  theme: Theme,
): string {
  const resultLabel = `${results.length} ${results.length === 1 ? "source" : "sources"}`;
  let text = results.length === 0
    ? theme.fg("muted", "No sources")
    : theme.fg("success", resultLabel);
  const firstResult = results[0];

  if (!expanded) {
    if (firstResult) {
      text += theme.fg("dim", " · ") + theme.fg("toolOutput", getResultTitle(firstResult));
      if (results.length > 1) text += theme.fg("dim", ` · +${results.length - 1} more`);
    }
    if (errors.length > 0) {
      text += theme.fg("dim", " · ") + theme.fg("error", `${errors.length} failed`);
    }
    if (warnings.length > 0) {
      text += theme.fg("dim", " · ") + theme.fg("warning", `${warnings.length} warnings`);
    }
    if (results.length + errors.length + warnings.length > 0) {
      text += theme.fg("dim", ` · ${keyHint("app.tools.expand", "sources")}`);
    }
    return text;
  }

  for (const [index, result] of results.entries()) {
    const metadata = result.publish_date ? ` · ${compactText(result.publish_date, 40)}` : "";
    text += `\n${theme.fg("muted", `${index + 1}. `)}${theme.fg("toolOutput", getResultTitle(result))}`;
    text += `\n   ${theme.fg("accent", result.url)}${theme.fg("dim", metadata)}`;

    const excerpt = result.excerpts[0];
    if (includeExcerpts && excerpt) {
      text += `\n   ${theme.fg("dim", compactText(excerpt, 180))}`;
    }
  }

  if (errors.length > 0) {
    text += `\n${theme.fg("error", `${errors.length} failed`)}`;
    for (const error of errors) {
      const message = compactText(error.content || error.error_type);
      text += `\n   ${theme.fg("accent", error.url)}${theme.fg("dim", ` · ${message}`)}`;
    }
  }

  if (warnings.length > 0) {
    text += `\n${theme.fg("warning", `${warnings.length} warnings`)}`;
    for (const warning of warnings) {
      text += `\n   ${theme.fg("dim", compactText(warning.message))}`;
    }
  }

  return text;
}

const outputLimit = `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; full output is saved to a temporary file.`;

const fetchWebTool = defineTool({
  name: "fetch_web",
  label: "Fetch Web",
  description: `Fetches content from specific web pages. Returns the full page when no objective is provided, or the content most relevant to an objective. ${outputLimit}`,
  parameters: Type.Object(
    {
      urls: Type.Array(Type.String(), {
        minItems: 1,
        maxItems: 20,
        description: "The public web page URLs to fetch.",
      }),
      objective: Type.Optional(
        Type.String({
          maxLength: 5000,
          description: "Optional natural-language description of what to extract. Omit it to fetch each entire page.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  async execute(_toolCallId, args, signal, _onUpdate, ctx) {
    const input = args as FetchWebArgs;
    const result = await callParallel<ParallelExtractResponse>(
      "extract",
      {
        ...input,
        session_id: ctx.sessionManager.getSessionId(),
        client_model: ctx.model?.id,
      },
      signal,
    );

    if (!isExtractResponse(result)) {
      throw new Error("Parallel Extract returned an unexpected response.");
    }

    const { results, errors } = result;
    const warnings = result.warnings ?? [];
    return {
      content: [{ type: "text", text: await formatResult({ results, errors, warnings }) }],
      details: getToolDetails(results, errors, warnings),
    };
  },
  renderCall(args, theme, context) {
    const urls = args.urls ?? [];
    const urlCount = `${urls.length} ${urls.length === 1 ? "URL" : "URLs"}`;
    let text = theme.fg("toolTitle", theme.bold("fetch_web ")) + theme.fg("muted", urlCount);

    if (!context.expanded) {
      if (urls[0]) text += ` ${theme.fg("dim", compactText(urls[0], 80))}`;
      if (urls.length > 1) text += theme.fg("dim", ` +${urls.length - 1}`);
      return new Text(text, 0, 0);
    }

    for (const url of urls) {
      text += `\n${theme.fg("dim", "• ")}${theme.fg("accent", url)}`;
    }
    if (args.objective) {
      text += `\n${theme.fg("muted", "Objective: ")}${theme.fg("toolOutput", args.objective)}`;
    }
    return new Text(text, 0, 0);
  },
  renderResult(result, { expanded }, theme, context) {
    const details = parseWebToolDetails(result.details);
    if (!details) {
      const text = compactText(getResultText(result), 240) || "No output";
      return new Text(theme.fg(context.isError ? "error" : "toolOutput", text), 0, 0);
    }

    const { results, errors, warnings } = details;
    return new Text(renderWebResult(results, errors, warnings, expanded, true, theme), 0, 0);
  },
});

const searchWebTool = defineTool({
  name: "search_web",
  label: "Search Web",
  description: `Search the web and return results with titles, URLs, and content excerpts. ${outputLimit}`,
  parameters: Type.Object(
    {
      objective: Type.String({
        maxLength: 5000,
        description: "A concise, self-contained research goal. Include the key entity or topic, context, source preferences, and freshness needs.",
      }),
      search_queries: Type.Array(Type.String({ maxLength: 200 }), {
        minItems: 1,
        maxItems: 3,
        description: "Exactly 3 keyword search queries of 3-6 words each. Must be diverse — vary entity names, synonyms, and angles. Each query must include the key entity or topic. NEVER write sentences, instructions, or use site: operators.",
      }),
    },
    { additionalProperties: false },
  ),
  async execute(_toolCallId, args, signal, _onUpdate, ctx) {
    const input = args as SearchWebArgs;
    const result = await callParallel<ParallelSearchResponse>(
      "search",
      {
        ...input,
        mode: "fast",
        session_id: ctx.sessionManager.getSessionId(),
        client_model: ctx.model?.id,
      },
      signal,
    );

    if (!isSearchResponse(result)) {
      throw new Error("Parallel Search returned an unexpected response.");
    }

    const { results } = result;
    const warnings = result.warnings ?? [];
    return {
      content: [{ type: "text", text: await formatResult({ results, warnings }) }],
      details: getToolDetails(results, [], warnings),
    };
  },
  renderCall(args, theme, context) {
    let text = theme.fg("toolTitle", theme.bold("search_web"));
    if (args.objective) {
      text += ` ${theme.fg("accent", compactText(args.objective, context.expanded ? 5000 : 120))}`;
    }
    if (context.expanded && args.search_queries?.length) {
      text += `\n${theme.fg("muted", "Queries:")}`;
      for (const query of args.search_queries) {
        text += `\n${theme.fg("dim", `• ${query}`)}`;
      }
    }
    return new Text(text, 0, 0);
  },
  renderResult(result, { expanded }, theme, context) {
    const details = parseWebToolDetails(result.details);
    if (!details) {
      const text = compactText(getResultText(result), 240) || "No output";
      return new Text(theme.fg(context.isError ? "error" : "toolOutput", text), 0, 0);
    }

    const { results, warnings } = details;
    return new Text(renderWebResult(results, [], warnings, expanded, true, theme), 0, 0);
  },
});

export default function webExtension(pi: ExtensionAPI) {
  pi.registerTool(fetchWebTool);
  pi.registerTool(searchWebTool);
}
