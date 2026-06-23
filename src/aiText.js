// Build a structured, AI-friendly prompt from review comments.
//
// The output is a pretty-printed JSON string. Each comment quotes the exact
// markdown *source* text it refers to (not the rendered HTML text), so the AI
// can locate and edit the right spot in the source markdown.

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
function findMarkdownQuote(md, quote) {
  // Match against a normalized version with formatting stripped, then expand
  // to include the surrounding markdown formatting markers.
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

    return md.slice(start, end)
  }

  // Fallback: return the rendered quote as-is.
  return quote
}

export function buildAiPrompt(doc, comments) {
  const open = comments.filter((c) => !c.resolved)

  const payload = {
    file: doc.path,
    instruction: 'Please revise the markdown file based on the following review comments. Each comment quotes the exact markdown source text it refers to. Apply the requested changes while keeping the rest of the document intact.',
    comments: open.map((c) => ({
      quote: findMarkdownQuote(doc.markdown, c.anchor.quote),
      body: c.body,
    })),
  }

  return JSON.stringify(payload, null, 2)
}
