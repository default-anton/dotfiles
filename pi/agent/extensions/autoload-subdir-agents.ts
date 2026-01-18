import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type TextContent = { type: "text"; text: string };

export default function autoloadSubdirAgents(pi: ExtensionAPI) {
	const loadedAgents = new Set<string>();
	let currentCwd = "";
	let cwdAgentsPath = "";
	let homeDir = "";

	function resolvePath(targetPath: string, baseDir: string) {
		const absolute = path.isAbsolute(targetPath)
			? path.normalize(targetPath)
			: path.resolve(baseDir, targetPath);
		try {
			return fs.realpathSync.native?.(absolute) ?? fs.realpathSync(absolute);
		} catch {
			return absolute;
		}
	}

	function isInsideRoot(rootDir: string, targetPath: string) {
		if (!rootDir) return false;
		const relative = path.relative(rootDir, targetPath);
		return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
	}

	function resetSession(cwd: string) {
		currentCwd = resolvePath(cwd, process.cwd());
		cwdAgentsPath = path.join(currentCwd, "AGENTS.md");
		homeDir = resolvePath(os.homedir(), process.cwd());
		loadedAgents.clear();
		loadedAgents.add(cwdAgentsPath);
	}

	function findAgentsFiles(filePath: string, rootDir: string) {
		if (!rootDir) return [] as string[];

		const agentsFiles: string[] = [];
		let dir = path.dirname(filePath);

		while (isInsideRoot(rootDir, dir)) {
			const candidate = path.join(dir, "AGENTS.md");
			if (candidate !== cwdAgentsPath && fs.existsSync(candidate)) {
				agentsFiles.push(candidate);
			}

			if (dir === rootDir) break;

			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}

		return agentsFiles.reverse();
	}

	const handleSessionChange = (_event: unknown, ctx: ExtensionContext) => {
		resetSession(ctx.cwd);
	};

	pi.on("session_start", handleSessionChange);
	pi.on("session_switch", handleSessionChange);

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "read" || event.isError) return undefined;

		const pathInput = event.input.path as string | undefined;
		if (!pathInput) return undefined;

		if (!currentCwd) resetSession(ctx.cwd);

		const absolutePath = resolvePath(pathInput, currentCwd);

		const searchRoot = isInsideRoot(currentCwd, absolutePath)
			? currentCwd
			: isInsideRoot(homeDir, absolutePath)
				? homeDir
				: "";
		if (!searchRoot) return undefined;

		if (path.basename(absolutePath) === "AGENTS.md") {
			loadedAgents.add(path.normalize(absolutePath));
			return undefined;
		}

		const agentFiles = findAgentsFiles(absolutePath, searchRoot);
		const additions: TextContent[] = [];

		for (const agentsPath of agentFiles) {
			if (loadedAgents.has(agentsPath)) continue;

			try {
				const content = await fs.promises.readFile(agentsPath, "utf-8");
				loadedAgents.add(agentsPath);
				additions.push({
					type: "text",
					text: `Loaded subdirectory context from ${agentsPath}\n\n${content}`,
				});
			} catch (error) {
				if (ctx.hasUI) ctx.ui.notify(`Failed to load ${agentsPath}: ${String(error)}`, "warning");
			}
		}

		if (!additions.length) return undefined;

		const baseContent = event.content ?? [];
		return { content: [...baseContent, ...additions], details: event.details };
	});
}
