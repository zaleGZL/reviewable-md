import { describe, it, expect } from 'vitest'
import { buildAiPrompt } from '../src/aiText.js'

const doc = { path: 'spec.md', markdown: '# Spec' }

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
  it('mentions the file path so the AI knows what to edit', () => {
    const out = buildAiPrompt(doc, [comment()])
    expect(out).toContain('`spec.md`')
  })

  it('quotes the anchored text and includes the comment body', () => {
    const out = buildAiPrompt(doc, [comment()])
    expect(out).toContain('> widget platform')
    expect(out).toContain('Define what a widget is.')
  })

  it('numbers multiple comments', () => {
    const out = buildAiPrompt(doc, [
      comment({ id: 'a', body: 'first' }),
      comment({ id: 'b', body: 'second' }),
    ])
    expect(out).toContain('## Comment 1')
    expect(out).toContain('## Comment 2')
  })

  it('excludes resolved comments', () => {
    const out = buildAiPrompt(doc, [
      comment({ id: 'a', body: 'keep me', resolved: false }),
      comment({ id: 'b', body: 'drop me', resolved: true }),
    ])
    expect(out).toContain('keep me')
    expect(out).not.toContain('drop me')
  })

  it('says there are no open comments when all are resolved', () => {
    const out = buildAiPrompt(doc, [comment({ resolved: true })])
    expect(out).toContain('No open comments')
  })

  it('says there are no open comments for an empty list', () => {
    const out = buildAiPrompt(doc, [])
    expect(out).toContain('No open comments')
  })

  it('preserves multi-line quotes as blockquote lines', () => {
    const out = buildAiPrompt(doc, [
      comment({ anchor: { quote: 'line one\nline two' } }),
    ])
    expect(out).toContain('> line one\n> line two')
  })
})
