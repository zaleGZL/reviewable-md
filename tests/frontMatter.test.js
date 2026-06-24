import { describe, it, expect } from 'vitest'
import { frontMatterRange, stripFrontMatter } from '../src/frontMatter.js'

describe('stripFrontMatter', () => {
  it('removes YAML front matter at the top of a markdown file', () => {
    expect(stripFrontMatter('---\nname: test\ndescription: hidden\n---\n# Title\n')).toBe('# Title\n')
  })

  it('reports the source range for top-level YAML front matter', () => {
    const markdown = '---\nname: test\n---\n# Title\n'
    expect(frontMatterRange(markdown)).toEqual({ start: 0, end: 19 })
  })

  it('supports CRLF line endings', () => {
    expect(stripFrontMatter('---\r\nname: test\r\n---\r\n# Title\r\n')).toBe('# Title\r\n')
  })

  it('does not remove thematic breaks away from the top', () => {
    const markdown = '# Title\n\n---\n\nBody'
    expect(stripFrontMatter(markdown)).toBe(markdown)
  })

  it('keeps markdown unchanged when the closing fence is missing', () => {
    const markdown = '---\nname: test\n# Title\n'
    expect(stripFrontMatter(markdown)).toBe(markdown)
  })
})
