import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "feature-space.sh"
PR_URL = "https://github.com/example/aha-app/pull/123"
FEATURE_URL = "https://big.aha.io/features/APP-123"


class FeatureSpaceTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.home = Path(self.directory.name).resolve()
        self.bin = self.home / "bin"
        self.bin.mkdir()
        self.repo = self.home / "code/aha-app"
        (self.repo / "script").mkdir(parents=True)
        self.worktree = self.home / "code/aha-app.review-branch"
        self.worktree.mkdir()
        self.log = self.home / "calls.jsonl"
        self.pane_cwd = self.home / "pane-cwd"
        self.env = {
            **os.environ,
            "HOME": str(self.home),
            "PATH": f"{self.bin}:{os.environ['PATH']}",
            "HERDR_ENV": "1",
            "CALL_LOG": str(self.log),
            "PANES": "[]",
            "WORKTREE_EXISTS": "0",
            "WORKTREE_PATH": str(self.worktree),
            "PANE_CWD_FILE": str(self.pane_cwd),
            "REAL_GIT": shutil.which("git"),
            "BRANCH": "review-branch",
            "BRANCH_LOCATION": "",
            "RESOLUTION_FAIL": "0",
            "SWITCH_FAIL": "0",
        }
        mock = '''import json
import os
from pathlib import Path
import subprocess
import sys

command = Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["CALL_LOG"], "a") as log:
    log.write(json.dumps([command, *args]) + "\\n")
if command == "herdr":
    if args == ["pane", "list"]:
        print(json.dumps({"result": {"panes": json.loads(os.environ["PANES"])}}))
    elif args[:2] == ["workspace", "create"]:
        print(json.dumps({"result": {
            "workspace": {"workspace_id": "new-space"},
            "root_pane": {"pane_id": "new-space:p1"},
        }}))
    elif args[:2] not in (["workspace", "focus"], ["pane", "run"]):
        sys.exit(2)
elif command in ("gh", "branch_name_for_aha_record.sh"):
    if os.environ["RESOLUTION_FAIL"] == "1":
        sys.exit(1)
    print(os.environ["BRANCH"])
elif command == "git":
    if args[0] == "check-ref-format":
        sys.exit(subprocess.call([os.environ["REAL_GIT"], *args]))
    if args[:2] == ["worktree", "list"]:
        if os.environ["WORKTREE_EXISTS"] == "1":
            path = os.environ["WORKTREE_PATH"]
            branch = os.environ["BRANCH"]
            sys.stdout.write(f"worktree {path}\\0HEAD abc\\0branch refs/heads/{branch}\\0\\0")
        sys.exit(0)
    if args[0] == "show-ref":
        expected = "refs/" + os.environ["BRANCH_LOCATION"] + "/" + os.environ["BRANCH"]
        sys.exit(0 if args[-1] == expected else 1)
    sys.exit(2)
elif command == "wt":
    print("Worktree setup progress")
    sys.exit(int(os.environ["SWITCH_FAIL"]))
else:
    sys.exit(2)
'''
        for path in [
            *(self.bin / name for name in ("git", "gh", "wt", "herdr")),
            self.repo / "script/branch_name_for_aha_record.sh",
        ]:
            path.write_text(f"#!{sys.executable}\n{mock}")
            path.chmod(0o755)

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def run_script(self, url=PR_URL, popup=False, succeeds=True):
        result = subprocess.run(
            ["bash", str(SCRIPT), *([] if popup else [url])],
            input=url + "\n" if popup else "",
            env=self.env,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if succeeds:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(result.stderr)
        return self.calls()

    def submitted_command(self, url=PR_URL):
        calls = self.run_script(url, popup=True)
        self.assertFalse(any(call[0] == "wt" for call in calls))
        submissions = [call for call in calls if call[:2] in (
            ["herdr", "workspace"], ["herdr", "pane"],
        ) and call[2] != "list"]
        self.assertEqual([call[:3] for call in submissions], [
            ["herdr", "workspace", "create"],
            ["herdr", "pane", "run"],
        ])
        creation = submissions[0]
        self.assertEqual(creation[creation.index("--cwd") + 1], str(self.repo))
        self.assertIn("--focus", creation)
        self.assertNotIn("--label", creation)
        self.assertEqual(submissions[1][3], "new-space:p1")
        return submissions[1][4]

    def run_in_pane(self, command):
        result = subprocess.run(
            ["bash", "--noprofile", "--norc", "-c",
             'wt() { command wt "$@" && cd "$WORKTREE_PATH"; }\n'
             + command + '\nprintf "%s" "$PWD" > "$PANE_CWD_FILE"\n'],
            cwd=self.repo,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def test_pr_setup_runs_in_new_pane_and_changes_its_directory(self):
        command = self.submitted_command()
        result = self.run_in_pane(command)
        self.assertEqual([call for call in self.calls() if call[0] == "wt"], [
            ["wt", "switch", PR_URL],
        ])
        self.assertIn(["gh", "pr", "view", PR_URL, "--json", "headRefName", "--jq", ".headRefName"], self.calls())
        self.assertIn("Worktree setup progress", result.stdout)
        self.assertEqual(self.pane_cwd.read_text(), str(self.worktree))

    def test_reuses_worktree_space_without_sending_commands(self):
        self.env["WORKTREE_EXISTS"] = "1"
        for url, cwd in [
            (PR_URL + "/files?diff=split#discussion", {"foreground_cwd": str(self.worktree / "lib")}),
            ("https://big.aha.io/develop/features/app-123/?view=detail", {"cwd": str(self.worktree)}),
        ]:
            with self.subTest(url=url):
                self.env["PANES"] = json.dumps([
                    {"workspace_id": "unrelated", "cwd": str(self.repo)},
                    {"workspace_id": "existing", **cwd},
                ])
                self.log.write_text("")
                calls = self.run_script(url)
                self.assertFalse(any(call[0] == "wt" for call in calls))
                self.assertEqual([call for call in calls if call[0] == "herdr"], [
                    ["herdr", "pane", "list"],
                    ["herdr", "workspace", "focus", "existing"],
                ])

    def test_existing_worktree_without_matching_space_opens_new_space(self):
        self.env["WORKTREE_EXISTS"] = "1"
        self.env["PANES"] = json.dumps([
            {"workspace_id": "unrelated", "cwd": str(self.worktree) + "-other"},
            {"workspace_id": "moved-away", "cwd": str(self.worktree), "foreground_cwd": str(self.repo)},
        ])
        self.run_in_pane(self.submitted_command())
        self.assertEqual([call for call in self.calls() if call[0] == "wt"], [
            ["wt", "switch", PR_URL],
        ])
        self.assertEqual(self.pane_cwd.read_text(), str(self.worktree))

    def test_feature_switches_existing_branch_or_creates_missing_branch(self):
        for location in ("heads", "remotes/origin", ""):
            with self.subTest(location=location):
                self.env["BRANCH_LOCATION"] = location
                self.log.write_text("")
                command = self.submitted_command(FEATURE_URL)
                self.run_in_pane(command)
                options = [] if location else ["--create", "--base", "master"]
                self.assertEqual([call for call in self.calls() if call[0] == "wt"], [
                    ["wt", "switch", *options, "review-branch"],
                ])
                self.assertEqual(self.pane_cwd.read_text(), str(self.worktree))

    def test_failed_or_invalid_feature_resolution_does_not_switch(self):
        for failed, branch in [
            ("1", "review-branch"),
            ("0", FEATURE_URL),
            ("0", "-previous"),
        ]:
            with self.subTest(failed=failed, branch=branch):
                self.env.update(RESOLUTION_FAIL=failed, BRANCH=branch)
                self.log.write_text("")
                calls = self.run_script(FEATURE_URL, succeeds=False)
                self.assertFalse(any(call[0] in ("wt", "herdr") for call in calls))

    def test_pr_resolution_failure_does_not_create_a_space(self):
        self.env["RESOLUTION_FAIL"] = "1"
        calls = self.run_script(succeeds=False)
        self.assertFalse(any(call[0] in ("wt", "herdr") for call in calls))

    def test_switch_failure_does_not_retry_as_branch_creation(self):
        self.env.update(BRANCH_LOCATION="heads", SWITCH_FAIL="1")
        self.run_in_pane(self.submitted_command(FEATURE_URL))
        self.assertEqual([call for call in self.calls() if call[0] == "wt"], [
            ["wt", "switch", "review-branch"],
        ])
        self.assertEqual(self.pane_cwd.read_text(), str(self.repo))

    def test_url_is_passed_as_data_not_shell_code(self):
        url = "https://big.aha.io/$(touch injected)/features/APP-123"
        self.run_in_pane(self.submitted_command(url))
        self.assertIn(["branch_name_for_aha_record.sh", url], self.calls())
        self.assertFalse((self.repo / "injected").exists())

    def test_invalid_url_does_not_create_a_space(self):
        result = subprocess.run(
            ["bash", str(SCRIPT), "https://github.com/example/aha-app/pull/not-a-number"],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
