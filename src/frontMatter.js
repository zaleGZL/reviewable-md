export function frontMatterRange(markdown) {
  if (!markdown.startsWith('---')) return null
  const match = markdown.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return null
  return { start: 0, end: match[0].length }
}

export function stripFrontMatter(markdown) {
  const range = frontMatterRange(markdown)
  if (!range) return markdown
  return markdown.slice(range.end)
}
