import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import codexUsageExtension from "../index.ts";

async function flushRequests() {
	await new Promise<void>((resolve) => setImmediate(resolve));
}

function setup() {
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	let status: string | undefined;
	let command!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
	const notifications: string[] = [];
	const token = `header.${Buffer.from(JSON.stringify({
		"https://api.openai.com/auth": { chatgpt_account_id: "test-account" },
	})).toString("base64url")}.signature`;
	const ctx = {
		hasUI: true,
		isIdle: () => true,
		model: { provider: "openai-codex" },
		modelRegistry: { getApiKeyForProvider: async () => token },
		ui: {
			notify: (message: string) => { notifications.push(message); },
			setStatus: (_key: string, value: string | undefined) => { status = value; },
			theme: { fg: (_color: string, value: string) => value },
		},
	} as unknown as ExtensionContext;
	codexUsageExtension({
		registerCommand: (_name: string, definition: { handler: typeof command }) => { command = definition.handler; },
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
			handlers.set(name, handler);
		},
	} as unknown as ExtensionAPI);
	return {
		ctx,
		token,
		status: () => status,
		notifications,
		usage: () => command("", ctx as ExtensionCommandContext),
		emit: async (name: string) => {
			await handlers.get(name)?.({}, ctx);
			await flushRequests();
		},
	};
}

test("shows both remaining windows using pi authentication", async (t) => {
	const extension = setup();
	t.mock.method(Date, "now", () => 1_000_000);
	t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
		const headers = new Headers(init.headers);
		assert.equal(headers.get("Authorization"), `Bearer ${extension.token}`);
		assert.equal(headers.get("ChatGPT-Account-Id"), "test-account");
		return Response.json({ rate_limit: {
			primary_window: { used_percent: 18, limit_window_seconds: 18000, reset_at: 8200 },
			secondary_window: { used_percent: 36, limit_window_seconds: 604800, reset_after_seconds: 277200 },
		} });
	});
	await extension.emit("agent_settled");
	assert.equal(extension.status(), "82%↻2h 64%↻3d5h");
});

test("handles missing windows without inventing quota or reset times", async (t) => {
	const extension = setup();
	t.mock.method(globalThis, "fetch", async () => Response.json({ rate_limit: {
		primary_window: null,
		secondary_window: { used_percent: 105 },
	} }));
	await extension.emit("agent_settled");
	assert.equal(extension.status(), "0%");
});

test("replaces stale usage when the endpoint fails or returns no windows", async (t) => {
	const extension = setup();
	const responses = [
		Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }),
		new Response(null, { status: 401 }),
		Response.json({ rate_limit: null }),
		new Error("network failure"),
	];
	t.mock.method(globalThis, "fetch", async () => {
		const response = responses.shift()!;
		if (response instanceof Error) throw response;
		return response;
	});
	await extension.emit("agent_settled");
	assert.match(extension.status()!, /80%/);
	for (let attempt = 0; attempt < 3; attempt++) {
		await extension.emit("agent_settled");
		assert.equal(extension.status(), "Codex: unavailable");
	}
});

test("skips other providers and headless runs", async (t) => {
	const extension = setup();
	const fetch = t.mock.method(globalThis, "fetch", async () => {
		throw new Error("unexpected request");
	});
	extension.ctx.model = { provider: "anthropic" } as ExtensionContext["model"];
	await extension.emit("agent_settled");
	extension.ctx.model = { provider: "openai-codex" } as ExtensionContext["model"];
	extension.ctx.hasUI = false;
	await extension.emit("agent_settled");
	assert.equal(fetch.mock.callCount(), 0);
	assert.equal(extension.status(), undefined);
});

test("discards an in-flight result after switching models", async (t) => {
	const extension = setup();
	let finish!: (response: Response) => void;
	let started!: () => void;
	const fetching = new Promise<void>((resolve) => { started = resolve; });
	t.mock.method(globalThis, "fetch", () => {
		started();
		return new Promise<Response>((resolve) => { finish = resolve; });
	});
	const pending = extension.emit("agent_settled");
	await fetching;
	extension.ctx.model = { provider: "anthropic" } as ExtensionContext["model"];
	await extension.emit("model_select");
	finish(Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }));
	await pending;
	assert.equal(extension.status(), undefined);
});

test("loads usage on startup and when selecting Codex", async (t) => {
	const extension = setup();
	extension.ctx.model = { provider: "anthropic" } as ExtensionContext["model"];
	const fetch = t.mock.method(globalThis, "fetch", async () =>
		Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }));
	await extension.emit("session_start");
	assert.equal(fetch.mock.callCount(), 0);
	extension.ctx.model = { provider: "openai-codex" } as ExtensionContext["model"];
	await extension.emit("model_select");
	assert.equal(extension.status(), "80%");
	await extension.emit("session_start");
	assert.equal(fetch.mock.callCount(), 2);
});

test("polls during work and stops after the final refresh", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const extension = setup();
	const fetch = t.mock.method(globalThis, "fetch", async () =>
		Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }));
	await extension.emit("agent_start");
	assert.equal(fetch.mock.callCount(), 1);
	t.mock.timers.tick(30_000);
	await flushRequests();
	assert.equal(fetch.mock.callCount(), 2);
	await extension.emit("agent_settled");
	assert.equal(fetch.mock.callCount(), 3);
	t.mock.timers.tick(60_000);
	await flushRequests();
	assert.equal(fetch.mock.callCount(), 3);
});

test("keeps usage visible, skips overlapping polls, and queues the final refresh", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const extension = setup();
	let finish!: (response: Response) => void;
	const fetch = t.mock.method(globalThis, "fetch", async () =>
		Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }));
	await extension.emit("session_start");
	fetch.mock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
	await extension.emit("agent_start");
	assert.equal(extension.status(), "80%");
	t.mock.timers.tick(60_000);
	await flushRequests();
	assert.equal(fetch.mock.callCount(), 2);
	await extension.emit("agent_settled");
	assert.equal(fetch.mock.callCount(), 2);
	finish(Response.json({ rate_limit: { primary_window: { used_percent: 30 } } }));
	await flushRequests();
	assert.equal(fetch.mock.callCount(), 3);
});

test("shutdown cancels requests and polling without restoring status", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const extension = setup();
	let finish!: (response: Response) => void;
	let signal!: AbortSignal;
	const fetch = t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
		signal = init.signal!;
		return new Promise<Response>((resolve) => { finish = resolve; });
	});
	await extension.emit("agent_start");
	await extension.emit("session_shutdown");
	assert.equal(signal.aborted, true);
	finish(Response.json({ rate_limit: { primary_window: { used_percent: 20 } } }));
	await flushRequests();
	t.mock.timers.tick(60_000);
	await flushRequests();
	assert.equal(fetch.mock.callCount(), 1);
	assert.equal(extension.status(), undefined);
});

test("shows a reset indicator only for a positive available count", async (t) => {
	const extension = setup();
	let count: unknown = 1;
	t.mock.method(globalThis, "fetch", async () => Response.json({
		rate_limit: { primary_window: { used_percent: 20 } },
		rate_limit_reset_credits: { available_count: count },
	}));
	await extension.emit("session_start");
	assert.match(extension.status()!, / ⟲1$/);
	for (count of [0, -1, "1", null]) {
		await extension.emit("agent_settled");
		assert.equal(extension.status(), "80%");
	}
});

test("usage lists available resets and expiry without consuming them", async (t) => {
	const extension = setup();
	const expiry = "2026-10-22T12:00:00Z";
	t.mock.method(Date, "now", () => Date.parse("2026-10-17T08:00:00Z"));
	t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
		assert.equal(init.method ?? "GET", "GET");
		if (url.endsWith("/usage")) return Response.json({});
		assert.ok(url.endsWith("/rate-limit-reset-credits"));
		assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${extension.token}`);
		return Response.json({ available_count: 2, credits: [
			{ status: "available", title: "Full reset", expires_at: expiry },
			{ status: "redeemed", title: "Used reset" },
			{ status: "expired", title: "Expired reset" },
		] });
	});
	await extension.usage();
	const message = extension.notifications[0];
	assert.match(message, /2 usage limit resets available/);
	assert.match(message, /Full reset/);
	assert.ok(message.includes(new Date(expiry).toLocaleString()));
	assert.match(message, /5d4h left/);
	assert.doesNotMatch(message, /Used reset|Expired reset/);
});

test("usage distinguishes no resets from unavailable reset details", async (t) => {
	const extension = setup();
	extension.ctx.model = { provider: "anthropic" } as ExtensionContext["model"];
	const responses = [
		Response.json({ available_count: 0, credits: [] }),
		Response.json({}),
		new Response(null, { status: 401 }),
	];
	t.mock.method(globalThis, "fetch", async () => responses.shift()!);
	await extension.usage();
	assert.match(extension.notifications[0], /no usage limit resets available/);
	await extension.usage();
	await extension.usage();
	assert.match(extension.notifications[1], /unavailable/);
	assert.match(extension.notifications[2], /unavailable/);
});
