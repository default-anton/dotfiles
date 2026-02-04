import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, SettingsManager, getAgentDir } from "@mariozechner/pi-coding-agent";

let hasShownPiDocsResolveWarning = false;

function toFilePath(urlOrPath) {
  if (urlOrPath.startsWith("file://")) {
    return fileURLToPath(urlOrPath);
  }
  return urlOrPath;
}

function findPiPackageDirFromEntry(entryFilePath) {
  let dir = path.dirname(entryFilePath);

  for (let i = 0; i < 6; i++) {
    const readmePath = path.join(dir, "README.md");
    const docsPath = path.join(dir, "docs");

    if (fs.existsSync(readmePath) && fs.existsSync(docsPath)) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}

function resolvePiEntryFilePaths() {
  const metaResolve = import.meta.resolve;

  if (typeof metaResolve !== "function") {
    return [];
  }

  try {
    return [toFilePath(metaResolve("@mariozechner/pi-coding-agent"))];
  } catch {
    return [];
  }
}

function getPiDocsPaths(ctx) {
  for (const entryFilePath of resolvePiEntryFilePaths()) {
    const packageDir = findPiPackageDirFromEntry(entryFilePath);
    if (!packageDir) {
      continue;
    }

    const readmePath = path.join(packageDir, "README.md");
    const docsPath = path.join(packageDir, "docs");
    const examplesPath = path.join(packageDir, "examples");

    if (!fs.existsSync(readmePath) || !fs.existsSync(docsPath) || !fs.existsSync(examplesPath)) {
      continue;
    }

    return { readmePath, docsPath, examplesPath };
  }

  if (!hasShownPiDocsResolveWarning && ctx.hasUI) {
    hasShownPiDocsResolveWarning = true;
    ctx.ui.notify(
      "Could not locate pi-coding-agent documentation paths. Pi docs links will be omitted from the system prompt.",
      "warning",
    );
  }

  return null;
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatPathForPrompt(filePath) {
  const homeDir = os.homedir();
  if (filePath === homeDir) {
    return "~";
  }
  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`;
  }
  return filePath;
}

function formatSkillsForPrompt(skills) {
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
      `<skill name=\"${escapeXml(skill.name.trim())}\" path=\"${escapeXml(formatPathForPrompt(skill.filePath))}\">`,
    );
    lines.push("<description>");
    lines.push(escapeXml(skill.description.trim()));
    lines.push("</description>");
    lines.push("</skill>");
  }

  lines.push("</available_skills>");

  return lines.join("\n");
}

function formatAgentFilesForPrompt(agentFiles) {
  if (agentFiles.length === 0) {
    return "";
  }

  const lines = ["\n\nAGENTS.md files:", "<agents_files>"];

  for (const { path: filePath, content } of agentFiles) {
    lines.push(`<agent_file path=\"${escapeXml(formatPathForPrompt(filePath))}\">`);
    lines.push(content.trim());
    lines.push("</agent_file>");
  }

  lines.push("</agents_files>");

  return lines.join("\n");
}

function formatPiDocumentationForPrompt(systemPrompt, ctx) {
  if (systemPrompt.includes("Pi documentation (read only when the user asks about pi itself")) {
    return "";
  }

  const paths = getPiDocsPaths(ctx);
  if (!paths) {
    return "";
  }

  const readmePath = formatPathForPrompt(paths.readmePath);
  const docsPath = formatPathForPrompt(paths.docsPath);
  const examplesPath = formatPathForPrompt(paths.examplesPath);

  return [
    "\n\nPi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):",
    `- Main documentation: ${readmePath}`,
    `- Additional docs: ${docsPath}`,
    `- Examples: ${examplesPath} (extensions, custom tools, SDK)`,
    "- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md)",
    "- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing",
    "- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)",
  ].join("\n");
}

export default function injectContextExtension(pi) {
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

    const { skills } = resourceLoader.getSkills();
    const filteredSkills = skills.filter((skill) => !skill.disableModelInvocation);

    const { agentsFiles } = resourceLoader.getAgentsFiles();

    const piDocs = formatPiDocumentationForPrompt(baseSystemPrompt, ctx);

    if (!hasSystemPromptOverride && piDocs === "" && filteredSkills.length === 0 && agentsFiles.length === 0) {
      return;
    }

    const prompt = [
      "\n\n---",
      piDocs,
      formatAgentFilesForPrompt(agentsFiles),
      formatSkillsForPrompt(filteredSkills),
      `\n\nCurrent date: ${dateTime}`,
      `\nCurrent working directory: ${formatPathForPrompt(ctx.cwd)}`,
      `\n\nYour skills are located in: ${formatPathForPrompt(path.join(agentDir, "skills"))}/`,
      `\nYour extensions are located in: ${formatPathForPrompt(path.join(agentDir, "extensions"))}/`,
      `\nGlobal AGENTS.md: ${formatPathForPrompt(path.join(agentDir, "AGENTS.md"))} (applies to all projects)`,
    ].join("");

    return {
      systemPrompt: baseSystemPrompt.trim() + prompt,
    };
  });
}
