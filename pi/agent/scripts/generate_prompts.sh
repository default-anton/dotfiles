#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PROMPTS_DIR="$(dirname "$SCRIPT_DIR")/system_prompts"

# Generate system_prompt.md (system + finder + gh_scout)
cat "$PROMPTS_DIR/system_prompt.md" > "$PI_AGENT_DIR/system_prompt.md"
echo "" >> "$PI_AGENT_DIR/system_prompt.md"
cat "$PROMPTS_DIR/finder_tool.md" >> "$PI_AGENT_DIR/system_prompt.md"
echo "" >> "$PI_AGENT_DIR/system_prompt.md"
cat "$PROMPTS_DIR/gh_scout_tool.md" >> "$PI_AGENT_DIR/system_prompt.md"

# Generate no_vision_system_prompt.md (system + finder + gh_scout + vision)
cat "$PROMPTS_DIR/system_prompt.md" > "$PI_AGENT_DIR/no_vision_system_prompt.md"
echo "" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"
cat "$PROMPTS_DIR/finder_tool.md" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"
echo "" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"
cat "$PROMPTS_DIR/gh_scout_tool.md" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"
echo "" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"
cat "$PROMPTS_DIR/vision_tool.md" >> "$PI_AGENT_DIR/no_vision_system_prompt.md"

echo "Generated pi/agent/system_prompt.md"
echo "Generated pi/agent/no_vision_system_prompt.md"
