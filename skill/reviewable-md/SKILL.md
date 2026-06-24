---
name: reviewable-md
description: Open generated or modified Markdown files in Reviewable Markdown for browser-based review. Use after creating, writing, editing, updating, or generating .md Markdown documents, especially when the user wants to inspect rendered Markdown, leave inline review comments, or continue an AI revision loop.
---

# Reviewable Markdown

After completing a task that creates or modifies Markdown files, open the latest generated or modified `.md` file in Reviewable Markdown.

## Workflow

1. Identify the latest `.md` file created or modified by the current task.
2. Resolve it to an absolute path.
3. Run:

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md@latest open "<absolute-md-path>"
```

Use `--no-open` only when the user explicitly does not want a browser window.

## Rules

- Open only the latest Markdown file when multiple `.md` files changed in the same task.
- Do not open non-Markdown files.
- Do not start your own server process. The CLI starts or reuses the single local daemon.
- If the command fails because the package is unavailable, report the exact command and error to the user.
