# TODO: Review quote extraction for filtered content (Mermaid, KaTeX, code blocks)

## Problem

When a user selects text that spans a rendered Mermaid diagram or KaTeX math expression, the captured quote should map back to the corresponding markdown source. The original implementation had two issues:

1. **Rendered SVG/CSS leaked into quotes**: Mermaid's rendered SVG and KaTeX's rendered HTML/MathML content were included in the quote.
2. **Missing markdown source for filtered content**: When a selection spans a Mermaid diagram, the quote only contains the visible prose text (e.g. `## Data Flow`) without the original ` ```mermaid ` code block.

## What's been fixed so far

### Mermaid/KaTeX SVG content leaking into quotes (FIXED)

**Root cause**: `selectionToAnchor` in `src/anchor.js` used `range.toString()` to capture the selected text. This includes ALL DOM text, including Mermaid SVG/CSS and KaTeX HTML/MathML content.

**Fix**: Replaced `range.toString()` with a character-by-character scan using `range.comparePoint()` on both edges of each character in the filtered text index. This ensures the quote only includes text from reviewable prose nodes (those not skipped by `buildTextIndex`).

**Status**: Working — SVG/CSS/MathML content is now excluded from the quote string.

### Copy for AI output format (FIXED)

**Root cause**: `buildAiPrompt` in `src/aiText.js` produced markdown-style output and used the rendered-text quote directly.

**Fix**:
1. Changed output format to pretty-printed JSON via `JSON.stringify(payload, null, 2)`.
2. Added `buildSourceMap()` + `findMarkdownQuote()` to map rendered-text quotes back to original markdown source by stripping formatting markers and then expanding the match to include surrounding markers.

**Status**: Working for inline formatting (`**bold**`, `[link](url)`, `` `code` ``, `~~strike~~`).

### Section-based expansion for filtered content (FIXED)

**Root cause**: When a selection spans a Mermaid diagram or code block, the rendered quote only contains the visible prose text around the filtered element. `findMarkdownQuote` only had the quote text, so it couldn't determine where the original markdown source ended.

**Fix**:
1. `selectionToAnchor` in `src/anchor.js` now detects when the selection spans filtered elements (`range.intersectsNode()` on `.rmd-mermaid`, `svg`, `.katex`) and adds a `hasFilteredContent` flag to the anchor.
2. `findMarkdownQuote` in `src/aiText.js` uses this flag to expand the quote to the full markdown section between the nearest heading before the match and the next heading (or end of document).

**Status**: Working for Mermaid diagrams. When a user selects across a Mermaid diagram, the quote now includes the heading and the original ` ```mermaid ` code block.

## Remaining issues

### KaTeX text still leaking into quotes

**Analysis**: `buildTextIndex` in `src/anchor.js:18` filters text nodes with:

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
  <span class="katex-html" aria-hidden="true">...</span>
</span>
```

The `.katex` selector should match the outer `<span class="katex">`, but `closest()` from MathML elements may not traverse correctly to the HTML ancestor, or `parentElement` may be null for MathML text nodes.

**Example of broken output**:

```json
{
  "quote": "Capacity Model\nWe estimate request load with λ=N⋅r\\lambda = N \\cdot rλ=N⋅r, where NNN is the number of\nembedded widgets and rrr the average refresh rate. Expected monthly cost:"
}
```

### Possible fixes

1. **Add `math` to the filter selector**: Change the filter to `.rmd-mermaid, svg, .katex, math` to catch MathML elements directly.
2. **Walk parent chain manually**: Use `parentNode` instead of `parentElement?.closest()` to check for `.katex` ancestors across all node types.
3. **Debug actual DOM**: Inspect the rendered DOM to verify class names and element types.
