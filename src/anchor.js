// Text-quote anchoring within the rendered markdown container.
//
// A comment anchors to the visible text of the rendered markdown using a
// "text quote selector": the exact quote plus a short prefix/suffix of
// surrounding text. This survives markdown re-rendering because it does not
// depend on DOM structure or character offsets in the source.

const CONTEXT_LEN = 32

// Build a flat string of the container's text plus a map from each character
// index back to the DOM text node and offset, so we can turn a string range
// into a DOM Range for highlighting.
function buildTextIndex(container) {
  // Skip text inside rendered diagrams (Mermaid SVG) and math (KaTeX) — those
  // are not part of the reviewable prose and would pollute anchor positions.
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.parentElement?.closest('.rmd-mermaid, svg, .katex')) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let text = ''
  const map = [] // map[i] = { node, offset } for text char i
  let node
  while ((node = walker.nextNode())) {
    const value = node.nodeValue
    for (let i = 0; i < value.length; i++) {
      map.push({ node, offset: i })
    }
    text += value
  }
  return { text, map }
}

// Given a DOM selection inside the container, produce a text-quote anchor.
export function selectionToAnchor(container, range) {
  const { text } = buildTextIndex(container)
  const quote = range.toString()
  if (!quote.trim()) return null

  // Find where the selected quote sits in the flat text by walking ranges.
  const pre = document.createRange()
  pre.setStart(container, 0)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const end = start + quote.length

  return {
    quote,
    prefix: text.slice(Math.max(0, start - CONTEXT_LEN), start),
    suffix: text.slice(end, end + CONTEXT_LEN),
  }
}

// Locate an anchor's character range in the current rendered text.
// Returns { start, end } indices into the flat text, or null if not found.
export function locateAnchor(text, anchor) {
  const { quote, prefix = '', suffix = '' } = anchor
  if (!quote) return null

  // Prefer a match whose surrounding context also matches, to disambiguate
  // repeated quotes.
  let from = 0
  let best = null
  while (true) {
    const idx = text.indexOf(quote, from)
    if (idx === -1) break
    const gotPrefix = text.slice(Math.max(0, idx - prefix.length), idx)
    const gotSuffix = text.slice(idx + quote.length, idx + quote.length + suffix.length)
    let score = 0
    if (prefix && gotPrefix.endsWith(prefix)) score += 2
    if (suffix && gotSuffix.startsWith(suffix)) score += 2
    if (best === null || score > best.score) best = { idx, score }
    if (score === 4) break
    from = idx + 1
  }
  if (best === null) return null
  return { start: best.idx, end: best.idx + quote.length }
}

// Turn a character range into a DOM Range using the index map.
function rangeFromChars(container, start, end) {
  const { map } = buildTextIndex(container)
  if (start >= map.length) return null
  const startPos = map[start]
  const endPos = map[Math.min(end, map.length) - 1]
  if (!startPos || !endPos) return null
  const range = document.createRange()
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset + 1)
  return range
}

// Highlight all comment anchors in the container by wrapping matched ranges
// in <mark> elements. Returns a map of commentId -> highlight element for
// scroll/focus behavior.
export function highlightAnchors(container, comments) {
  const { text } = buildTextIndex(container)
  const elements = {}

  // Sort by position so wrapping earlier ranges doesn't invalidate later ones;
  // we re-resolve after each wrap by rebuilding the index per comment.
  const located = comments
    .map((c) => ({ c, pos: locateAnchor(text, c.anchor) }))
    .filter((x) => x.pos)
    .sort((a, b) => b.pos.start - a.pos.start) // wrap from the end backwards

  for (const { c } of located) {
    const fresh = buildTextIndex(container)
    const pos = locateAnchor(fresh.text, c.anchor)
    if (!pos) continue
    const range = rangeFromChars(container, pos.start, pos.end)
    if (!range) continue
    const mark = document.createElement('mark')
    mark.className = 'rmd-highlight'
    mark.dataset.commentId = c.id
    if (c.resolved) mark.classList.add('rmd-resolved')
    try {
      range.surroundContents(mark)
      elements[c.id] = mark
    } catch {
      // Range crosses element boundaries; skip highlight but keep the comment.
    }
  }
  return elements
}
