# Reviewable Markdown

Preview a markdown file in the browser, leave **inline review comments** on any
selected text, and **copy the comments back to an AI** so it can revise the
document in the next iteration.

Comments are persisted to a local JSON file (`<file>.review.json`) next to the
markdown, so they survive reloads and an AI can read them directly.

## Quick start

```bash
npm install
npm run dev -- sample.md        # opens http://localhost:5174
```

Then in the browser:

1. **Select** any text in the rendered document.
2. A comment box pops up — write your note and hit **⌘+Enter**.
3. The comment is highlighted in the document and listed in the sidebar.
4. Click **Copy for AI** to copy all open comments as a structured prompt.
5. Paste it to your AI and let it revise the markdown. Reload to review again.

## How it works

- **Frontend** — Vite + React. Renders markdown with `react-markdown` + GFM.
  Selections are anchored using a *text-quote selector* (quote + surrounding
  context), so highlights survive markdown re-rendering.
- **Server** — a zero-dependency Node server (`server/cli.js`) that serves the
  markdown, reads/writes the comments JSON, and proxies Vite in dev / serves
  the built client in production.

## Comment file format

`<file>.review.json`:

```json
{
  "file": "sample.md",
  "updatedAt": "2026-06-23T11:01:22.348Z",
  "comments": [
    {
      "id": "c_test",
      "anchor": { "quote": "widget platform", "prefix": "build a **", "suffix": "** that lets" },
      "body": "Define what counts as a widget.",
      "resolved": false,
      "createdAt": "2026-06-23T00:00:00Z"
    }
  ]
}
```

## CLI

```
reviewable-md <file.md> [--port 5174] [--no-open]
```

## Build

```bash
npm run build                  # outputs dist/
node server/cli.js sample.md   # serves the built client (no Vite)
```

## Status

Working app. Next step: package as a Claude Code / Codex skill (`SKILL.md`)
that launches this server on a markdown file and hands the user a preview URL.
