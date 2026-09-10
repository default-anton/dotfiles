import assert from "node:assert/strict";
import { copyFileSync, chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { HerdrTerminal } from "../herdr.ts";

function fixture(t: TestContext, initial = {}, environment: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "pi-herdr-test-"));
  const binary = join(root, "herdr");
  copyFileSync(fileURLToPath(new URL("./fake-herdr.mjs", import.meta.url)), binary);
  chmodSync(binary, 0o700);
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify({ running: true, nextId: 1, workspaces: [], panes: [], ...initial }));
  writeFileSync(`${statePath}.calls`, "");
  const env = {
    PATH: process.env.PATH,
    HERDR_BIN_PATH: binary,
    FAKE_HERDR_STATE: statePath,
    ...environment,
  };
  const terminal = new HerdrTerminal({ env, startupTimeoutMs: 2_000 });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return {
    terminal,
    env,
    read: () => JSON.parse(readFileSync(statePath, "utf8")),
    write: (state: unknown) => writeFileSync(statePath, JSON.stringify(state)),
    calls: (): { session?: string; args: string[] }[] =>
      readFileSync(`${statePath}.calls`, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)),
  };
}

const input = { cwd: process.cwd(), taskTitle: "Review", parentSessionId: "parent-a" };

test("inside Herdr stays in the caller workspace and leaves it intact", async (t) => {
  const caller = { pane_id: "w0:p0", tab_id: "w0:t0", workspace_id: "w0" };
  const f = fixture(t, { workspaces: [{ workspace_id: "w0" }], panes: [caller] }, {
    HERDR_ENV: "1", HERDR_PANE_ID: caller.pane_id, HERDR_SOCKET_PATH: "/inherited.sock",
  });
  const layout = await f.terminal.createPane(input);
  await f.terminal.run(layout, "echo ready");
  assert.equal(f.terminal.isAlive(layout), true);
  await f.terminal.close(layout);
  assert.deepEqual(f.read().panes, [caller]);
  assert.equal(f.read().workspaces.length, 1);
  assert.ok(f.calls().every((call) => call.session === undefined));
  assert.equal(f.calls().filter((call) => call.args[0] === "server").length, 0);
});

test("broken or incomplete inherited Herdr context never starts a fallback", async (t) => {
  for (const environment of [{ HERDR_ENV: "1" }, { HERDR_PANE_ID: "missing" }]) {
    const f = fixture(t, {}, environment);
    await assert.rejects(f.terminal.createPane(input), /calling.*pane/);
    assert.equal(f.calls().filter((call) => call.args[0] === "server").length, 0);
  }
});

test("concurrent fallback runs share startup and panes, with explicit routing throughout", async (t) => {
  const f = fixture(t, { running: false, startDelay: 100 }, { HERDR_SOCKET_PATH: "/unrelated.sock" });
  const notices: string[] = [];
  const layouts = await Promise.all(Array.from({ length: 8 }, () =>
    f.terminal.createPane({ ...input, onFallback: (command) => notices.push(command) })
  ));
  assert.equal(f.calls().filter((call) => call.args[0] === "server").length, 1);
  assert.equal(f.read().workspaces.length, 1);
  assert.equal(new Set(f.read().panes.map((pane: { tab_id: string }) => pane.tab_id)).size, 1);
  assert.equal(notices.length, 1);
  for (const layout of layouts) {
    await f.terminal.run(layout, "echo ready");
    assert.equal(f.terminal.isAlive(layout), true);
  }
  await Promise.all(layouts.map((layout) => f.terminal.close(layout)));
  assert.equal(f.read().panes.length, 0);
  assert.equal(f.read().workspaces.length, 0);
  assert.ok(f.calls().every((call) => call.session === "pi-subagents"));
  assert.ok(f.calls().every((call) => call.args.slice(0, 2).join(" ") !== "server stop"));
  await f.terminal.close(await f.terminal.createPane(input));
  assert.equal(f.calls().filter((call) => call.args[0] === "server").length, 1);
});

test("parent workspaces and user-added panes survive another parent's cleanup", async (t) => {
  const f = fixture(t);
  const a = await f.terminal.createPane(input);
  const b = await f.terminal.createPane({ ...input, parentSessionId: "parent-b" });
  const state = f.read();
  const aPane = state.panes.find((pane: { pane_id: string }) => pane.pane_id === a.childPaneId);
  state.panes.push({ ...aPane, pane_id: "user-pane" });
  f.write(state);
  await f.terminal.close(a);
  assert.equal(f.terminal.isAlive(b), true);
  assert.equal(f.read().workspaces.length, 2);
  await f.terminal.close(b);
  assert.deepEqual(f.read().panes.map((pane: { pane_id: string }) => pane.pane_id), ["user-pane"]);
  assert.equal(f.read().workspaces.length, 1);
});

test("cancelling one startup waiter does not cancel another", async (t) => {
  const f = fixture(t, { running: false, startDelay: 250 });
  const controller = new AbortController();
  const cancelled = f.terminal.createPane({ ...input, signal: controller.signal });
  const rejection = assert.rejects(cancelled, { name: "AbortError" });
  const surviving = f.terminal.createPane({ ...input, parentSessionId: "parent-b" });
  controller.abort();
  await rejection;
  const layout = await surviving;
  assert.equal(f.read().panes.length, 1);
  await f.terminal.close(layout);
});

test("startup failures report diagnostics and allow a later retry", async (t) => {
  const f = fixture(t, { running: false, startFailure: true });
  await assert.rejects(f.terminal.createPane(input), /cannot bind socket/);
  f.write({ ...f.read(), startFailure: false });
  await f.terminal.close(await f.terminal.createPane(input));
});

test("cancellation after pane creation prevents launch and permits cleanup", async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  const layout = await f.terminal.createPane(input);
  controller.abort();
  await assert.rejects(f.terminal.run(layout, "echo unwanted", controller.signal), { name: "AbortError" });
  await f.terminal.close(layout);
  assert.equal(f.read().panes.length, 0);
  assert.ok(f.calls().every((call) => call.args.slice(0, 2).join(" ") !== "pane run"));
});

test("a competing starter can win even when our server process exits", async (t) => {
  const f = fixture(t, { running: false, startRace: true });
  await f.terminal.close(await f.terminal.createPane(input));
});

test("connection errors and a missing binary do not trigger server replacement", async (t) => {
  const f = fixture(t, { probeFailure: "protocol_mismatch" });
  await assert.rejects(f.terminal.createPane(input), /protocol_mismatch/);
  assert.equal(f.calls().filter((call) => call.args[0] === "server").length, 0);
  const missing = new HerdrTerminal({ env: { HERDR_BIN_PATH: "/nonexistent/herdr" } });
  await assert.rejects(missing.createPane(input), /ENOENT/);
});

test("readiness is bounded and a pre-aborted call starts nothing", async (t) => {
  const f = fixture(t, { running: false, startDelay: 300 });
  const terminal = new HerdrTerminal({ env: f.env, startupTimeoutMs: 100 });
  await assert.rejects(terminal.createPane({ ...input, signal: AbortSignal.abort() }), { name: "AbortError" });
  assert.equal(f.calls().length, 0);
  await assert.rejects(terminal.createPane(input), /readiness timed out/);
  await sleep(350);
  assert.equal(f.read().panes.length, 0);
});
