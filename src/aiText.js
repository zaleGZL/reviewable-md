// Build a structured, AI-friendly prompt from review comments.
//
// The goal is a paste-ready instruction the AI can act on directly: each
// comment quotes the exact text it refers to, so the AI can locate and edit
// the right spot in the source markdown.

export function buildAiPrompt(doc, comments) {
  const open = comments.filter((c) => !c.resolved)
  const lines = []

  lines.push(`Please revise the markdown file \`${doc.path}\` based on the following review comments.`)
  lines.push('')
  lines.push('Each comment quotes the exact text it refers to. Apply the requested changes while keeping the rest of the document intact.')
  lines.push('')

  if (open.length === 0) {
    lines.push('(No open comments.)')
    return lines.join('\n')
  }

  open.forEach((c, i) => {
    lines.push(`## Comment ${i + 1}`)
    lines.push('')
    lines.push('> ' + c.anchor.quote.replace(/\n/g, '\n> '))
    lines.push('')
    lines.push(c.body)
    lines.push('')
  })

  return lines.join('\n').trim()
}
