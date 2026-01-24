import {
  ExtensionAPI,
  ExtensionContext,
  discoverSkills,
  discoverContextFiles,
  getAgentDir,
} from "@mariozechner/pi-coding-agent";

interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
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
    const cwd = process.cwd();

    const { skills } = discoverSkills(cwd, agentDir, {
      enableCodexUser: false,
      enableClaudeUser: false,
    });
    const agentFiles = discoverContextFiles(cwd, agentDir);

    if (skills.length === 0 && agentFiles.length === 0) {
      return;
    }

    const prompt = formatSkillsForPrompt(skills) + formatAgentFilesForPrompt(agentFiles);

    return {
      systemPrompt: event.systemPrompt.trim() + prompt
    };
  });
}
