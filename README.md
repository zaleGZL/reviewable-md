# Reviewable Markdown

Preview a markdown file in the browser, leave **inline review comments** on any
selected text, and **copy the comments back to an AI** so it can revise the
document in the next iteration.

Comments are persisted in the browser's IndexedDB. When a document is opened
through the local server path (`?path=/absolute/file.md`), refreshes re-read the
latest markdown content from disk while keeping the existing comments.

## Quick start

```bash
npm install
npm run dev                    # opens the default page at http://localhost:27175
npm run dev -- sample.md       # opens sample.md and persists its path in the URL
```

Then in the browser:

1. **Enter** the absolute path to a local `.md` file.
2. **Select** any text in the rendered document.
3. A comment box pops up — write your note and hit **⌘+Enter**.
4. The comment is highlighted in the document and listed in the sidebar.
5. Click **Copy for AI** to copy all open comments as a structured prompt.
6. Paste it to your AI and let it revise the markdown. Reload to review again.

Use `npm run dev -- file.md` or **Open path** when you want the URL to contain
`?path=...` and refresh from the latest disk content.

## How it works

- **Frontend** — Vite + React. Renders markdown with `react-markdown` + GFM.
  Selections are anchored using a *text-quote selector* (quote + surrounding
  context), so highlights survive markdown re-rendering.
- **Local server** — `server/cli.js` serves the app and exposes
  `GET /api/document?path=<absolute md path>` so refreshes can load the latest
  file contents from disk. The **Open path** control updates the current URL to
  that disk-backed path.
- **Storage** — comments are stored in IndexedDB and keyed by absolute file path.

## Stored document format

IndexedDB records are stored in the `reviewable-md` database:

```json
{
  "key": "/Users/me/project/sample.md",
  "path": "/Users/me/project/sample.md",
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
npm run preview                # serves the built client through server/cli.js
```

## Status

Working local app with a thin disk-read server.
