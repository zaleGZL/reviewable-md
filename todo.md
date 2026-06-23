# TODO: Fix quote extraction for KaTeX math content

## Problem

When a user selects text that includes a KaTeX-rendered math expression (e.g. `$\lambda = N \cdot r$`), the captured quote contains the **rendered KaTeX text** (MathML + HTML + annotation) instead of being excluded or mapped back to the original markdown source.

Example of broken output:

```json
{
  "quote": "Capacity Model\nWe estimate request load with λ=N⋅r\\lambda = N \\cdot rλ=N⋅r, where NNN is the number of\nembedded widgets and rrr the average refresh rate. Expected monthly cost:"
}
```

The `λ=N⋅r\lambda = N \cdot rλ=N⋅r` portion is KaTeX's rendered output (MathML text + annotation + HTML text), not the original `$\lambda = N \cdot r$`.

## What's been fixed so far

### Mermaid diagram text leaking into quotes (FIXED)

**Root cause**: `selectionToAnchor` in `src/anchor.js` used `range.toString()` to capture the selected text. This includes ALL DOM text, including Mermaid SVG/CSS content, even though `buildTextIndex` intentionally skips `.rmd-mermaid`, `svg`, and `.katex` elements.

**Fix**: Replaced `range.toString()` with a character-by-character scan using `range.comparePoint()` on both edges of each character in the filtered text index. This ensures the quote only includes text from reviewable prose nodes (those not skipped by `buildTextIndex`).

**Status**: Working — Mermaid SVG content is now excluded from quotes.

### Copy for AI output format (FIXED)

**Root cause**: `buildAiPrompt` in `src/aiText.js` produced markdown-style output (headings, blockquotes) and used the rendered-text quote directly instead of mapping it back to the original markdown source.

**Fix**:
1. Changed output format to pretty-printed JSON via `JSON.stringify(payload, null, 2)`.
2. Added `buildSourceMap()` + `findMarkdownQuote()` to map rendered-text quotes back to original markdown source by stripping formatting markers (`**`, `` ` ``, `[](url)`, etc.) and then expanding the match to include surrounding markers.

**Status**: Working for inline formatting (`**bold**`, `[link](url)`, `` `code` ``, `~~strike~~`).

## Remaining issue: KaTeX text still leaking

### Analysis

`buildTextIndex` in `src/anchor.js:18` filters text nodes with:

```js
if (n.parentElement?.closest('.rmd-mermaid, svg, .katex')) {
  return NodeFilter.FILTER_REJECT
}
```

KaTeX renders into a structure like:

```html
<span class="katex">
  <span class="katex-mathml">
    <math xmlns="...">
      <semantics>
        <mrow><mi>λ</mi><mo>=</mo>...</mrow>
        <annotation encoding="application/x-tex">\lambda = N \cdot r</annotation>
      </semantics>
    </math>
  </span>
  <span class="katex-html" aria-hidden="true">
    <span class="base"><span class="mord mathnormal">λ</span>...</span>
  </span>
</span>
```

The `.katex` selector should match the outer `<span class="katex">`, and `closest()` from any descendant should find it. However, the filter is not working — KaTeX text is still appearing in quotes.

### Possible causes

1. **`closest()` on MathML elements**: `Element.closest()` may not properly traverse from MathML elements (`<math>`, `<mi>`, `<annotation>`) up through the HTML `<span class="katex">` ancestor. While the spec says it should, browser implementations may differ.

2. **`parentElement` returning null for MathML text nodes**: In some browsers, `textNode.parentElement` may return `null` when the parent is a MathML element, causing the optional chain `?.closest()` to short-circuit to `undefined` (falsy), so the text node is accepted instead of rejected.

3. **KaTeX class name mismatch**: The KaTeX version used by `rehype-katex` might use a different class name than `katex`.

### Attempted solutions

1. **Using `range.comparePoint()` on filtered text index** — works for Mermaid (SVG is properly skipped by `buildTextIndex`), but KaTeX text nodes are still in the index, so they still leak through.

### Next steps to try

1. **Add `math` to the filter selector**: Change the filter to `.rmd-mermaid, svg, .katex, math` to catch MathML elements directly, bypassing any `closest()` traversal issues from MathML to HTML.

2. **Debug the actual DOM**: Run the dev server, inspect the KaTeX rendered DOM in the browser console, and verify what class names and element types are present. Check if `parentElement` / `closest()` works as expected on the actual elements.

3. **Alternative filter approach**: Instead of relying on `closest()`, walk up the parent chain manually with `parentNode` (which works for all node types, not just Elements) and check `className` or `tagName` at each level.

4. **Handle math in `findMarkdownQuote`**: Even if the quote contains rendered math text, improve `findMarkdownQuote` in `src/aiText.js` to recognize KaTeX-rendered patterns and map them back to the original `$...$` or `$$...$$` markdown source.
