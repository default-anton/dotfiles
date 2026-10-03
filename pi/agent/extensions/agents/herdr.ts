import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ControlError } from "./schema";

const execute = promisify(execFile);

export type Pane = {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  agent?: string;
  agent_status?: string;
  agent_session?: { kind: string; value: string };
};

export async function herdr<T>(args: string[], timeout = 5000): Promise<T> {
  try {
    const { stdout } = await execute(process.env.HERDR_BIN_PATH || "herdr", args, {
      encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, HERDR_SOCKET_PATH: process.env.HERDR_SOCKET_PATH },
    });
    const response = JSON.parse(stdout);
    if (response.error || !response.result) throw new Error(response.error?.message ?? "Missing Herdr result.");
    return response.result as T;
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    throw new ControlError("herdr_failed", `Herdr ${args.slice(0, 2).join(" ")} failed: ${failure.stderr || failure.message}`);
  }
}

export async function currentPane() {
  const { pane } = await herdr<{ pane: Pane }>(["pane", "current", "--current"]);
  if (!pane?.workspace_id || !pane?.pane_id) throw new ControlError("herdr_context", "Herdr did not resolve the calling pane.");
  return pane;
}

export async function inventory() {
  const { agents } = await herdr<{ agents: Pane[] }>(["agent", "list"]);
  if (!Array.isArray(agents)) throw new ControlError("herdr_inventory", "Herdr returned no live agent inventory.");
  return agents.filter((pane) => pane.agent === "pi");
}

export async function isSolePane(expected: Pane) {
  const pane = await currentPane();
  if (pane.pane_id !== expected.pane_id || pane.tab_id !== expected.tab_id ||
    pane.workspace_id !== expected.workspace_id) return false;
  const { panes } = await herdr<{ panes: Pane[] }>(["pane", "list", "--workspace", pane.workspace_id]);
  if (!Array.isArray(panes)) throw new ControlError("herdr_inventory", "Herdr returned no pane inventory.");
  const siblings = panes.filter((candidate) => candidate.tab_id === pane.tab_id);
  return siblings.length === 1 && siblings[0].pane_id === pane.pane_id;
}
