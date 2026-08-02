import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Type } from "@earendil-works/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
  truncateHead,
  type ExtensionAPI,
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

    const { results, errors, warnings } = result;
    return {
      content: [{ type: "text", text: await formatResult({ results, errors, warnings }) }],
      details: result,
    };
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
        mode: "turbo",
        session_id: ctx.sessionManager.getSessionId(),
        client_model: ctx.model?.id,
      },
      signal,
    );

    if (!isSearchResponse(result)) {
      throw new Error("Parallel Search returned an unexpected response.");
    }

    const { results, warnings } = result;
    return {
      content: [{ type: "text", text: await formatResult({ results, warnings }) }],
      details: result,
    };
  },
});

export default function webExtension(pi: ExtensionAPI) {
  pi.registerTool(fetchWebTool);
  pi.registerTool(searchWebTool);
}
