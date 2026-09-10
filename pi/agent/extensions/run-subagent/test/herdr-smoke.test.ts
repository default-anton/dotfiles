import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { isolatedEnvironmentArgs, shellEscape } from "../environment.ts";
import { HerdrTerminal, type HerdrLayout } from "../herdr.ts";

test("eight idle Pi processes run and clean up without a Herdr client", {
  skip: process.env.HERDR_SMOKE_TEST !== "1",
  timeout: 60_000,
}, async () => {
  const root = mkdtempSync("/tmp/pi-hs-");
  const sessionName = `pi-subagent-smoke-${process.pid}`;
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: root, PI_CODING_AGENT_DIR: join(root, "pi-agent") };
  for (const key of Object.keys(env)) {
    if (key.startsWith("HERDR_")) delete env[key];
  }
  const terminal = new HerdrTerminal({ env, sessionName });
  const layouts: HerdrLayout[] = [];
  const extensionPath = join(root, "ready.ts");
  writeFileSync(extensionPath, [
    'import { writeFileSync } from "node:fs";',
    "export default function (pi) {",
    '  pi.on("session_start", () => {',
    "    writeFileSync(process.env.SMOKE_READY_FILE, JSON.stringify({",
    "      paneId: process.env.HERDR_PANE_ID,",
    "      columns: process.stdout.columns,",
    "      rows: process.stdout.rows,",
    "    }));",
    "  });",
    "}",
  ].join("\n"));
  const herdr = (args: string[]) => execFileSync("herdr", ["--session", sessionName, ...args], {
    env, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      const layout = await terminal.createPane({
        cwd: root, parentSessionId: "smoke-parent", taskTitle: `Smoke ${index}`,
      });
      layouts.push(layout);
      const command = [
        ...isolatedEnvironmentArgs(env),
        `SMOKE_READY_FILE=${shellEscape(join(root, `ready-${index}.json`))}`,
        "pi", "--offline", "--no-session", "--no-extensions", "--no-skills",
        "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-tools",
        "-e", shellEscape(extensionPath),
      ].join(" ");
      const launchPath = join(root, `launch-${index}.sh`);
      writeFileSync(launchPath, `#!/bin/sh\nexec ${command}\n`, { mode: 0o700 });
      await terminal.run(layout, shellEscape(launchPath));
    }));
    const readyPaths = Array.from({ length: 8 }, (_, index) => join(root, `ready-${index}.json`));
    const deadline = Date.now() + 20_000;
    while (!readyPaths.every((path) => existsSync(path)) && Date.now() < deadline) {
      await sleep(100);
    }
    for (const path of readyPaths) {
      if (!existsSync(path)) {
        const output = herdr(["pane", "read", layouts[0].childPaneId, "--source", "recent-unwrapped", "--lines", "80"]);
        assert.fail(`Pi did not start: ${path}\n${output}`);
      }
      const ready = JSON.parse(readFileSync(path, "utf8"));
      assert.ok(layouts.some((layout) => layout.childPaneId === ready.paneId));
      assert.ok(ready.columns > 0 && ready.rows > 0, "Pi needs a nonempty PTY viewport");
    }
    const other = await terminal.createPane({
      cwd: root, parentSessionId: "other-parent", taskTitle: "Unrelated parent",
    });
    layouts.push(other);
    await Promise.all(layouts.slice(0, 8).map((layout) => terminal.close(layout)));
    assert.equal(terminal.isAlive(other), true);
    await terminal.close(other);
    const remaining = JSON.parse(herdr(["workspace", "list"]));
    assert.equal(remaining.result.workspaces.length, 0);
  } finally {
    await Promise.all(layouts.map((layout) => terminal.close(layout)));
    try {
      herdr(["session", "stop", sessionName, "--json"]);
    } catch (error) {
      if (layouts.length > 0) throw error;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
