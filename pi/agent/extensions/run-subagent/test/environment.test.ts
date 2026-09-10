import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedEnvironmentArgs, shellEscape } from "../environment.ts";

test("fallback launches use parent credentials and fresh pane context, not the server environment", () => {
  const parent = {
    PATH: process.env.PATH,
    PARENT_KEY: "parent's secret\nwith a newline",
    HERDR_SOCKET_PATH: "/wrong.sock",
    HERDR_PANE_ID: "wrong-pane",
    PI_SESSION_ID: "parent-session",
    TERM: "parent-terminal",
  };
  const command = [
    ...isolatedEnvironmentArgs(parent),
    shellEscape(process.execPath), "-e", shellEscape("console.log(JSON.stringify(process.env))"),
  ].join(" ");
  const child = JSON.parse(execFileSync("/bin/sh", ["-c", command], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SERVER_ONLY_KEY: "another parent's secret",
      HERDR_SOCKET_PATH: "/correct.sock",
      HERDR_PANE_ID: "correct-pane",
      HERDR_ENV: "1",
      TERM: "xterm-256color",
    },
  }));
  assert.equal(child.PARENT_KEY, parent.PARENT_KEY);
  assert.equal(child.SERVER_ONLY_KEY, undefined);
  assert.equal(child.PI_SESSION_ID, undefined);
  assert.equal(child.HERDR_SOCKET_PATH, "/correct.sock");
  assert.equal(child.HERDR_PANE_ID, "correct-pane");
  assert.equal(child.HERDR_ENV, "1");
  assert.equal(child.TERM, "xterm-256color");
  assert.equal(child.HERDR_CONFIG_PATH, undefined);
});
