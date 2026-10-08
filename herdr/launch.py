#!/usr/bin/env python3

import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib


def load_commands(directory):
    manifest = directory / "commands.toml"
    if not manifest.exists():
        return {}

    with manifest.open("rb") as file:
        entries = tomllib.load(file)

    commands = {}
    for command_id, metadata in entries.items():
        executable = directory / command_id
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", command_id):
            raise ValueError(f"{manifest}: invalid command ID {command_id!r}")
        if not isinstance(metadata, dict) or set(metadata) != {"name", "description"}:
            raise ValueError(f"{manifest}: {command_id} needs name and description")
        for field in ("name", "description"):
            value = metadata[field]
            if not isinstance(value, str) or not value.strip() or any(
                ord(character) < 32 or ord(character) == 127 for character in value
            ):
                raise ValueError(f"{manifest}: {command_id}.{field} must be single-line text")
        if not executable.is_file() or not os.access(executable, os.X_OK):
            raise ValueError(f"{manifest}: {command_id} must be an executable file")
        commands[command_id] = (metadata["name"], metadata["description"], executable)
    return commands


def project_root(cwd):
    for directory in (cwd, *cwd.parents):
        if (directory / ".commands").is_dir():
            return directory
    result = subprocess.run(
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
    )
    return Path(result.stdout.strip()) if result.returncode == 0 else cwd


def launch():
    cwd = Path.cwd()
    root = project_root(cwd)
    commands = load_commands(Path(__file__).resolve().parent / "commands")
    commands.update(load_commands(root / ".commands"))
    if not commands:
        raise ValueError("No commands found")

    rows = [
        f"{command_id}\t{name}\t{description}"
        for command_id, (name, description, _) in sorted(
            commands.items(), key=lambda item: item[1][0].casefold()
        )
    ]
    result = subprocess.run(
        [
            "fzf",
            "--no-multi",
            "--delimiter=\t",
            "--with-nth=2..",
            "--border",
            "--layout=reverse-list",
            "--style=minimal",
            "--prompt=commands> ",
            f"--header={root.name}",
        ],
        input="\n".join(rows) + "\n",
        stdout=subprocess.PIPE,
        text=True,
    )
    if result.returncode in (1, 130):
        return 0
    if result.returncode:
        raise RuntimeError(f"fzf exited with status {result.returncode}")

    command_id = result.stdout.split("\t", 1)[0]
    executable = commands[command_id][2]
    environment = os.environ | {"LAUNCH_CWD": str(cwd)}
    result = subprocess.run([str(executable)], cwd=root, env=environment)
    if result.returncode in (-2, 130):
        return 0
    if result.returncode:
        raise RuntimeError(f"{command_id} exited with status {result.returncode}")
    return 0


def main():
    extra_paths = [
        Path.home() / ".local/share/mise/shims",
        Path("/opt/homebrew/bin"),
        Path("/usr/local/bin"),
        Path.home() / ".dotfiles/bin",
        Path.home() / "bin",
        Path.home() / ".local/bin",
    ]
    os.environ["PATH"] = os.pathsep.join(
        [os.environ.get("PATH", ""), *(str(path) for path in extra_paths)]
    )
    try:
        return launch()
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"commands: {error}", file=sys.stderr)
        if sys.stdin.isatty():
            try:
                input("\nPress Enter to close.")
            except (EOFError, KeyboardInterrupt):
                pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
