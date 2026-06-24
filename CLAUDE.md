# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pure frontend tool to review a markdown file in the browser: open a `.md` file through the browser picker or drag-and-drop, render it, select text to leave inline comments, and copy those comments back to an AI as a structured prompt for the next revision. The selected markdown content and comments persist in browser IndexedDB, keyed by file name.

## Language convention

All UI text, comments, labels, and documentation in this project are in **English**. Do not use Chinese or other languages in user-facing strings or code comments.

## Commands

```bash
npm run dev                   # dev: Vite (HMR), open http://localhost:27175
npm run build                 # build client to dist/
npm run preview               # preview built client after npm run build
npm test                      # run all tests once (vitest run)
npm run test:watch            # vitest watch mode
npx vitest run tests/App.test.jsx          # run a single test file
npx vitest run -t "writes the AI prompt"   # run tests matching a name
npx vitest run --coverage                  # coverage report (text + html in coverage/)
```

## Architecture

### Pure frontend file flow (`src/App.jsx` + `src/storage.js`)

There is no backend server and no `/api` surface. `npm run dev` starts Vite directly. The app opens markdown files with browser File APIs, either from a file input or drag-and-drop. `src/storage.js` owns IndexedDB access:

- Database: `reviewable-md`
- Store: `documents`
- Document key: markdown file name
- Metadata key: `lastDocumentKey`

### Text-quote anchoring (`src/anchor.js`)

Comments do **not** store DOM offsets or source character positions — those break when markdown re-renders. Instead each comment stores a text-quote anchor: `{quote, prefix, suffix}` (quote plus ~32 chars of surrounding context). `locateAnchor` re-finds the quote in the live rendered text and uses prefix/suffix to disambiguate repeated matches; `highlightAnchors` wraps matches in `<mark>` elements. This is what makes highlights survive re-renders and document edits.

`buildTextIndex` deliberately skips text inside `.rmd-mermaid`, `svg`, and `.katex` — diagram/math text is not reviewable prose and would pollute anchor positions. Keep that exclusion in sync if you add other non-prose rendered content.

### Rendering pipeline (`src/App.jsx`)

`react-markdown` with `remark-gfm` + `remark-math` (remark) and `rehype-highlight` + `rehype-katex` (rehype). A custom `code` component intercepts ` ```mermaid ` blocks and routes them to `src/Mermaid.jsx`, which lazy-imports `mermaid` (so docs without diagrams keep a small bundle) and falls back to showing raw source on parse error. Comment state flows App → `saveComments` in `src/storage.js` (persist) → re-render → `highlightAnchors`; "Copy for AI" builds the prompt via `src/aiText.js` (open comments only, each quoting its anchored text).

## Testing notes

- jsdom lacks `Range.getBoundingClientRect` and `matchMedia`; `tests/setup.js` stubs both and registers Testing Library `cleanup`. jsdom test files opt in with a `// @vitest-environment jsdom` comment on line 1 and `import './setup.js'`.
- `tests/storage.test.js` uses `fake-indexeddb` to exercise real IndexedDB request and transaction behavior in Node.
