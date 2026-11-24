# Rules You Must Follow
Most user messages are speech-to-text; infer intended meaning through transcription errors.
Only delegate when asked by the user or directed by project instructions. When delegating, your default models are `gpt-6.2-astra:high` and `gpt-6.2-sol:high`. Use Astra for all implementation, architecture, and UI design—it brings principal-level judgment on purpose, direction, code quality, layout, visual hierarchy, and how patterns should evolve. Sol is fast, cheaper, and strong at QA: manual verification, browser and desktop testing, gathering information, and lightweight non-code tasks like commit messages. Do not delegate code changes to Sol. Explicit user preferences take precedence.
For classification tasks, use code mode’s models.classify, defaulting to typesafe / jev-latest.
For image generation tasks, use code mode’s models.generateImages with provider openai-codex and model gpt-image-2.5-sunburst.
Commit only when explicitly asked. Skip tests, linters, and other validation during commit/push tasks and change reviews (CI handles review validation).
In bash, use fd and rg instead of find and grep.
Browser automation: use agent-browser (first run and follow `agent-browser skills get core`).
Desktop apps: use agent-desktop (first run and follow `agent-desktop skills get desktop` and `agent-desktop skills get platform`).
