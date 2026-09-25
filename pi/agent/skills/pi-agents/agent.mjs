#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const help = `Usage:
  agent.mjs [options] "prompt"
  agent.mjs [options] --stdin
  agent.mjs wait AGENT [--keep]
  agent.mjs read AGENT

Launch one fresh Pi agent in an unfocused Herdr tab. By default, wait,
without a time limit, print its final response, and close the created tab.

  --detach            Return a JSON handle after submitting, without waiting
  --stdin             Read the prompt from stdin
  --workspace ID      Default: HERDR_WORKSPACE_ID
  --cwd PATH          Default: current directory
  --provider NAME     Default: PI_PROVIDER
  --model NAME        Default: PI_MODEL
  --thinking LEVEL    Default: PI_REASONING_LEVEL
  --keep              Leave the tab open after wait returns the response
  --help              Show this help

wait waits for completion, prints the response, and closes the tab unless
focused or --keep is set. read prints a completed response without waiting or closing.
Both reject unfinished, failed, or unrelated responses. Errors leave the
agent open. Handles are retained in XDG_STATE_HOME/pi-agents (or ~/.local/state/pi-agents).
`;

export function promptHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function messageText(message) {
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("");
}

export function finalResponse(entries, expectedPromptHash) {
  const messages = entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
  const userIndex = messages.findLastIndex((message) => message.role === "user");
  if (userIndex < 0 || promptHash(messageText(messages[userIndex])) !== expectedPromptHash) {
    throw new Error("The active session branch does not end with the assigned task.");
  }
  const response = messages.slice(userIndex + 1).findLast((message) => message.role === "assistant");
  if (response?.stopReason === "length") throw new Error("The final assistant response was truncated by the model.");
  if (response?.stopReason !== "stop") {
    throw new Error(`No successful final assistant response (${response?.stopReason ?? "missing"}).`);
  }
  const text = messageText(response);
  if (!text.trim()) throw new Error("The final assistant response has no text.");
  return text;
}

export async function loadSessionManager() {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    const executable = join(directory, "pi");
    try {
      accessSync(executable, constants.X_OK);
    } catch {
      continue;
    }
    let directoryPath = dirname(realpathSync(executable));
    while (dirname(directoryPath) !== directoryPath) {
      for (const packagePath of [directoryPath, join(directoryPath, "node_modules", "@earendil-works/pi-coding-agent")]) {
        try {
          const manifest = JSON.parse(readFileSync(join(packagePath, "package.json"), "utf8"));
          if (manifest.name === "@earendil-works/pi-coding-agent") {
            const sdk = await import(pathToFileURL(join(packagePath, manifest.main)).href);
            return sdk.SessionManager;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      directoryPath = dirname(directoryPath);
    }
    throw new Error("The pi executable must belong to an installed @earendil-works/pi-coding-agent package.");
  }
  throw new Error("pi is not on PATH.");
}

function herdr(...args) {
  let output;
  try {
    output = execFileSync("herdr", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw new Error(`herdr ${args.slice(0, 2).join(" ")} failed: ${error.stderr || error.stdout || error.message}`);
  }
  const response = JSON.parse(output);
  if (response.error) throw new Error(JSON.stringify(response.error));
  if (!response.result) throw new Error("Herdr returned no result.");
  return response.result;
}

function statePath(agent) {
  if (!/^worker-[a-f0-9]{24}$/.test(agent)) throw new Error("Expected an agent handle created by this script.");
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "pi-agents", `${agent}.json`);
}

function save(record) {
  const path = statePath(record.agent);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

function handle(record) {
  return { agent: record.agent, workspace: record.workspace, tab: record.tab, pane: record.pane, session: record.session };
}

function inspect(record) {
  const { agent } = herdr("agent", "get", record.agent);
  if (agent.pane_id !== record.pane || agent.tab_id !== record.tab || agent.workspace_id !== record.workspace) {
    throw new Error("Agent location changed; refusing to collect or close it.");
  }
  const session = agent.agent_session;
  if (session?.kind !== "path") throw new Error("Herdr has not reported a Pi session path.");
  if (record.session && record.session !== session.value) throw new Error("Agent session changed.");
  record.session = session.value;
  save(record);
  return agent;
}

async function collect(record, SessionManager, close) {
  const agent = inspect(record);
  if (!["idle", "done"].includes(agent.agent_status)) throw new Error(`Agent is ${agent.agent_status}; not complete.`);
  if (!statSync(record.session).size) throw new Error("Session has not been persisted yet.");
  const session = SessionManager.open(record.session);
  const text = finalResponse(session.getBranch(), record.promptHash);
  process.stdout.write(`${text}\n`);
  if (close && !agent.focused) {
    herdr("tab", "close", record.tab);
    record.closed = true;
    save(record);
  } else if (close) {
    process.stderr.write("Leaving the focused agent tab open.\n");
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      detach: { type: "boolean" },
      keep: { type: "boolean" },
      stdin: { type: "boolean" },
      workspace: { type: "string" },
      cwd: { type: "string" },
      provider: { type: "string" },
      model: { type: "string" },
      thinking: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (values.keep && (positionals[0] !== "wait" || positionals.length !== 2)) {
    throw new Error("--keep is only supported by wait.");
  }
  const SessionManager = await loadSessionManager();
  let record;
  try {
    if (["wait", "read"].includes(positionals[0]) && positionals.length === 2) {
      const allowedOptions = positionals[0] === "wait" ? ["keep"] : [];
      if (Object.keys(values).some((key) => !allowedOptions.includes(key))) {
        throw new Error("wait accepts only --keep; read accepts no options.");
      }
      record = JSON.parse(readFileSync(statePath(positionals[1]), "utf8"));
      if (record.closed) {
        const session = SessionManager.open(record.session);
        process.stdout.write(`${finalResponse(session.getBranch(), record.promptHash)}\n`);
        return;
      }
      if (positionals[0] === "wait") herdr("agent", "wait", record.agent);
      await collect(record, SessionManager, positionals[0] === "wait" && !values.keep);
      return;
    }
    if (values.stdin ? positionals.length !== 0 : positionals.length !== 1) throw new Error(help);
    const task = values.stdin ? readFileSync(0, "utf8") : positionals[0];
    if (!task.trim()) throw new Error("The prompt must not be empty.");
    const workspace = values.workspace ?? process.env.HERDR_WORKSPACE_ID;
    const cwd = resolve(values.cwd ?? process.cwd());
    if (!workspace) throw new Error("Set HERDR_WORKSPACE_ID or pass --workspace.");
    if (!statSync(cwd).isDirectory()) throw new Error("--cwd must be a directory.");
    const args = [];
    for (const [option, environment] of [["provider", "PI_PROVIDER"], ["model", "PI_MODEL"], ["thinking", "PI_REASONING_LEVEL"]]) {
      const value = values[option] ?? process.env[environment];
      if (!value) throw new Error(`Set ${environment} or pass --${option}.`);
      args.push(`--${option}`, value);
    }
    const prompt = `${task}\n\nDo not delegate further.`;
    record = { agent: `worker-${randomUUID().replaceAll("-", "").slice(0, 24)}`, workspace, promptHash: promptHash(prompt) };
    save(record);
    const created = herdr("tab", "create", "--workspace", workspace, "--cwd", cwd, "--no-focus");
    record.tab = created.tab?.tab_id;
    record.pane = created.root_pane?.pane_id;
    save(record);
    if (!record.tab || !record.pane || created.tab.workspace_id !== workspace) {
      throw new Error(`Unexpected tab creation result: ${JSON.stringify(created)}`);
    }
    process.stderr.write(`${JSON.stringify(handle(record))}\n`);
    herdr("agent", "start", record.agent, "--kind", "pi", "--pane", record.pane, "--", ...args);
    inspect(record);
    herdr("agent", "prompt", record.agent, prompt, ...(values.detach ? [] : ["--wait"]));
    if (values.detach) process.stdout.write(`${JSON.stringify(handle(record))}\n`);
    else await collect(record, SessionManager, true);
  } catch (error) {
    if (record) process.stderr.write(`Recovery handle: ${JSON.stringify(handle(record))}\n`);
    throw error;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
