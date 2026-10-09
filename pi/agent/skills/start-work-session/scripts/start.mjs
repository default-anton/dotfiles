#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const usage = `Usage: start.mjs (--branch NAME | --feature REF_OR_URL) --prompt TEXT [options]

  --repo PATH         Repository (default: current directory)
  --base REF          Base for a new branch (default: repository default branch)
  --model MODEL       Pi model (default: gpt-6-astra:medium)
  --prompt-file PATH  Read the prompt from a file instead of --prompt
  --help              Print this usage

Reuses the task's worktree and Herdr workspace. If Pi already exists there,
returns its location without sending the prompt again or changing its model.
Prints one JSON result. Does not wait for implementation to finish.`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.error?.message || result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout.trim();
}

function herdr(...args) {
  return JSON.parse(run("herdr", args)).result;
}

function git(...args) {
  return run("git", args);
}

function refExists(ref) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", ref]);
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(`Cannot check Git reference ${ref}`);
  }
  return result.status === 0;
}

function featureBranch(repo, feature) {
  const reference = feature.startsWith("https://")
    ? new URL(feature).pathname.split("/").filter(Boolean).at(-1)
    : feature;
  if (!/^(?:[A-Z]+-\d+(?:-\d+)?|\d+)$/i.test(reference || "")) {
    throw new Error("Expected an Aha! feature reference or URL.");
  }
  const prefix = reference.toUpperCase();
  const branches = git("for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes/origin")
    .split("\n")
    .map((ref) => ref.replace(/^refs\/(?:heads|remotes\/origin)\//, ""))
    .filter((branch) => branch === prefix || branch.startsWith(`${prefix}-`));
  const matches = [...new Set(branches)];
  if (matches.length > 1) {
    throw new Error(`Multiple branches match ${prefix}; use --branch: ${matches.join(", ")}`);
  }
  if (matches.length === 1) return matches[0];
  const branch = run("bash", [join(repo, "script/branch_name_for_aha_record.sh"), feature]);
  if (branch === feature) throw new Error("The project helper could not resolve the feature branch.");
  return branch;
}

function availableShell(pane) {
  if (pane.agent) return false;
  const info = herdr("pane", "process-info", "--pane", pane.pane_id).process_info;
  return info.foreground_processes.length === 1 &&
    info.foreground_processes[0].pid === info.shell_pid;
}

function parseOptions() {
  const options = {};
  const valueOptions = new Set([
    "branch", "feature", "prompt", "prompt-file", "repo", "base", "model",
  ]);
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index].replace(/^--/, "");
    if (args[index] === "--help") {
      console.log(usage);
      process.exit(0);
    }
    if (args[index].startsWith("--") && valueOptions.has(name)) {
      if (index + 1 === args.length || args[index + 1].startsWith("--")) {
        throw new Error(`Missing value for --${name}`);
      }
      options[name] = args[++index];
    } else {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  if (Boolean(options.branch) === Boolean(options.feature)) {
    throw new Error("Specify exactly one of --branch and --feature.");
  }
  if (Boolean(options.prompt) === Boolean(options["prompt-file"])) {
    throw new Error("Specify exactly one of --prompt and --prompt-file.");
  }
  return options;
}

function main() {
  const options = parseOptions();
  const prompt = options["prompt-file"]
    ? readFileSync(resolve(options["prompt-file"]), "utf8")
    : options.prompt;
  if (!prompt.trim()) throw new Error("The prompt cannot be empty.");
  process.chdir(options.repo || process.cwd());
  const repo = git("rev-parse", "--show-toplevel");
  process.chdir(repo);

  const branch = options.feature
    ? featureBranch(repo, options.feature)
    : options.branch;
  if (branch.startsWith("-")) throw new Error("Branch names cannot start with '-'.");
  git("check-ref-format", "--branch", branch);
  const model = options.model || "gpt-6-astra:medium";
  const commonDir = realpathSync(git("rev-parse", "--git-common-dir"));
  const key = createHash("sha256")
    .update(JSON.stringify([process.env.HERDR_SOCKET_PATH || "", commonDir, branch]))
    .digest("hex").slice(0, 20);
  const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "pi-work-sessions");
  mkdirSync(cache, { recursive: true });
  const lock = join(cache, `${key}.lock`);
  try {
    mkdirSync(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`A launch is already in progress. If it was interrupted, inspect Herdr before removing ${lock}`);
  }

  let location = {};
  try {
    const entries = git("worktree", "list", "--porcelain", "-z").split("\0\0");
    const existing = entries.map((entry) => entry.split("\0"))
      .find((fields) => fields.includes(`branch refs/heads/${branch}`));
    let worktree;
    if (existing) {
      if (existing.some((field) => field === "locked initializing" || field.startsWith("prunable"))) {
        throw new Error("The task worktree is still initializing or is unavailable.");
      }
      worktree = realpathSync(existing[0].slice("worktree ".length));
    } else {
      const args = ["--yes", "switch", "--format", "json", "--no-cd"];
      if (!refExists(`refs/heads/${branch}`) && !refExists(`refs/remotes/origin/${branch}`)) {
        args.push("--create", "--base", options.base || "^");
      }
      args.push(branch);
      const result = JSON.parse(run("wt", args));
      if (!result.path) throw new Error("Worktrunk returned no worktree path.");
      worktree = realpathSync(result.path);
    }
    location = { worktree, branch };
    const panes = herdr("pane", "list").panes;
    const matching = panes.filter((pane) => {
      const cwd = pane.foreground_cwd || pane.cwd || "";
      return cwd === worktree || cwd.startsWith(`${worktree}/`);
    });
    const existingPi = matching.find((pane) => pane.agent === "pi");

    function report(status, pane, agentStatus) {
      console.log(JSON.stringify({
        ...location,
        status,
        workspace: pane.workspace_id,
        pane: pane.pane_id,
        agent_status: agentStatus,
        prompt_submitted: status === "started",
      }));
    }

    if (existingPi) {
      report("reused", existingPi, existingPi.agent_status);
      return;
    }

    let pane;
    if (matching.length) {
      pane = matching.find(availableShell);
      if (!pane) {
        pane = herdr("tab", "create", "--workspace", matching[0].workspace_id,
          "--cwd", worktree, "--no-focus").root_pane;
      }
    } else {
      pane = herdr("workspace", "create", "--cwd", worktree, "--no-focus").root_pane;
    }
    location = { ...location, pane: pane.pane_id, workspace: pane.workspace_id };
    const sessionName = `work-${key}`;
    let startupError;
    try {
      herdr("agent", "start", sessionName, "--kind", "pi", "--pane", pane.pane_id,
        "--", "--model", model, prompt);
    } catch (error) {
      startupError = error;
    }
    const agent = herdr("agent", "get", pane.pane_id).agent;
    if (agent.agent !== "pi" || agent.agent_status === "blocked") {
      throw new Error(`Pi is not ready. ${startupError?.message || "Inspect its pane."}`);
    }
    if (startupError && agent.agent_status !== "working") throw startupError;
    report("started", agent, agent.agent_status);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(location)}\n`);
    throw error;
  } finally {
    rmdirSync(lock);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
