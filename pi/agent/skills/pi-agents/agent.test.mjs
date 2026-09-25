import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { finalResponse, loadSessionManager, promptHash } from "./agent.mjs";

const script = fileURLToPath(new URL("agent.mjs", import.meta.url));
const SessionManager = await loadSessionManager();

test("the launcher runs through the installed skill symlink", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pi-agents-link-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const link = join(directory, "agent.mjs");
  symlinkSync(script, link);
  const result = spawnSync(process.execPath, [link, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length > 0);
});

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pi-agents-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const session = SessionManager.create(directory, directory);
  session.appendMessage({ role: "user", content: "Earlier task", timestamp: Date.now() });
  session.appendMessage({ role: "assistant", content: [{ type: "text", text: "Earlier answer" }], stopReason: "stop", timestamp: Date.now() });
  const sessionFile = session.getSessionFile();
  writeFileSync(join(directory, "herdr"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const directory = process.env.FIXTURE;
fs.appendFileSync(path.join(directory, "calls"), JSON.stringify(args) + "\\n");
const option = name => args[args.indexOf(name) + 1];
const stateFile = path.join(directory, "state");
let state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
let result = {};
if (args[0] === "tab" && args[1] === "create") {
  state.workspace = option("--workspace");
  result = {tab: {tab_id: "tab", workspace_id: state.workspace}, root_pane: {pane_id: "pane"}};
}
if (args[1] === "prompt") {
  state.submitted = true;
  if (process.env.SCENARIO !== "stale") {
    const entries = [
      {type: "message", id: "task", parentId: null, message: {role: "user", content: args[3]}},
      {type: "message", id: "answer", parentId: "task", message: {role: "assistant", content: [{type: "text", text: "Complete answer\\nsecond line"}], stopReason: "stop"}}
    ];
    fs.appendFileSync(process.env.SESSION, entries.map(entry => JSON.stringify(entry)).join("\\n") + "\\n");
  }
}
if (args[1] === "get") {
  result = {agent: {pane_id: "pane", tab_id: "tab", workspace_id: state.workspace,
    focused: process.env.SCENARIO === "focused",
    agent_status: state.submitted && process.env.SCENARIO === "blocked" ? "blocked" : "idle",
    agent_session: {kind: "path", value: process.env.SESSION}}};
}
fs.writeFileSync(stateFile, JSON.stringify(state));
if (args[1] === "prompt" && process.env.SCENARIO === "timeout") {
  console.log(JSON.stringify({error: {code: "timeout"}}));
  process.exit(1);
}
console.log(JSON.stringify({result}));
`, { mode: 0o700 });
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    XDG_STATE_HOME: directory,
    HERDR_WORKSPACE_ID: "current-workspace",
    PI_PROVIDER: "inherited-provider",
    PI_MODEL: "inherited-model",
    PI_REASONING_LEVEL: "high",
    FIXTURE: directory,
    SESSION: sessionFile,
    ...overrides,
  };
  return {
    run: (...args) => spawnSync(process.execPath, [script, ...args], { env, encoding: "utf8", timeout: 15000 }),
    calls: () => readFileSync(join(directory, "calls"), "utf8").trim().split("\n").map(JSON.parse),
  };
}

test("default launch inherits location/model and returns native session text before cleanup", (t) => {
  const agent = fixture(t);
  const result = agent.run("Do the task");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Complete answer\nsecond line\n");
  const calls = agent.calls();
  assert.deepEqual(calls[0], ["tab", "create", "--workspace", "current-workspace", "--cwd", process.cwd(), "--no-focus"]);
  const start = calls.find((args) => args[1] === "start");
  assert.deepEqual(start.slice(start.indexOf("--") + 1), ["--provider", "inherited-provider", "--model", "inherited-model", "--thinking", "high"]);
  const prompt = calls.find((args) => args[1] === "prompt");
  assert.deepEqual(prompt.slice(4), ["--wait"]);
  assert.deepEqual(calls.at(-1), ["tab", "close", "tab"]);
});

test("detached launch supports overrides, read preserves the tab, and wait collects and closes", (t) => {
  const agent = fixture(t);
  const launched = agent.run("--detach", "--workspace", "other-workspace", "--model", "other-model", "Do the task");
  assert.equal(launched.status, 0, launched.stderr);
  const handle = JSON.parse(launched.stdout);
  assert.equal(handle.workspace, "other-workspace");
  assert.ok(handle.session);
  assert.ok(!agent.calls().find((args) => args[1] === "prompt").includes("--wait"));
  assert.ok(agent.calls().find((args) => args[1] === "start").includes("other-model"));
  const read = agent.run("read", handle.agent);
  assert.equal(read.status, 0, read.stderr);
  assert.equal(read.stdout, "Complete answer\nsecond line\n");
  assert.ok(!agent.calls().some((args) => args[1] === "close"));
  const waited = agent.run("wait", handle.agent);
  assert.equal(waited.status, 0, waited.stderr);
  assert.equal(waited.stdout, read.stdout);
  assert.deepEqual(agent.calls().find((args) => args[1] === "wait"), ["agent", "wait", handle.agent]);
  assert.deepEqual(agent.calls().at(-1), ["tab", "close", "tab"]);
});

test("wait --keep returns the response and leaves the agent available for later collection", (t) => {
  const agent = fixture(t);
  const launched = agent.run("--detach", "Do the task");
  assert.equal(launched.status, 0, launched.stderr);
  const { agent: name } = JSON.parse(launched.stdout);
  const kept = agent.run("wait", name, "--keep");
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(kept.stdout, "Complete answer\nsecond line\n");
  assert.ok(agent.calls().some((args) => args[1] === "wait"));
  assert.ok(!agent.calls().some((args) => args[1] === "close"));
  const waited = agent.run("wait", name);
  assert.equal(waited.status, 0, waited.stderr);
  assert.equal(waited.stdout, kept.stdout);
  assert.deepEqual(agent.calls().at(-1), ["tab", "close", "tab"]);
});

test("--keep is rejected outside wait", (t) => {
  const agent = fixture(t);
  for (const args of [["--keep", "Do the task"], ["read", "worker-handle", "--keep"]]) {
    assert.notEqual(agent.run(...args).status, 0);
  }
});

for (const scenario of ["blocked", "stale", "timeout"]) {
  test(`${scenario} does not return a result, retry submission, or close the agent`, (t) => {
    const agent = fixture(t, { SCENARIO: scenario });
    const result = agent.run("Do the task");
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Recovery handle:/);
    assert.equal(agent.calls().filter((args) => args[1] === "prompt").length, 1);
    assert.ok(!agent.calls().some((args) => args[1] === "close"));
  });
}

test("a focused tab is left open after collecting its result", (t) => {
  const agent = fixture(t, { SCENARIO: "focused" });
  const result = agent.run("Do the task");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!agent.calls().some((args) => args[1] === "close"));
});

test("result extraction rejects unsuccessful, missing, and textless final responses", () => {
  const task = { type: "message", message: { role: "user", content: "task" } };
  for (const stopReason of ["error", "aborted", "toolUse", "length"]) {
    const response = { type: "message", message: { role: "assistant", stopReason, content: [{ type: "text", text: "not final" }] } };
    assert.throws(() => finalResponse([task, response], promptHash("task")));
  }
  assert.throws(() => finalResponse([task], promptHash("task")));
  const textless = { type: "message", message: { role: "assistant", stopReason: "stop", content: [{ type: "thinking", thinking: "private" }] } };
  assert.throws(() => finalResponse([task, textless], promptHash("task")));
});
