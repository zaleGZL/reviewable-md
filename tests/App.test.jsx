// @vitest-environment jsdom
import './setup.js'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const loadDocument = vi.fn()
const loadLastDocument = vi.fn()
const fetchServerDocument = vi.fn()
const saveDocument = vi.fn()
const saveComments = vi.fn()
vi.mock('../src/storage.js', () => ({
  fetchServerDocument: (...a) => fetchServerDocument(...a),
  loadDocument: (...a) => loadDocument(...a),
  loadLastDocument: (...a) => loadLastDocument(...a),
  saveDocument: (...a) => saveDocument(...a),
  saveComments: (...a) => saveComments(...a),
}))

import App from '../src/App.jsx'

const DOC = { key: 'spec.md', path: 'spec.md', markdown: 'The quick brown fox jumps.', comments: [] }

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
  window.history.replaceState(null, '', '/')
  fetchServerDocument.mockReset().mockResolvedValue(DOC)
  loadDocument.mockReset().mockResolvedValue(null)
  loadLastDocument.mockReset().mockResolvedValue(DOC)
  saveDocument.mockReset().mockImplementation(async (doc, comments = []) => ({ ...doc, comments }))
  saveComments.mockReset().mockResolvedValue({ ok: true })
})

describe('App loading and error states', () => {
  it('shows a loading indicator before data arrives', async () => {
    let resolve
    loadLastDocument.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<App />)
    expect(screen.getByText(/Loading/)).toBeInTheDocument()
    resolve(DOC)
    await waitFor(() => expect(screen.queryByText(/Loading/)).toBeNull())
  })

  it('shows the default picker when no document is restored', async () => {
    loadLastDocument.mockResolvedValue(null)
    render(<App />)
    await screen.findByText('Open a markdown file')
    expect(screen.getByText(/Enter the full path/)).toBeInTheDocument()
  })

  it('shows an error on the picker when loading fails', async () => {
    loadLastDocument.mockRejectedValue(new Error('boom'))
    render(<App />)
    await waitFor(() => expect(screen.getByText(/Error: boom/)).toBeInTheDocument())
  })

  it('renders the document path and markdown once loaded', async () => {
    render(<App />)
    await screen.findByText(/spec\.md/)
    expect(screen.getByText(/quick brown fox/)).toBeInTheDocument()
  })

  it('hides top-level front matter from the rendered document', async () => {
    loadLastDocument.mockResolvedValue({
      ...DOC,
      markdown: '---\nname: hidden-skill\ndescription: hidden description\n---\n# Visible Title\n',
    })

    render(<App />)

    await screen.findByText('Visible Title')
    expect(screen.queryByText(/hidden-skill/)).not.toBeInTheDocument()
    expect(screen.queryByText(/hidden description/)).not.toBeInTheDocument()
  })

  it('loads a disk document from the URL path', async () => {
    const diskDoc = {
      key: '/tmp/spec.md',
      path: '/tmp/spec.md',
      markdown: 'Fresh disk content',
      fileMeta: { name: 'spec.md' },
      comments: [],
    }
    window.history.replaceState(null, '', '/?path=%2Ftmp%2Fspec.md')
    fetchServerDocument.mockResolvedValue(diskDoc)

    render(<App />)

    await screen.findByText('Fresh disk content')
    const title = screen.getByText(/spec\.md/)
    expect(title).toHaveTextContent('spec.md')
    expect(title).toHaveAttribute('title', '/tmp/spec.md')
    expect(fetchServerDocument).toHaveBeenCalledWith('/tmp/spec.md')
    expect(saveDocument).toHaveBeenCalledWith(diskDoc, [])
  })

  it('preserves comments for a disk document loaded from the URL path', async () => {
    const diskDoc = {
      key: '/tmp/spec.md',
      path: '/tmp/spec.md',
      markdown: 'Fresh disk content',
      comments: [],
    }
    window.history.replaceState(null, '', '/?path=%2Ftmp%2Fspec.md')
    fetchServerDocument.mockResolvedValue(diskDoc)
    loadDocument.mockResolvedValue({ ...diskDoc, comments: [comment()] })

    render(<App />)

    await screen.findByText('Clarify this.')
    expect(saveDocument).toHaveBeenCalledWith(diskDoc, [comment()])
  })
})

describe('App comment list', () => {
  it('shows a hint when there are no comments', async () => {
    render(<App />)
    await screen.findByText(/Select any text/)
  })

  it('renders existing comments with their quote and body', async () => {
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    const { container } = render(<App />)
    await screen.findByText('Clarify this.')
    // The quote appears both as a document highlight and in the comment card;
    // assert on the card's blockquote specifically.
    const quoteEl = container.querySelector('.rmd-card .rmd-quote')
    expect(quoteEl).toHaveTextContent('quick brown')
  })

  it('shows open/total counts', async () => {
    loadLastDocument.mockResolvedValue({
      ...DOC,
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
    expect(saveComments.mock.calls.at(-1)[0]).toBe('spec.md')
    const saved = saveComments.mock.calls.at(-1)[1]
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
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Resolve' }))
    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[1][0].resolved).toBe(true)
  })

  it('deletes a comment', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[1]).toEqual([])
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

    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
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

describe('App path picker', () => {
  it('opens a server path from the default picker and persists it in the URL', async () => {
    const user = userEvent.setup()
    const diskDoc = {
      key: '/tmp/notes.md',
      path: '/tmp/notes.md',
      markdown: '# Disk Notes',
      comments: [],
    }
    loadLastDocument.mockResolvedValue(null)
    fetchServerDocument.mockResolvedValue(diskDoc)

    render(<App />)
    await screen.findByText('Open a markdown file')

    await user.type(screen.getByLabelText('Markdown file path'), '/tmp/notes.md')
    await user.click(screen.getByRole('button', { name: 'Open path' }))

    await screen.findByText('Disk Notes')
    expect(fetchServerDocument).toHaveBeenCalledWith('/tmp/notes.md')
    expect(window.location.search).toBe('?path=%2Ftmp%2Fnotes.md')
    expect(saveDocument).toHaveBeenCalledWith(diskDoc, [])
  })

  it('opens a server path from the document view and persists it in the URL', async () => {
    const user = userEvent.setup()
    const diskDoc = {
      key: '/tmp/other.md',
      path: '/tmp/other.md',
      markdown: '# Other',
      comments: [],
    }
    fetchServerDocument.mockResolvedValue(diskDoc)

    render(<App />)
    await screen.findByText(/spec\.md/)

    const pathInput = screen.getByLabelText('Markdown file path')
    await user.type(pathInput, '/tmp/other.md')
    await user.click(screen.getByRole('button', { name: 'Open path' }))

    await screen.findByText('Other')
    expect(fetchServerDocument).toHaveBeenCalledWith('/tmp/other.md')
    expect(window.location.search).toBe('?path=%2Ftmp%2Fother.md')
  })

  it('requires a non-empty path', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue(null)

    render(<App />)
    await screen.findByText('Open a markdown file')
    await user.click(screen.getByRole('button', { name: 'Open path' }))

    expect(await screen.findByText(/Please enter an absolute markdown file path/)).toBeInTheDocument()
    expect(fetchServerDocument).not.toHaveBeenCalled()
  })
})
