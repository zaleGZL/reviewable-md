// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { selectionToAnchor, highlightAnchors } from '../src/anchor.js'

let container

beforeEach(() => {
  document.body.innerHTML = ''
  container = document.createElement('div')
  document.body.appendChild(container)
})

// Build a Range covering an exact substring within the container's text.
function rangeForText(node, substring) {
  const text = node.textContent
  const idx = text.indexOf(substring)
  const range = document.createRange()
  // Assumes the substring lives within a single text node for the test fixtures.
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let acc = 0
  let tn
  while ((tn = walker.nextNode())) {
    const len = tn.nodeValue.length
    if (acc + len > idx) {
      const offset = idx - acc
      range.setStart(tn, offset)
      range.setEnd(tn, offset + substring.length)
      return range
    }
    acc += len
  }
  throw new Error('substring not found in a single text node')
}

describe('selectionToAnchor', () => {
  it('captures the quote with surrounding context', () => {
    container.innerHTML = '<p>The quick brown fox jumps over the lazy dog.</p>'
    const range = rangeForText(container, 'brown fox')
    const anchor = selectionToAnchor(container, range)
    expect(anchor.quote).toBe('brown fox')
    expect(anchor.prefix.endsWith('quick ')).toBe(true)
    expect(anchor.suffix.startsWith(' jumps')).toBe(true)
  })

  it('returns null for a whitespace-only selection', () => {
    container.innerHTML = '<p>a   b</p>'
    const range = rangeForText(container, '   ')
    expect(selectionToAnchor(container, range)).toBeNull()
  })

  it('produces an anchor that round-trips back to the same text', () => {
    container.innerHTML = '<p>alpha beta gamma beta delta</p>'
    const range = rangeForText(container, 'gamma')
    const anchor = selectionToAnchor(container, range)
    // Re-highlight using the anchor and confirm it wraps the right word.
    const result = highlightAnchors(container, [{ id: 'x', anchor }])
    expect(result.elements.x).toBeTruthy()
    expect(result.elements.x.textContent).toBe('gamma')
  })
})

describe('highlightAnchors', () => {
  it('wraps the matched text in a <mark> with the comment id', () => {
    container.innerHTML = '<p>review this sentence please</p>'
    const anchor = { quote: 'this sentence', prefix: 'review ', suffix: ' please' }
    const result = highlightAnchors(container, [{ id: 'c42', anchor }])
    const mark = container.querySelector('mark.rmd-highlight')
    expect(mark).toBeTruthy()
    expect(mark.dataset.commentId).toBe('c42')
    expect(mark.textContent).toBe('this sentence')
    expect(result.elements.c42).toBe(mark)
  })

  it('adds a resolved class for resolved comments', () => {
    container.innerHTML = '<p>fix the typo here</p>'
    highlightAnchors(container, [
      { id: 'r1', resolved: true, anchor: { quote: 'typo' } },
    ])
    const mark = container.querySelector('mark.rmd-highlight')
    expect(mark.classList.contains('rmd-resolved')).toBe(true)
  })

  it('highlights multiple comments independently', () => {
    container.innerHTML = '<p>first second third fourth</p>'
    highlightAnchors(container, [
      { id: 'a', anchor: { quote: 'first' } },
      { id: 'b', anchor: { quote: 'third' } },
    ])
    const marks = container.querySelectorAll('mark.rmd-highlight')
    expect(marks.length).toBe(2)
  })

  it('skips text inside rendered diagrams and math', () => {
    // A mermaid SVG contains the word "node"; prose also contains it. The
    // anchor for the prose "node" must not match inside the diagram.
    container.innerHTML =
      '<div class="rmd-mermaid"><svg><text>node</text></svg></div>' +
      '<p>connect each node carefully</p>'
    const result = highlightAnchors(container, [
      { id: 'p', anchor: { quote: 'node', prefix: 'each ', suffix: ' carefully' } },
    ])
    expect(result.elements.p).toBeTruthy()
    // The highlight must live in the paragraph, not the SVG.
    expect(result.elements.p.closest('svg')).toBeNull()
    expect(result.elements.p.closest('p')).toBeTruthy()
  })

  it('skips a highlight whose range crosses element boundaries', () => {
    // "quick brown" spans the <em> boundary, so surroundContents throws and
    // the highlight is skipped — but other comments still apply and no error
    // escapes.
    container.innerHTML = '<p>the <em>quick</em> brown fox</p>'
    const result = highlightAnchors(container, [
      { id: 'cross', anchor: { quote: 'quick brown' } },
      { id: 'ok', anchor: { quote: 'fox' } },
    ])
    expect(result.elements.cross).toBeUndefined()
    // cross is not orphaned — the text exists but crosses element boundaries.
    expect(result.orphanedIds.has('cross')).toBe(false)
    expect(result.elements.ok).toBeTruthy()
    expect(result.elements.ok.textContent).toBe('fox')
  })

  it('returns no element when the anchor text is gone', () => {
    container.innerHTML = '<p>the document changed entirely</p>'
    const result = highlightAnchors(container, [
      { id: 'stale', anchor: { quote: 'no longer present' } },
    ])
    expect(result.elements.stale).toBeUndefined()
    expect(result.orphanedIds.has('stale')).toBe(true)
    expect(container.querySelector('mark.rmd-highlight')).toBeNull()
  })
})
