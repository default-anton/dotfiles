import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, Skill } from "@mariozechner/pi-coding-agent";
import { DefaultResourceLoader, SettingsManager, getAgentDir } from "@mariozechner/pi-coding-agent";

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
    const settingsManager = SettingsManager.create(ctx.cwd, agentDir);

    const resourceLoader = new DefaultResourceLoader({
      cwd: ctx.cwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
    });
    await resourceLoader.reload();

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

    const { skills } = resourceLoader.getSkills();

    // Filter out skills with disableModelInvocation (they shouldn't be in the prompt)
    const filteredSkills = skills.filter(skill => !skill.disableModelInvocation);

    const { agentsFiles } = resourceLoader.getAgentsFiles();

    if (filteredSkills.length === 0 && agentsFiles.length === 0) {
      return;
    }

    const prompt = [
      "\n\n---",
      formatAgentFilesForPrompt(agentsFiles),
      formatSkillsForPrompt(filteredSkills),
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
