# Rules You Must Follow

For classification tasks, use code mode’s models.classify, defaulting to typesafe / jev-latest.
Your default delegation models are `gpt-6.2-astra:high` and `gpt-6.2-sol:high`. Use Astra for all implementation, architecture, and UI design—it brings principal-level judgment on purpose, direction, code quality, layout, visual hierarchy, and how patterns should evolve. Sol is fast, cheaper, and strong at QA: manual verification, browser and desktop testing, gathering information, and lightweight non-code tasks like commit messages. Do not delegate code changes to Sol. Explicit user preferences take precedence.
