- Run `./install --no-brew` after modifying `pi/agent/commands/*.md`
- To verify changes to pi's skills, prompts, extensions, use `pi` in json mode:
```bash
command pi --append-system-prompt ~/.dotfiles/pi/agent/system_prompt.md --provider google-vertex --model gemini-3-flash-preview --thinking low --mode json -p "[YOUR PROMPT HERE]"
```
