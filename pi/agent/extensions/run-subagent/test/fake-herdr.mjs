#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const statePath = process.env.FAKE_HERDR_STATE;
const args = process.argv.slice(2);
let session;
if (args[0] === "--session") {
  session = args.splice(0, 2)[1];
}
appendFileSync(`${statePath}.calls`, `${JSON.stringify({ session, args })}\n`);
const load = () => JSON.parse(readFileSync(statePath, "utf8"));
const save = (state) => writeFileSync(statePath, JSON.stringify(state));
const state = load();
const flag = (name) => args[args.indexOf(name) + 1];
const result = (value) => {
  save(state);
  console.log(JSON.stringify({ result: value }));
};
const fail = (code, message = code) => {
  console.error(JSON.stringify({ error: { code, message } }));
  process.exit(1);
};

if (args[0] === "server") {
  if (state.startFailure) fail("startup_failed", "cannot bind socket");
  setTimeout(() => {
    const current = load();
    current.running = true;
    save(current);
    process.exit(state.startRace ? 1 : 0);
  }, state.startDelay ?? 0);
} else {
  if (state.probeFailure) fail(state.probeFailure);
  if (!state.running) fail("server_not_running");
  const command = args.slice(0, 2).join(" ");
  const newPane = (workspaceId, tabId) => {
    const pane = { workspace_id: workspaceId, tab_id: tabId, pane_id: `${workspaceId}:p${state.nextId++}` };
    state.panes.push(pane);
    return pane;
  };
  const pane = state.panes.find((pane) => pane.pane_id === (args.includes("--pane") ? flag("--pane") : args[2]));
  switch (command) {
    case "workspace list":
      result({ workspaces: state.workspaces });
      break;
    case "workspace create": {
      const workspace = { workspace_id: `w${state.nextId++}` };
      state.workspaces.push(workspace);
      const tab = { tab_id: `${workspace.workspace_id}:t${state.nextId++}` };
      result({ workspace, tab, root_pane: newPane(workspace.workspace_id, tab.tab_id) });
      break;
    }
    case "workspace close":
      if (state.panes.some((pane) => pane.workspace_id === args[2])) fail("workspace_not_empty");
      state.workspaces = state.workspaces.filter((workspace) => workspace.workspace_id !== args[2]);
      result({});
      break;
    case "tab create": {
      const tab = { tab_id: `${flag("--workspace")}:t${state.nextId++}` };
      result({ tab, root_pane: newPane(flag("--workspace"), tab.tab_id) });
      break;
    }
    case "pane list":
      result({ panes: state.panes.filter((pane) => !args.includes("--workspace") || pane.workspace_id === flag("--workspace")) });
      break;
    case "pane current":
    case "pane get":
      if (!pane) fail("not_found");
      result({ pane });
      break;
    case "pane layout":
      if (!pane) fail("not_found");
      result({ layout: { panes: state.panes.filter((other) => other.tab_id === pane.tab_id)
        .map((other) => ({ ...other, rect: { width: 120, height: 40 } })) } });
      break;
    case "pane split":
      if (!pane) fail("not_found");
      result({ pane: newPane(pane.workspace_id, pane.tab_id) });
      break;
    case "pane rename":
    case "pane run":
      if (!pane) fail("not_found");
      result({});
      break;
    case "pane close":
      state.panes = state.panes.filter((other) => other.pane_id !== args[2]);
      result({});
      break;
    default:
      fail("unknown_command");
  }
}
