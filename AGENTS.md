# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local tool to review a single markdown file in the browser: render it, select text to leave inline comments, and copy those comments back to an AI as a structured prompt for the next revision. Comments persist to `<file>.review.json` next to the markdown so an AI can read them directly. Frontend is Vite + React; the backend is a zero-dependency Node server.

## Commands

```bash
npm run dev -- <file.md>      # dev: Node server + Vite (HMR), opens browser at :5174
npm run build                 # build client to dist/
node server/cli.js <file.md>  # prod: serves built dist/ (no Vite); requires `npm run build` first
npm test                      # run all tests once (vitest run)
npm run test:watch            # vitest watch mode
npx vitest run tests/App.test.jsx          # run a single test file
npx vitest run -t "writes the AI prompt"   # run tests matching a name
npx vitest run --coverage                  # coverage report (text + html in coverage/)
```

Note `npm run dev -- <file.md>` — the `--` is required so the file path reaches the CLI, not npm.

## Architecture

### Dual-mode server (`server/cli.js` + `server/lib.js`)

`cli.js` is only the entrypoint: arg parsing, file existence check, socket wiring, and (in dev) spawning Vite. All request/IO logic lives in `server/lib.js` (`createHandler`, `readComments`/`writeComments`, `parseArgs`, `serveStatic`) so it is unit-testable without a live socket. When changing server behavior, edit `lib.js` — keep `cli.js` thin.

The handler runs in one of two modes, decided at startup:
- **dev** (`RMD_DEV=1`, set by `npm run dev`, or when `dist/` is absent): spawns Vite on `port+1` and proxies all non-`/api` requests to it.
- **prod** (`dist/` exists and `RMD_DEV` unset): serves the built client from `dist/` with an SPA fallback to `index.html`.

Because `dist/` presence flips the mode, `npm run dev` forces dev via `RMD_DEV=1` so a stale `dist/` doesn't silently switch you to prod. The server always binds `127.0.0.1` (never `0.0.0.0`); the proxy targets `127.0.0.1` explicitly to avoid `localhost`→`::1` mismatches.

API surface (everything else is static/proxied): `GET /api/document` → `{path, markdown}`, `GET /api/comments` → `{comments}`, `PUT /api/comments` writes the sidecar JSON.

`vite.config.js` proxies `/api` → `:5174` only for the standalone `npm run dev:client` path; the normal `npm run dev` flow proxies the other direction (server → Vite).

### Text-quote anchoring (`src/anchor.js`)

Comments do **not** store DOM offsets or source character positions — those break when markdown re-renders. Instead each comment stores a text-quote anchor: `{quote, prefix, suffix}` (quote plus ~32 chars of surrounding context). `locateAnchor` re-finds the quote in the live rendered text and uses prefix/suffix to disambiguate repeated matches; `highlightAnchors` wraps matches in `<mark>` elements. This is what makes highlights survive re-renders and document edits.

`buildTextIndex` deliberately skips text inside `.rmd-mermaid`, `svg`, and `.katex` — diagram/math text is not reviewable prose and would pollute anchor positions. Keep that exclusion in sync if you add other non-prose rendered content.

### Rendering pipeline (`src/App.jsx`)

`react-markdown` with `remark-gfm` + `remark-math` (remark) and `rehype-highlight` + `rehype-katex` (rehype). A custom `code` component intercepts ` ```mermaid ` blocks and routes them to `src/Mermaid.jsx`, which lazy-imports `mermaid` (so docs without diagrams keep a small bundle) and falls back to showing raw source on parse error. Comment state flows App → `saveComments` (persist) → re-render → `highlightAnchors`; "Copy for AI" builds the prompt via `src/aiText.js` (open comments only, each quoting its anchored text).

## Testing notes

- jsdom lacks `Range.getBoundingClientRect` and `matchMedia`; `tests/setup.js` stubs both and registers Testing Library `cleanup`. jsdom test files opt in with a `// @vitest-environment jsdom` comment on line 1 and `import './setup.js'`.
- The traversal-guard test must use a raw `http.request` (not global `fetch`) because `fetch` normalizes `%2e%2e` away before it reaches the server.
- Server tests call `server.closeAllConnections()` in teardown — without it, `fetch` keep-alive connections make `server.close()` hang ~5s per test.
- `cli.js` (entry/socket wiring) is intentionally left uncovered.
