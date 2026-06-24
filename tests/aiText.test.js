import { describe, it, expect } from 'vitest'
import { buildAiPrompt } from '../src/aiText.js'

const doc = { path: 'spec.md', markdown: '# Spec\n\nThe widget platform is great.' }

function comment(over = {}) {
  return {
    id: 'c1',
    anchor: { quote: 'widget platform', prefix: '', suffix: '' },
    body: 'Define what a widget is.',
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('buildAiPrompt', () => {
  it('returns valid JSON', () => {
    const out = buildAiPrompt(doc, [comment()])
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('mentions the file path so the AI knows what to edit', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, [comment()]))
    expect(parsed.file).toBe('spec.md')
  })

  it('quotes the anchored text and includes the comment body', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, [comment()]))
    expect(parsed.comments[0].quote).toContain('widget platform')
    expect(parsed.comments[0].body).toBe('Define what a widget is.')
  })

  it('includes source line numbers and surrounding source lines', () => {
    const doc2 = {
      path: 'spec.md',
      markdown: '# Spec\n\nBefore line\nTarget line with widget platform.\nAfter line',
    }
    const parsed = JSON.parse(buildAiPrompt(doc2, [comment()]))

    expect(parsed.comments[0].lineStart).toBe(4)
    expect(parsed.comments[0].lineEnd).toBe(4)
    expect(parsed.comments[0].context).toEqual({
      previousLine: 'Before line',
      currentLine: 'Target line with widget platform.',
      nextLine: 'After line',
    })
  })

  it('ignores top-level front matter when locating quoted markdown', () => {
    const doc2 = {
      path: 'skill.md',
      markdown: '---\nname: hidden\ndescription: hidden\n---\n# Skill\n\nReview this text.',
    }
    const parsed = JSON.parse(buildAiPrompt(doc2, [
      comment({
        anchor: {
          quote: 'Review this text',
          prefix: '',
          suffix: '',
        },
      }),
    ]))

    expect(parsed.comments[0].quote).toBe('Review this text')
    expect(parsed.comments[0].quote).not.toContain('name: hidden')
    expect(parsed.comments[0].lineStart).toBe(7)
    expect(parsed.comments[0].context.previousLine).toBe('')
    expect(parsed.comments[0].context.currentLine).toBe('Review this text.')
  })

  it('extracts markdown source for formatted text', () => {
    const doc2 = { path: 'test.md', markdown: 'This is **bold text** here.' }
    const parsed = JSON.parse(buildAiPrompt(doc2, [
      comment({ anchor: { quote: 'bold text' } }),
    ]))
    expect(parsed.comments[0].quote).toBe('**bold text**')
  })

  it('extracts markdown source for link text', () => {
    const doc2 = { path: 'test.md', markdown: 'See [the docs](https://example.com) for info.' }
    const parsed = JSON.parse(buildAiPrompt(doc2, [
      comment({ anchor: { quote: 'the docs' } }),
    ]))
    expect(parsed.comments[0].quote).toBe('[the docs](https://example.com)')
  })

  it('sorts multiple comments by source document order', () => {
    const doc2 = {
      path: 'spec.md',
      markdown: '# Spec\n\nFirst target.\n\nSecond target.',
    }
    const parsed = JSON.parse(buildAiPrompt(doc2, [
      comment({
        id: 'b',
        body: 'second',
        anchor: { quote: 'Second target' },
      }),
      comment({
        id: 'a',
        body: 'first',
        anchor: { quote: 'First target' },
      }),
    ]))

    expect(parsed.comments).toHaveLength(2)
    expect(parsed.comments[0].body).toBe('first')
    expect(parsed.comments[1].body).toBe('second')
  })

  it('excludes resolved comments', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, [
      comment({ id: 'a', body: 'keep me', resolved: false }),
      comment({ id: 'b', body: 'drop me', resolved: true }),
    ]))
    expect(parsed.comments).toHaveLength(1)
    expect(parsed.comments[0].body).toBe('keep me')
  })

  it('has empty comments array when all are resolved', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, [comment({ resolved: true })]))
    expect(parsed.comments).toHaveLength(0)
  })

  it('has empty comments array for an empty list', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, []))
    expect(parsed.comments).toHaveLength(0)
  })

  it('expands to full section when hasFilteredContent is true', () => {
    const doc2 = {
      path: 'test.md',
      markdown: '## Data Flow\n\n```mermaid\nflowchart LR\n    A --> B\n```\n\n## Capacity Model',
    }
    const parsed = JSON.parse(buildAiPrompt(doc2, [
      comment({
        anchor: {
          quote: 'Data Flow\n',
          prefix: '',
          suffix: '',
          hasFilteredContent: true,
        },
      }),
    ]))
    expect(parsed.comments[0].quote).toContain('## Data Flow')
    expect(parsed.comments[0].quote).toContain('```mermaid')
    expect(parsed.comments[0].quote).toContain('flowchart LR')
    expect(parsed.comments[0].quote).not.toContain('## Capacity Model')
  })
})
