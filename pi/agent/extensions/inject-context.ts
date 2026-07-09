import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DefaultResourceLoader,
  SettingsManager,
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const AGENTS_CONTEXT_FILENAMES = ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md"];
const PI_DOCS_README_URL = "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md";
const PI_DOCS_URL = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs";
const PI_EXAMPLES_URL = "https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples";

type ContextFile = {
  path: string;
  content: string;
};

type Skill = {
  name: string;
  filePath: string;
  description: string;
  disableModelInvocation?: boolean;
};

function discoverContextFileFromDir(dir: string): ContextFile | null {
  for (const filename of AGENTS_CONTEXT_FILENAMES) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      return {
        path: filePath,
        content: fs.readFileSync(filePath, "utf-8"),
      };
    } catch {
      continue;
    }
  }

  return null;
}

function discoverAgentsFiles(cwd: string, agentDir: string): ContextFile[] {
  const agentsFiles: ContextFile[] = [];
  const seenPaths = new Set<string>();

  const globalContext = discoverContextFileFromDir(agentDir);
  if (globalContext) {
    agentsFiles.push(globalContext);
    seenPaths.add(globalContext.path);
  }

  const ancestorContexts: ContextFile[] = [];
  let currentDir = path.resolve(cwd);
  const rootDir = path.parse(currentDir).root;

  while (true) {
    const contextFile = discoverContextFileFromDir(currentDir);
    if (contextFile && !seenPaths.has(contextFile.path)) {
      ancestorContexts.unshift(contextFile);
      seenPaths.add(contextFile.path);
    }

    if (currentDir === rootDir) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  agentsFiles.push(...ancestorContexts);

  return agentsFiles;
}

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
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Use the read tool to load a skill file when you're about to perform the kind of work the skill prescribes, not just mention it.",
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

  const lines = ["\n\nAGENTS.md files:", "<agents_files>"];

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
    "\n\nPi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
    `- Main documentation: ${PI_DOCS_README_URL}`,
    `- Additional docs: ${PI_DOCS_URL}`,
    `- Examples: ${PI_EXAMPLES_URL} (extensions, custom tools, SDK)`,
    "- Use `read_web_page <url>` to read GitHub documentation pages.",
    "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)",
    "- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
    "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
  ].join("\n");
}

export default function injectContextExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
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

    const systemPromptPath = path.join(agentDir, "SYSTEM.md");
    const hasSystemPromptOverride = fs.existsSync(systemPromptPath);

    let baseSystemPrompt = event.systemPrompt;
    if (hasSystemPromptOverride) {
      baseSystemPrompt = fs.readFileSync(systemPromptPath, "utf-8");
    }

    const now = new Date();
    const dateTime = now.toLocaleString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZoneName: "short",
    });

    const { skills } = resourceLoader.getSkills() as { skills: Skill[] };
    const filteredSkills = skills.filter((skill) => !skill.disableModelInvocation);

    const agentsFiles = discoverAgentsFiles(ctx.cwd, agentDir);

    const piDocs = formatPiDocumentationForPrompt(baseSystemPrompt);

    if (!hasSystemPromptOverride && piDocs === "" && filteredSkills.length === 0 && agentsFiles.length === 0) {
      return;
    }

    const prompt = [
      "\n\n---",
      piDocs,
      formatAgentFilesForPrompt(agentsFiles, ctx.cwd),
      formatSkillsForPrompt(filteredSkills),
      `\n\nCurrent date: ${dateTime}`,
      `\nCurrent working directory: ${formatPathForPrompt(ctx.cwd)}`,
      `\nGlobal AGENTS.md: ${formatPathForPrompt(path.join(agentDir, "AGENTS.md"))} (applies to all projects)`,
    ].join("");

    return {
      systemPrompt: baseSystemPrompt.trim() + prompt,
    };
  });
}
