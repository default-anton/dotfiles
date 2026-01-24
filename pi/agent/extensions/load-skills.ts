import { ExtensionAPI, loadSkills, formatSkillsForPrompt } from "@mariozechner/pi-coding-agent";

/**
 * Extension to injects skills into the system prompt.
 */
export default function(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    if (event.systemPrompt.includes("<available_skills>")) {
      return;
    }

    try {
      const { skills } = loadSkills({
        cwd: ctx.cwd,
        enableCodexUser: false,
        enableClaudeUser: false
      });

      if (skills.length === 0) {
        return;
      }

      const skillsXml = formatSkillsForPrompt(skills);

      return {
        systemPrompt: event.systemPrompt + "\n\n" + skillsXml
      };
    } catch (err) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Failed to load skills fix: ${err}`, "error");
      }
    }
  });
}
