#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPTS_DIR="$(dirname "$SCRIPT_DIR")/prompts"

# Generate system_prompt.md (system + finder)
cat "$PROMPTS_DIR/system_prompt.md" > "$SCRIPT_DIR/system_prompt.md"
echo "" >> "$SCRIPT_DIR/system_prompt.md"
cat "$PROMPTS_DIR/finder_tool.md" >> "$SCRIPT_DIR/system_prompt.md"

# Generate no_vision_system_prompt.md (system + finder + vision)
cat "$PROMPTS_DIR/system_prompt.md" > "$SCRIPT_DIR/no_vision_system_prompt.md"
echo "" >> "$SCRIPT_DIR/no_vision_system_prompt.md"
cat "$PROMPTS_DIR/finder_tool.md" >> "$SCRIPT_DIR/no_vision_system_prompt.md"
echo "" >> "$SCRIPT_DIR/no_vision_system_prompt.md"
cat "$PROMPTS_DIR/vision_tool.md" >> "$SCRIPT_DIR/no_vision_system_prompt.md"

echo "Generated pi/agent/system_prompt.md"
echo "Generated pi/agent/no_vision_system_prompt.md"
