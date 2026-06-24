# Reviewable Markdown

Preview a markdown file in the browser, leave **inline review comments** on any
selected text, and **copy the comments back to an AI** so it can revise the
document in the next iteration.

Comments are persisted in the browser's IndexedDB, keyed by markdown file name,
so they survive reloads without a backend server.

## Quick start

```bash
npm install
npm run dev                    # opens http://localhost:27175
```

Then in the browser:

1. **Drop** a `.md` file onto the page or click **Choose file**.
2. **Select** any text in the rendered document.
3. A comment box pops up — write your note and hit **⌘+Enter**.
4. The comment is highlighted in the document and listed in the sidebar.
5. Click **Copy for AI** to copy all open comments as a structured prompt.
6. Paste it to your AI and let it revise the markdown. Reload to review again.

## How it works

- **Frontend** — Vite + React. Renders markdown with `react-markdown` + GFM.
  Selections are anchored using a *text-quote selector* (quote + surrounding
  context), so highlights survive markdown re-rendering.
- **Storage** — the selected markdown content and review comments are stored in
  IndexedDB. Reopening a file with the same name restores its existing comments.

## Stored document format

IndexedDB records are stored in the `reviewable-md` database:

```json
{
  "key": "sample.md",
  "path": "sample.md",
  "markdown": "# Project Proposal",
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

## Build

```bash
npm run build                  # outputs dist/
npm run preview                # serves the built client
```

## Status

Working pure frontend app.
