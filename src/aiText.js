// Build a structured, AI-friendly prompt from review comments.
//
// The output is a pretty-printed JSON string. Each comment quotes the exact
// markdown *source* text it refers to (not the rendered HTML text), so the AI
// can locate and edit the right spot in the source markdown.

import { stripFrontMatter } from './frontMatter'

// Build a normalized version of the markdown by stripping inline and block
// formatting markers, keeping a position map back to the original source.
// This lets us find a rendered-text quote inside the original markdown even
// when formatting characters (**, `, [], etc.) are present.
function buildSourceMap(md) {
  let norm = ''
  const pos = [] // pos[i] = index in md for normalized char i

  let i = 0
  let atLineStart = true

  while (i < md.length) {
    if (atLineStart) {
      const rest = md.slice(i)
      const heading = rest.match(/^#{1,6}\s+/)
      if (heading) { i += heading[0].length; atLineStart = false; continue }
      const blockquote = rest.match(/^>\s*/)
      if (blockquote) { i += blockquote[0].length; atLineStart = false; continue }
      const listItem = rest.match(/^\s*(?:[-*+]|\d+\.)\s+/)
      if (listItem) { i += listItem[0].length; atLineStart = false; continue }
      atLineStart = false
    }

    const ch = md[i]
    const next = md[i + 1]

    if (ch === '\n') {
      norm += '\n'
      pos.push(i)
      i++
      atLineStart = true
      continue
    }

    // Skip inline formatting markers
    if ((ch === '*' && next === '*') || (ch === '_' && next === '_')) { i += 2; continue }
    if (ch === '*' || ch === '_') { i += 1; continue }
    if (ch === '`') { i += 1; continue }
    if (ch === '~' && next === '~') { i += 2; continue }

    // Links/images: [text](url) or ![alt](url) → keep text only
    if (ch === '!' && next === '[') { i += 2; continue }
    if (ch === '[') { i += 1; continue }
    if (ch === ']' && next === '(') {
      i += 2
      let depth = 1
      while (i < md.length && depth > 0) {
        if (md[i] === '(') depth++
        else if (md[i] === ')') depth--
        i++
      }
      continue
    }
    if (ch === ']') { i += 1; continue }

    norm += ch
    pos.push(i)
    i++
  }

  return { norm, pos }
}

// Find the original markdown source text corresponding to a rendered-text quote.
function findMarkdownQuote(md, anchor) {
  const quote = anchor.quote
  // Match against a normalized version with formatting stripped.
  const { norm, pos } = buildSourceMap(md)
  const nIdx = norm.indexOf(quote)
  if (nIdx !== -1) {
    let start = pos[nIdx]
    let end = pos[nIdx + quote.length - 1] + 1

    // Expand backwards to include opening formatting markers.
    while (start > 0) {
      if (start >= 2 && ((md[start - 1] === '*' && md[start - 2] === '*') || (md[start - 1] === '_' && md[start - 2] === '_'))) { start -= 2; continue }
      if (md[start - 1] === '*' || md[start - 1] === '_' || md[start - 1] === '`') { start -= 1; continue }
      if (start >= 2 && md[start - 1] === '~' && md[start - 2] === '~') { start -= 2; continue }
      if (md[start - 1] === '[') { start -= 1; continue }
      if (start >= 2 && md[start - 2] === '!' && md[start - 1] === '[') { start -= 2; continue }
      break
    }

    // Expand forwards to include closing formatting markers.
    while (end < md.length) {
      if (md[end] === '*' && md[end + 1] === '*') { end += 2; continue }
      if (md[end] === '_' && md[end + 1] === '_') { end += 2; continue }
      if (md[end] === '*' || md[end] === '_' || md[end] === '`') { end += 1; continue }
      if (md[end] === '~' && md[end + 1] === '~') { end += 2; continue }
      if (md[end] === ']' && md[end + 1] === '(') {
        end += 2
        let depth = 1
        while (end < md.length && depth > 0) {
          if (md[end] === '(') depth++
          else if (md[end] === ')') depth--
          end++
        }
        continue
      }
      break
    }

    // If the selection spans filtered content (Mermaid, KaTeX, code blocks),
    // expand to include all markdown source between start and end positions.
    // This captures code blocks, diagrams, and other content that was filtered
    // from the rendered text but exists in the source.
    if (anchor.hasFilteredContent) {
      // When the selection spans filtered content (Mermaid diagrams, KaTeX,
      // code blocks), the rendered quote only contains the visible prose text
      // before/after the filtered element. To give the AI the complete context,
      // expand the quote to the full markdown section between the nearest
      // heading before the match and the next heading (or end of document).
      let sectionStart = start
      const before = md.slice(0, start)
      const prevHeading = before.match(/\n#{1,6}\s+[^\n]*\n?$/)
      if (prevHeading) {
        sectionStart = before.lastIndexOf(prevHeading[0])
      } else if (/^#{1,6}\s+/.test(md)) {
        sectionStart = 0
      }

      let sectionEnd = end
      const after = md.slice(end)
      const nextHeading = after.match(/\n#{1,6}\s+/)
      if (nextHeading) {
        sectionEnd = end + after.indexOf(nextHeading[0])
      } else {
        sectionEnd = md.length
      }

      return md.slice(sectionStart, sectionEnd)
    }

    // Otherwise, return just the matched text with formatting markers.
    return md.slice(start, end)
  }

  // Fallback: return the rendered quote as-is.
  return quote
}

export function buildAiPrompt(doc, comments) {
  const open = comments.filter((c) => !c.resolved)
  const markdown = stripFrontMatter(doc.markdown)

  const payload = {
    file: doc.path,
    instruction: 'Please revise the markdown file based on the following review comments. Each comment quotes the exact markdown source text it refers to. Apply the requested changes while keeping the rest of the document intact.',
    comments: open.map((c) => ({
      quote: findMarkdownQuote(markdown, c.anchor),
      body: c.body,
    })),
  }

  return JSON.stringify(payload, null, 2)
}
