import type { AssistantImages, ImageApi, ImageModel, ImagesContext, ImagesOptions, Provider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { stripVTControlCharacters } from "node:util";

const MAX_ERROR_BODY_BYTES = 16 * 1024;
const MAX_ERROR_DETAIL_CHARS = 4000;

const IMAGE_MODEL: ImageModel<ImageApi> = {
	type: "image",
	provider: "openai-codex",
	id: "gpt-image-2.5-sunburst",
	name: "GPT Image 2.5 Sunburst (unverified selection)",
	api: "chatgpt-images",
	baseUrl: "https://chatgpt.com/backend-api/codex",
	input: ["text", "image"],
	output: ["image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function accountIdFromToken(token: string): string {
	try {
		const claims: unknown = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
		const auth = isRecord(claims) ? claims["https://api.openai.com/auth"] : undefined;
		if (isRecord(auth) && typeof auth.chatgpt_account_id === "string" && auth.chatgpt_account_id) {
			return auth.chatgpt_account_id;
		}
	} catch {}
	throw new Error("ChatGPT images require a subscription login. Run /login openai-codex.");
}

function tokenCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

async function responseErrorDetail(
	response: Response,
	signal: AbortSignal,
	secrets: string[],
): Promise<string | undefined> {
	if (!response.body) return undefined;
	const reader = response.body.getReader();
	const bytes = new Uint8Array(MAX_ERROR_BODY_BYTES);
	let length = 0;

	try {
		while (true) {
			signal.throwIfAborted();
			const chunk = await reader.read();
			if (chunk.done) break;
			if (length + chunk.value.byteLength > bytes.byteLength) return undefined;
			bytes.set(chunk.value, length);
			length += chunk.value.byteLength;
		}
		signal.throwIfAborted();
		const body: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
		if (!isRecord(body) || !isRecord(body.error)) return undefined;
		const detail = [body.error.message, body.error.code, body.error.type]
			.find((value): value is string => typeof value === "string" && !!value.trim());
		if (!detail) return undefined;
		let sanitized = detail;
		for (const secret of secrets) {
			if (secret) sanitized = sanitized.split(secret).join("[redacted]");
		}
		sanitized = stripVTControlCharacters(sanitized)
			.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!sanitized) return undefined;
		return sanitized.length > MAX_ERROR_DETAIL_CHARS
			? `${sanitized.slice(0, MAX_ERROR_DETAIL_CHARS)}… [truncated]`
			: sanitized;
	} catch {
		signal.throwIfAborted();
		return undefined;
	} finally {
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

async function generateImages(
	model: ImageModel<ImageApi>,
	context: ImagesContext,
	options: ImagesOptions = {},
): Promise<AssistantImages> {
	const result: AssistantImages = {
		api: model.api,
		provider: model.provider,
		model: model.id,
		output: [],
		stopReason: "error",
		timestamp: Date.now(),
	};

	try {
		options.signal?.throwIfAborted();
		if (!options.apiKey) throw new Error("Run /login openai-codex to use ChatGPT images.");
		const accountId = accountIdFromToken(options.apiKey);
		const prompt = context.input
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");
		if (!prompt.trim()) throw new Error("Provide a text prompt for image generation or editing.");
		const images = context.input
			.filter((block) => block.type === "image")
			.map((block) => ({ image_url: `data:${block.mimeType};base64,${block.data}` }));
		const payload = {
			model: model.id,
			prompt,
			quality: "auto",
			size: "auto",
			background: "auto",
			...(images.length ? { images } : {}),
		};
		const body = (await options.onPayload?.(payload, model)) ?? payload;
		const headers = new Headers({
			Authorization: `Bearer ${options.apiKey}`,
			"ChatGPT-Account-Id": accountId,
			"Content-Type": "application/json",
			Accept: "application/json",
			originator: "pi",
			"x-codex-image-turn-id": randomUUID(),
		});
		for (const [name, value] of Object.entries({ ...model.headers, ...options.headers })) {
			if (value === null) headers.delete(name);
			else if (value !== undefined) headers.set(name, value);
		}
		const timeout = AbortSignal.timeout(options.timeoutMs ?? 300_000);
		const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
		const path = images.length ? "images/edits" : "images/generations";
		const response = await (options.fetch ?? fetch)(`${model.baseUrl.replace(/\/$/, "")}/${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal,
			redirect: "error",
		});
		result.responseId = response.headers.get("x-codex-imagegen-request-id")?.trim() || undefined;
		await options.onResponse?.({
			status: response.status,
			headers: Object.fromEntries(response.headers),
		}, model);
		if (!response.ok) {
			const detail = await responseErrorDetail(response, signal, [options.apiKey, accountId]);
			const advice = response.status === 401
				? " Run /login openai-codex again."
				: response.status === 403
					? " Your ChatGPT account may not have access to Codex image generation."
					: response.status === 429
						? " Your subscription image-generation limit may be exhausted; try later."
						: "";
			const reason = detail ? `: ${detail}` : ".";
			throw new Error(`ChatGPT image request failed (HTTP ${response.status})${reason}${advice}`);
		}
		const data: unknown = await response.json();
		if (!isRecord(data) || !Array.isArray(data.data) || !data.data.length) {
			throw new Error("ChatGPT returned no generated images.");
		}
		result.output = data.data.map((item) => {
			if (!isRecord(item) || typeof item.b64_json !== "string" || !item.b64_json) {
				throw new Error("ChatGPT returned invalid image data.");
			}
			return { type: "image", data: item.b64_json, mimeType: "image/png" };
		});
		if (isRecord(data.usage)) {
			const input = tokenCount(data.usage.input_tokens);
			const output = tokenCount(data.usage.output_tokens);
			result.usage = {
				input,
				output,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: tokenCount(data.usage.total_tokens) || input + output,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			};
		}
		signal.throwIfAborted();
		result.stopReason = "stop";
	} catch (error) {
		result.output = [];
		result.stopReason = options.signal?.aborted ? "aborted" : "error";
		result.errorMessage = error instanceof Error ? error.message : "ChatGPT image generation failed.";
	}
	return result;
}

export default function chatgptImagesExtension(pi: ExtensionAPI) {
	let registeredProvider: Provider | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (registeredProvider &&
			ctx.modelRegistry.getRegisteredNativeProvider(IMAGE_MODEL.provider) === registeredProvider) {
			return;
		}
		const codex = ctx.modelRegistry.getProvider(IMAGE_MODEL.provider);
		if (!codex) throw new Error("This Pi version does not include the openai-codex provider.");
		const provider: Provider = {
			...codex,
			getAllModels: () => [
				...(codex.getAllModels?.() ?? codex.getModels())
					.filter((model) => model.type !== "image" || model.id !== IMAGE_MODEL.id),
				IMAGE_MODEL,
			],
			generateImages: async (model, context, options) => {
				if (model.api === IMAGE_MODEL.api) return generateImages(model, context, options);
				if (codex.generateImages) return codex.generateImages(model, context, options);
				return {
					api: model.api,
					provider: model.provider,
					model: model.id,
					output: [],
					stopReason: options?.signal?.aborted ? "aborted" : "error",
					timestamp: Date.now(),
					errorMessage: `Provider ${codex.id} has no image implementation for "${model.api}"`,
				};
			},
		};
		pi.registerProvider(provider);
		registeredProvider = provider;
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (registeredProvider &&
			ctx.modelRegistry.getRegisteredNativeProvider(IMAGE_MODEL.provider) === registeredProvider) {
			pi.unregisterProvider(IMAGE_MODEL.provider);
		}
		registeredProvider = undefined;
	});
}
