export function stripFrontMatter(markdown) {
  if (!markdown.startsWith('---')) return markdown
  const match = markdown.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return markdown
  return markdown.slice(match[0].length)
}
