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

  it('includes multiple comments in array order', () => {
    const parsed = JSON.parse(buildAiPrompt(doc, [
      comment({ id: 'a', body: 'first' }),
      comment({ id: 'b', body: 'second' }),
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
})
