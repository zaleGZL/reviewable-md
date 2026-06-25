# Reviewable Markdown

Preview a markdown file in the browser, leave **inline review comments** on any
selected text, and **copy the comments back to an AI** so it can revise the
document in the next iteration.

Comments are saved locally in the browser and survive page refreshes. When a document is open, refreshing re-reads the latest content from disk while keeping your comments.

## Quick start

### Inside Shopee

```bash
npm install --registry=https://npm.shopee.io/ @foody/reviewable-md
npm run dev                    # opens the default page at http://localhost:27175
npm run dev -- sample.md       # opens sample.md and persists its path in the URL
```

### Outside Shopee

```bash
npm install reviewable-md
npm run dev                    # opens the default page at http://localhost:27175
npm run dev -- sample.md       # opens sample.md and persists its path in the URL
```

Then in the browser:

1. **Enter** the absolute path to a local `.md` file and click **Open path**.
2. **Select** any text in the rendered document to open a comment box — write your note and hit **⌘+Enter**.
3. The comment is highlighted in the document and listed in the sidebar.
4. Click **Copy Prompt** to copy all open comments as a structured prompt, then paste into your AI to revise the document. Reload to review again.

### Copy Source

**Copy Source** exports the document in different formats:

- **Markdown** — raw markdown with front matter stripped. Paste anywhere that accepts markdown.
- **Confluence** — In Confluence editor, click **···** (top-right) → **Open in Source Editor**, then paste.
- **Share Link** — copies `http://<LAN-IP>:<port>/?path=...` so teammates on the same network can open the same document directly.

## Agent Skill install

### Inside Shopee

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md install-skill
```

After that, compatible agents can open the latest generated or modified Markdown file with:

```bash
npx --registry=https://npm.shopee.io/ @foody/reviewable-md@latest open "/absolute/path/to/file.md"
```

### Outside Shopee

```bash
npx reviewable-md install-skill
```

After that, compatible agents can open the latest generated or modified Markdown file with:

```bash
npx reviewable-md@latest open "/absolute/path/to/file.md"
```

This writes the bundled skill to:

```text
~/.claude/skills/reviewable-md
~/.codex/skills/reviewable-md
```

The `open` command starts one local background daemon if needed, reuses it for
future files, and opens the browser at a disk-backed `?path=...` URL.

## How to use the skill

Once installed, whenever an AI agent (e.g. Claude Code) generates or modifies a `.md` file, it will automatically open it in the browser via the skill. Leave inline comments on the page, then click **Copy Prompt** to paste them back to the AI for the next revision.

You can also trigger it manually by telling the agent:

> Open this file with reviewable-md

Chinese documentation: [README.md](./README.md).
