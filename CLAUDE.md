# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local markdown review tool: open a `.md` file through a full local file path, render it, select text to leave inline comments, and copy those comments back to an AI as a structured prompt for the next revision. Opened files persist their absolute path in the URL so refreshes re-read the latest disk content. Comments persist in browser IndexedDB.

## Language convention

All UI text, comments, labels, and documentation in this project are in **English**. Do not use Chinese or other languages in user-facing strings or code comments.

## Commands

```bash
npm run dev                   # dev: Node server + Vite (HMR), default page at :28175
npm run dev -- <file.md>      # dev: open file and persist its absolute path in URL
npm run build                 # build client to dist/
npm run preview               # preview built client through server/cli.js
npm test                      # run all tests once (vitest run)
npm run test:watch            # vitest watch mode
npx vitest run tests/App.test.jsx          # run a single test file
npx vitest run -t "writes the AI prompt"   # run tests matching a name
npx vitest run --coverage                  # coverage report (text + html in coverage/)
```

## Architecture

### Local server and file flow (`server/cli.js` + `server/lib.js` + `src/storage.js`)

`server/cli.js` is the local entrypoint. It can start without a file and show the default picker, or with `<file.md>` and open `/?path=<absolute path>`. In dev it spawns Vite on `port + 1` and proxies non-API requests to Vite. In preview/prod it serves `dist/`.

API surface: `GET /api/document?path=<absolute md path>` reads the latest file contents from disk and returns `{key, path, name, markdown}`. The server no longer reads or writes comments.

The app intentionally does not support browser drag-and-drop or file inputs. Browser file APIs cannot expose absolute local file paths, so all document opens go through `npm run dev -- <file.md>`, a URL `?path=...`, or the UI's **Open path** control.

`src/storage.js` owns IndexedDB access:

- Database: `reviewable-md`
- Store: `documents`
- Document key: absolute file path
- Metadata key: `lastDocumentKey`

### Text-quote anchoring (`src/anchor.js`)

Comments do **not** store DOM offsets or source character positions — those break when markdown re-renders. Instead each comment stores a text-quote anchor: `{quote, prefix, suffix}` (quote plus ~32 chars of surrounding context). `locateAnchor` re-finds the quote in the live rendered text and uses prefix/suffix to disambiguate repeated matches; `highlightAnchors` wraps matches in `<mark>` elements. This is what makes highlights survive re-renders and document edits.

`buildTextIndex` deliberately skips text inside `.rmd-mermaid`, `svg`, and `.katex` — diagram/math text is not reviewable prose and would pollute anchor positions. Keep that exclusion in sync if you add other non-prose rendered content.

### Rendering pipeline (`src/App.jsx`)

`react-markdown` with `remark-gfm` + `remark-math` (remark) and `rehype-highlight` + `rehype-katex` (rehype). A custom `code` component intercepts ` ```mermaid ` blocks and routes them to `src/Mermaid.jsx`, which lazy-imports `mermaid` (so docs without diagrams keep a small bundle) and falls back to showing raw source on parse error. Comment state flows App → `saveComments` in `src/storage.js` (persist) → re-render → `highlightAnchors`; "Copy for AI" builds the prompt via `src/aiText.js` (open comments only, each quoting its anchored text).

## Testing notes

- jsdom lacks `Range.getBoundingClientRect` and `matchMedia`; `tests/setup.js` stubs both and registers Testing Library `cleanup`. jsdom test files opt in with a `// @vitest-environment jsdom` comment on line 1 and `import './setup.js'`.
- `tests/storage.test.js` uses `fake-indexeddb` to exercise real IndexedDB request and transaction behavior in Node.
- `tests/server.test.js` covers the local disk-read API, static fallback, and dev proxy behavior.
