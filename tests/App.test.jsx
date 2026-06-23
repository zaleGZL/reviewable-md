// @vitest-environment jsdom
import './setup.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the API client; App should call these and react to results.
const fetchDocument = vi.fn()
const fetchComments = vi.fn()
const saveComments = vi.fn()
vi.mock('../src/api.js', () => ({
  fetchDocument: (...a) => fetchDocument(...a),
  fetchComments: (...a) => fetchComments(...a),
  saveComments: (...a) => saveComments(...a),
}))

import App from '../src/App.jsx'

const DOC = { path: 'spec.md', markdown: 'The quick brown fox jumps.' }

function comment(over = {}) {
  return {
    id: 'c1',
    anchor: { quote: 'quick brown', prefix: 'The ', suffix: ' fox' },
    body: 'Clarify this.',
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// Select an exact substring within the rendered document so onMouseUp fires
// with a non-collapsed range.
function selectText(substring) {
  const article = document.querySelector('.rmd-content')
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    const idx = node.nodeValue.indexOf(substring)
    if (idx !== -1) {
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, idx + substring.length)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      article.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      return
    }
  }
  throw new Error(`text not found: ${substring}`)
}

beforeEach(() => {
  fetchDocument.mockReset().mockResolvedValue(DOC)
  fetchComments.mockReset().mockResolvedValue({ comments: [] })
  saveComments.mockReset().mockResolvedValue({ ok: true })
})

describe('App loading and error states', () => {
  it('shows a loading indicator before data arrives', async () => {
    let resolve
    fetchDocument.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<App />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    resolve(DOC)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
  })

  it('shows an error when loading fails', async () => {
    fetchDocument.mockRejectedValue(new Error('boom'))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Error: boom/)).toBeInTheDocument())
  })

  it('renders the document path and markdown once loaded', async () => {
    render(<App />)
    await screen.findByText(/spec\.md/)
    expect(screen.getByText(/quick brown fox/)).toBeInTheDocument()
  })
})

describe('App comment list', () => {
  it('shows a hint when there are no comments', async () => {
    render(<App />)
    await screen.findByText(/Select any text/)
  })

  it('renders existing comments with their quote and body', async () => {
    fetchComments.mockResolvedValue({ comments: [comment()] })
    const { container } = render(<App />)
    await screen.findByText('Clarify this.')
    // The quote appears both as a document highlight and in the comment card;
    // assert on the card's blockquote specifically.
    const quoteEl = container.querySelector('.rmd-card .rmd-quote')
    expect(quoteEl).toHaveTextContent('quick brown')
  })

  it('shows open/total counts', async () => {
    fetchComments.mockResolvedValue({
      comments: [comment({ id: 'a' }), comment({ id: 'b', resolved: true })],
    })
    render(<App />)
    await screen.findByText(/1 open \/ 2 total/)
  })
})

describe('App adding a comment', () => {
  it('opens a draft on text selection and saves the new comment', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    selectText('quick brown')
    const textarea = await screen.findByPlaceholderText(/Write a comment/)
    await user.type(textarea, 'Please rephrase')
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    const saved = saveComments.mock.calls.at(-1)[0]
    expect(saved).toHaveLength(1)
    expect(saved[0].body).toBe('Please rephrase')
    expect(saved[0].anchor.quote).toBe('quick brown')
  })

  it('cancels the draft without saving', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    selectText('quick brown')
    await screen.findByPlaceholderText(/Write a comment/)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByPlaceholderText(/Write a comment/)).toBeNull()
    expect(saveComments).not.toHaveBeenCalled()
  })

  it('does not save an empty comment', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    selectText('quick brown')
    await screen.findByPlaceholderText(/Write a comment/)
    await user.click(screen.getByRole('button', { name: 'Comment' }))

    expect(saveComments).not.toHaveBeenCalled()
  })
})

describe('App resolve and delete', () => {
  it('resolves a comment', async () => {
    const user = userEvent.setup()
    fetchComments.mockResolvedValue({ comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[0][0].resolved).toBe(true)
  })

  it('deletes a comment', async () => {
    const user = userEvent.setup()
    fetchComments.mockResolvedValue({ comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[0]).toEqual([])
  })
})

describe('App copy for AI', () => {
  it('writes the AI prompt to the clipboard', async () => {
    // Stub clipboard before render and click with fireEvent so userEvent's own
    // clipboard handling doesn't shadow the spy.
    const writeText = vi.fn().mockResolvedValue()
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    fetchComments.mockResolvedValue({ comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    fireEvent.click(screen.getByRole('button', { name: /Copy for AI/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('spec.md')
    expect(text).toContain('quick brown')
    expect(text).toContain('Clarify this.')

    if (original) Object.defineProperty(navigator, 'clipboard', original)
  })

  it('disables the copy button when there are no comments', async () => {
    render(<App />)
    await screen.findByText(/spec\.md/)
    expect(screen.getByRole('button', { name: /Copy for AI/ })).toBeDisabled()
  })
})
