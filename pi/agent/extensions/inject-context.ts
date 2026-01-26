import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, Skill } from "@mariozechner/pi-coding-agent";
import { getAgentDir, loadSkills } from "@mariozechner/pi-coding-agent";

/**
 * Load a context file (AGENTS.md or CLAUDE.md) from a directory.
 */
function loadContextFileFromDir(dir: string): { path: string; content: string } | null {
  const candidates = ["AGENTS.md", "CLAUDE.md"];
  for (const filename of candidates) {
    const filePath = path.join(dir, filename);
    if (fs.existsSync(filePath)) {
      try {
        return {
          path: filePath,
          content: fs.readFileSync(filePath, "utf-8"),
        };
      } catch {
        // Ignore read errors
      }
    }
  }
  return null;
}

/**
 * Load context files from global agent dir and project ancestry.
 */
function loadContextFiles(cwd: string, agentDir: string): Array<{ path: string; content: string }> {
  const contextFiles: Array<{ path: string; content: string }> = [];
  const seenPaths = new Set<string>();

  // Load global context file
  const globalContext = loadContextFileFromDir(agentDir);
  if (globalContext) {
    contextFiles.push(globalContext);
    seenPaths.add(globalContext.path);
  }

  // Walk up the directory tree to find project context files
  const ancestorContextFiles: Array<{ path: string; content: string }> = [];

  let currentDir = cwd;
  const root = path.resolve("/");

  while (true) {
    const contextFile = loadContextFileFromDir(currentDir);
    if (contextFile && !seenPaths.has(contextFile.path)) {
      ancestorContextFiles.unshift(contextFile);
      seenPaths.add(contextFile.path);
    }

    if (currentDir === root) break;

    const parentDir = path.resolve(currentDir, "..");
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  contextFiles.push(...ancestorContextFiles);

  return contextFiles;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill file when you're about to perform the kind of work the skill prescribes, not just mention it.",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push(`<skill name="${escapeXml(skill.name.trim())}" path="${escapeXml(skill.filePath)}">`);
    lines.push("<description>");
    lines.push(escapeXml(skill.description.trim()));
    lines.push("</description>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

function formatAgentFilesForPrompt(agentFiles: Array<{ path: string; content: string }>): string {
  if (agentFiles.length === 0) {
    return "";
  }

  const lines = [
    "\n\nAGENTS.md files:",
    "<agents_files>",
  ];

  for (const { path: filePath, content } of agentFiles) {
    lines.push(`<agent_file path="${escapeXml(filePath)}">`);
    lines.push(content.trim());
    lines.push("</agent_file>");
  }

  lines.push("</agents_files>");

  return lines.join("\n");
}

/**
 * Extension that injects AGENTS.md files and skills into the system prompt.
 */
export default function(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    const agentDir = getAgentDir();
    let systemPrompt: string = event.systemPrompt;

    if (fs.existsSync(path.join(agentDir, "SYSTEM.md"))) {
      systemPrompt = fs.readFileSync(path.join(agentDir, "SYSTEM.md"), "utf-8");
    }

    const now = new Date();
    const dateTime = now.toLocaleString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZoneName: "short",
    });

    const skillsResult = loadSkills({
      cwd: ctx.cwd,
      agentDir,
      includeDefaults: true,
    });

    // Filter out skills with disableModelInvocation (they shouldn't be in the prompt)
    const skills = skillsResult.skills.filter(skill => !skill.disableModelInvocation);

    const agentFiles = loadContextFiles(ctx.cwd, agentDir);

    if (skills.length === 0 && agentFiles.length === 0) {
      return;
    }

    const prompt = [
      "\n\n---",
      formatAgentFilesForPrompt(agentFiles),
      formatSkillsForPrompt(skills),
      `\n\nCurrent date: ${dateTime}`,
      `\nCurrent working directory: ${ctx.cwd}`,
      `\n\nYour skills are located in: ${agentDir}/skills/`,
      `\nYour extensions are located in: ${agentDir}/extensions/`,
      `\nGlobal AGENTS.md: ${agentDir}/AGENTS.md (applies to all projects)`,
    ].join("");

    return {
      systemPrompt: systemPrompt.trim() + prompt,
    };
  });
}
