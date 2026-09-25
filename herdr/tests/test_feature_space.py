import json
import os
from pathlib import Path
import pty
import select
import subprocess
import tempfile
import time
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "feature-space.sh"
PR_URL = "https://github.com/example/aha-app/pull/123"


class FeatureSpaceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.home = Path(self.directory.name)
        self.bin = self.home / "bin"
        self.bin.mkdir()
        self.repo = self.home / "code/aha-app"
        self.repo.mkdir(parents=True)
        self.worktree = str(self.home / "code/aha-app.review branch")
        self.log = self.home / "calls.jsonl"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "HERDR_ENV": "1",
            "CALL_LOG": str(self.log),
            "WORKTREE_PATH": self.worktree,
            "WORKTREE_EXISTS": "0",
            "PANES": "[]",
            "GH_FAIL": "0",
            "XDG_STATE_HOME": str(self.home / "state"),
            "WORKTREE_RELEASE": str(self.home / "release"),
        }
        mock = '''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys
import time

command = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALL_LOG"], "a") as log:
    log.write(json.dumps([command, *args]) + "\\n")
path = os.environ["WORKTREE_PATH"]
if command == "gh":
    if os.environ["GH_FAIL"] == "1":
        sys.exit(1)
    print("review-branch")
elif command == "git":
    if args[:2] == ["worktree", "list"]:
        if os.environ["WORKTREE_EXISTS"] == "1":
            sys.stdout.write(f"worktree {path}\\0HEAD abc\\0branch refs/heads/review-branch\\0\\0")
    elif args[0] == "show-ref":
        sys.exit(1)
    elif args[0] != "check-ref-format":
        sys.exit(2)
elif command == "wt":
    deadline = time.monotonic() + 10
    while not Path(os.environ["WORKTREE_RELEASE"]).exists():
        if time.monotonic() > deadline:
            sys.exit(1)
        time.sleep(0.05)
    print(json.dumps({"path": path}))
elif command == "herdr":
    if args == ["pane", "list"]:
        print(json.dumps({"result": {"panes": json.loads(os.environ["PANES"])}}))
    elif args[:2] == ["workspace", "create"]:
        print(json.dumps({"result": {"workspace": {"workspace_id": "new-space"}}}))
    elif args[:2] == ["workspace", "focus"]:
        pass
    elif args[:2] == ["notification", "show"]:
        pass
    else:
        sys.exit(2)
'''
        for name in ("git", "gh", "wt", "herdr"):
            path = self.bin / name
            path.write_text(mock)
            path.chmod(0o755)

    def run_script(self, url=PR_URL, succeeds=True, popup=False):
        if popup:
            pid, terminal = pty.fork()
            if pid == 0:
                os.execvpe("bash", ["bash", str(SCRIPT)], self.env)
            output = b""
            deadline = time.monotonic() + 5
            try:
                while b"Feature or PR URL: " not in output:
                    remaining = deadline - time.monotonic()
                    self.assertGreater(remaining, 0, output)
                    ready, _, _ = select.select([terminal], [], [], remaining)
                    self.assertTrue(ready, output)
                    output += os.read(terminal, 4096)
                os.write(terminal, (url + "\n").encode())
                while time.monotonic() < deadline:
                    exited, status = os.waitpid(pid, os.WNOHANG)
                    if exited:
                        self.assertEqual(os.waitstatus_to_exitcode(status), 0, output)
                        break
                    ready, _, _ = select.select([terminal], [], [], 0)
                    if ready:
                        output += os.read(terminal, 4096)
                    time.sleep(0.01)
                else:
                    self.fail(f"Popup did not close: {output!r}")
            finally:
                os.close(terminal)
        else:
            result = subprocess.run(
                ["bash", str(SCRIPT), url],
                env=self.env,
                stdin=subprocess.DEVNULL,
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
        Path(self.env["WORKTREE_RELEASE"]).touch()
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            calls = (
                [json.loads(line) for line in self.log.read_text().splitlines()]
                if self.log.exists() else []
            )
            notifications = [call for call in calls if call[:3] == ["herdr", "notification", "show"]]
            if notifications:
                title = "Space ready" if succeeds else "Space creation failed"
                self.assertEqual(notifications[0][3], title)
                if not succeeds:
                    logs = list((self.home / "state/herdr").glob("feature-space.*"))
                    self.assertEqual(len(logs), 1)
                    self.assertIn(str(logs[0]), notifications[0][5])
                    self.assertTrue(logs[0].read_text())
                return [call for call in calls if call[:3] != ["herdr", "notification", "show"]]
            time.sleep(0.05)
        self.fail("Background worker did not report completion")

    def assert_created_space(self, calls, focus=False):
        creations = [call for call in calls if call[:3] == ["herdr", "workspace", "create"]]
        self.assertEqual(len(creations), 1)
        self.assertIn("--focus" if focus else "--no-focus", creations[0])
        self.assertNotIn("--no-focus" if focus else "--focus", creations[0])
        self.assertEqual(creations[0][creations[0].index("--cwd") + 1], self.worktree)

    def test_reuses_space_with_pane_in_worktree_subdirectory(self):
        self.env["WORKTREE_EXISTS"] = "1"
        self.env["PANES"] = json.dumps([
            {"workspace_id": "existing", "foreground_cwd": self.worktree + "/lib"}
        ])
        calls = self.run_script()
        self.assertFalse(any(call[0] == "wt" for call in calls))
        self.assertEqual([call for call in calls if call[0] == "herdr"], [
            ["herdr", "pane", "list"],
            ["herdr", "workspace", "focus", "existing"],
        ])

    def test_creates_space_for_existing_worktree_not_similarly_named_directory(self):
        self.env["WORKTREE_EXISTS"] = "1"
        self.env["PANES"] = json.dumps([
            {"workspace_id": "unrelated", "cwd": self.worktree + "-other"}
        ])
        calls = self.run_script()
        self.assertFalse(any(call[0] == "wt" for call in calls))
        self.assert_created_space(calls, focus=True)

    def test_creates_missing_pr_worktree_and_space(self):
        calls = self.run_script()
        switch = next(call for call in calls if call[0] == "wt")
        self.assertIn(PR_URL, switch)
        self.assertIn("--no-cd", switch)
        self.assertNotIn("--create", switch)
        self.assert_created_space(calls)

    def test_finishes_after_popup_terminal_closes(self):
        calls = self.run_script(popup=True)
        self.assert_created_space(calls)

    def test_preserves_new_aha_branch_creation(self):
        script = self.repo / "script/branch_name_for_aha_record.sh"
        script.parent.mkdir()
        script.write_text("#!/bin/sh\nprintf 'review-branch\\n'\n")
        script.chmod(0o755)
        calls = self.run_script("https://big.aha.io/features/APP-123")
        switch = next(call for call in calls if call[0] == "wt")
        self.assertIn("--create", switch)
        self.assertEqual(switch[switch.index("--base") + 1], "master")
        self.assertFalse(any(call[0] == "gh" for call in calls))
        self.assert_created_space(calls)

    def test_pr_resolution_failure_does_not_create_anything(self):
        self.env["GH_FAIL"] = "1"
        calls = self.run_script(succeeds=False)
        self.assertFalse(any(call[0] in ("wt", "herdr") for call in calls))


if __name__ == "__main__":
    unittest.main()
