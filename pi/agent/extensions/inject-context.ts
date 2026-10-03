import * as os from "node:os";
import * as path from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type NormalizedBuildSystemPromptOptions,
  type Skill,
} from "@earendil-works/pi-coding-agent";

const PI_DOCS_URL = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs";
const PI_EXAMPLES_URL = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples";

type ContextFile = {
  path: string;
  content: string;
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatPathForPrompt(filePath: string, cwd = ""): string {
  if (cwd) {
    const relativePath = path.relative(path.resolve(cwd), path.resolve(filePath));
    if (relativePath === "") {
      return ".";
    }
    if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return relativePath;
    }
  }

  const homeDir = os.homedir();
  if (filePath === homeDir) {
    return "~";
  }
  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`;
  }
  return filePath;
}

function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "The following skills provide specialized instructions for specific tasks.",
    "Read a skill file when you're about to perform the kind of work the skill prescribes, not just mention it.",
    "Resolve relative paths in a skill against the directory containing its SKILL.md, not the working directory.",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push(
      `<skill name="${escapeXml(skill.name.trim())}" path="${escapeXml(formatPathForPrompt(skill.filePath))}">`,
    );
    lines.push("<description>");
    lines.push(escapeXml(skill.description.trim()));
    lines.push("</description>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

function formatAgentFilesForPrompt(agentFiles: ContextFile[], cwd: string): string {
  if (agentFiles.length === 0) {
    return "";
  }

  const lines = ["AGENTS.md files:", "<agents_files>"];

  for (const { path: filePath, content } of agentFiles) {
    lines.push(`<agent_file path="${escapeXml(formatPathForPrompt(filePath, cwd))}">`);
    lines.push(content.trim());
    lines.push("</agent_file>");
  }

  lines.push("</agents_files>");

  return lines.join("\n");
}

function formatPiDocumentationForPrompt(systemPrompt: string): string {
  if (systemPrompt.includes("Pi documentation (read only when the user asks about pi itself")) {
    return "";
  }

  return [
    "Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
    `- Documentation: ${PI_DOCS_URL}. Read when asked about extensions, themes, skills, prompt templates, TUI components, keybindings, SDK integrations, custom providers, adding models, pi packages, environment variables, MCP servers, or other Pi features. Use gh to list the Markdown files and locate relevant documentation.`,
    `- Examples: ${PI_EXAMPLES_URL}`,
  ].join("\n");
}

export function formatToolGuidelines(options: NormalizedBuildSystemPromptOptions): string {
  const guidelines = [
    ...options.selectedTools.flatMap((name) => options.toolGuidelines[name] ?? []),
    ...options.promptGuidelines,
  ];
  const uniqueGuidelines = new Set(
    guidelines.map((guideline) => guideline.trim()).filter(Boolean),
  );

  return [...uniqueGuidelines].map((guideline) => `- ${guideline}`).join("\n");
}

export default function injectContextExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    const options = event.systemPromptOptions;
    const { sections } = options;
    const piDocs = formatPiDocumentationForPrompt(options.customPrompt ?? event.systemPrompt);
    if (piDocs) {
      sections.docs = piDocs;
    }

    if (options.contextFiles.length > 0) {
      sections.project_context = formatAgentFilesForPrompt(options.contextFiles, ctx.cwd);
    }

    const canReadSkills = options.selectedTools.some((name) => name === "read" || name === "bash");
    const visibleSkills = options.skills.filter((skill) => !skill.disableModelInvocation);
    if (canReadSkills && visibleSkills.length > 0) {
      sections.skills = formatSkillsForPrompt(visibleSkills);
    }

    if (options.customPrompt) {
      const toolGuidelines = formatToolGuidelines(options);
      if (toolGuidelines) {
        sections.tool_guidelines = toolGuidelines;
      }
    }

    const now = new Date();
    const dateTime = now.toLocaleString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZoneName: "short",
    });

    sections.date = `Current date: ${dateTime}`;
    sections.cwd = `Current working directory: ${formatPathForPrompt(ctx.cwd)}`;
    sections.global_context = `Global AGENTS.md: ${formatPathForPrompt(path.join(getAgentDir(), "AGENTS.md"))} (applies to all projects)`;
  });
}
