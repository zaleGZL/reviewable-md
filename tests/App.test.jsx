// @vitest-environment jsdom
import './setup.js'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  // Stub global fetch for network-info (called on mount) and any POST saves.
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ips: [], port: null }) })
})

afterEach(() => {
  delete global.fetch
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

describe('App edit comment', () => {
  it('shows Edit button on each comment card', async () => {
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('clicking Edit replaces comment body with a textarea pre-filled with the current text', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))

    const textarea = screen.getByDisplayValue('Clarify this.')
    expect(textarea).toBeInTheDocument()
    // The <p> read-only view should be gone; only the textarea remains
    expect(document.querySelector('.rmd-card .rmd-body')).toBeNull()
  })

  it('saves the edited comment body on Save click', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByDisplayValue('Clarify this.')
    await user.clear(textarea)
    await user.type(textarea, 'Updated comment text')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    const saved = saveComments.mock.calls.at(-1)[1]
    expect(saved[0].body).toBe('Updated comment text')
    expect(saved[0].id).toBe('c1')
    // back to read mode
    expect(screen.getByText('Updated comment text')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Updated comment text')).toBeNull()
  })

  it('saves on Cmd+Enter', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByDisplayValue('Clarify this.')
    await user.clear(textarea)
    await user.type(textarea, 'Via shortcut')
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[1][0].body).toBe('Via shortcut')
  })

  it('cancels the edit without saving on Cancel click', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByDisplayValue('Clarify this.'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(saveComments).not.toHaveBeenCalled()
    expect(screen.getByText('Clarify this.')).toBeInTheDocument()
  })

  it('cancels on Escape', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const textarea = screen.getByDisplayValue('Clarify this.')
    fireEvent.keyDown(textarea, { key: 'Escape' })

    expect(saveComments).not.toHaveBeenCalled()
    expect(screen.getByText('Clarify this.')).toBeInTheDocument()
  })

  it('does not save an empty body', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByDisplayValue('Clarify this.'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

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

  it('clears all comments from the header after confirmation', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Clear all comments' }))
    await screen.findByRole('heading', { name: 'Delete all comments?' })
    await user.click(screen.getByRole('button', { name: 'Delete all comments' }))

    await waitFor(() => expect(saveComments).toHaveBeenCalled())
    expect(saveComments.mock.calls.at(-1)[1]).toEqual([])
  })

  it('does not clear comments when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Clear all comments' }))
    await screen.findByRole('heading', { name: 'Delete all comments?' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(saveComments).not.toHaveBeenCalled()
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

    fireEvent.click(screen.getByRole('button', { name: /Copy Prompt/ }))
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
    expect(screen.getByRole('button', { name: /Copy Prompt/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear all comments' })).toBeDisabled()
  })
})

describe('App source copy menu', () => {
  it('writes markdown source to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue()
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    loadLastDocument.mockResolvedValue({
      ...DOC,
      markdown: '---\nname: hidden\n---\n# Title\n\nBody',
    })
    render(<App />)
    await screen.findByText('Title')

    await user.click(screen.getByRole('button', { name: 'Copy Source' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Markdown' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toBe('# Title\n\nBody')

    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
  })

  it('writes Confluence Source Editor markup to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue()
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    loadLastDocument.mockResolvedValue({ ...DOC, markdown: '# Title\n\nBody' })
    render(<App />)
    await screen.findByText('Title')

    await user.click(screen.getByRole('button', { name: 'Copy Source' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Confluence' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toContain('<h1>Title</h1>')
    expect(writeText.mock.calls[0][0]).toContain('<p>Body</p>')

    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else delete navigator.clipboard
  })
})

describe('App editor mode', () => {
  it('starts in Preview mode with the Preview button active', async () => {
    render(<App />)
    await screen.findByText(/spec\.md/)
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editor' })).toBeInTheDocument()
    // textarea should not be visible in view mode
    expect(document.querySelector('.rmd-editor')).toBeNull()
    // article content should be visible
    expect(document.querySelector('.rmd-content')).not.toBeNull()
  })

  it('switches to Editor mode and shows a textarea with the document content', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    await user.click(screen.getByRole('button', { name: 'Editor' }))

    const textarea = document.querySelector('.rmd-editor')
    expect(textarea).not.toBeNull()
    expect(textarea.value).toBe(DOC.markdown)
    // rendered article should be gone
    expect(document.querySelector('.rmd-content')).toBeNull()
  })

  it('shows the Save button only in Editor mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Editor' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
  })

  it('hides the comments sidebar in Editor mode', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({ ...DOC, comments: [comment()] })
    render(<App />)
    await screen.findByText('Clarify this.')

    await user.click(screen.getByRole('button', { name: 'Editor' }))
    expect(document.querySelector('.rmd-sidebar')).toBeNull()
  })

  it('initialises the textarea with the full markdown including front matter', async () => {
    const user = userEvent.setup()
    loadLastDocument.mockResolvedValue({
      ...DOC,
      markdown: '---\ntitle: hidden\n---\n# Visible\n',
    })
    render(<App />)
    await screen.findByText('Visible')

    await user.click(screen.getByRole('button', { name: 'Editor' }))
    const textarea = document.querySelector('.rmd-editor')
    expect(textarea.value).toBe('---\ntitle: hidden\n---\n# Visible\n')
  })

  it('Save button POSTs edited content and updates the document in state', async () => {
    const user = userEvent.setup()
    // Override fetch for this test: network-info returns empty, POST /api/document returns ok.
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
      return Promise.resolve({ ok: true, json: async () => ({ ips: [], port: null }) })
    })

    render(<App />)
    await screen.findByText(/spec\.md/)

    await user.click(screen.getByRole('button', { name: 'Editor' }))

    const textarea = document.querySelector('.rmd-editor')
    fireEvent.change(textarea, { target: { value: '# Edited content\n' } })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const postCall = await waitFor(() => {
      const call = global.fetch.mock.calls.find(([url, opts]) => opts?.method === 'POST')
      expect(call).toBeDefined()
      return call
    })
    const body = JSON.parse(postCall[1].body)
    expect(body.path).toBe('spec.md')
    expect(body.markdown).toBe('# Edited content\n')
  })

  it('Cmd+S triggers save in Editor mode', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    await user.click(screen.getByRole('button', { name: 'Editor' }))

    fireEvent.keyDown(window, { key: 's', metaKey: true })

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(([, opts]) => opts?.method === 'POST')
      expect(postCall).toBeDefined()
    })
  })

  it('Cmd+S does nothing in Preview mode', async () => {
    render(<App />)
    await screen.findByText(/spec\.md/)

    fireEvent.keyDown(window, { key: 's', metaKey: true })

    await new Promise((r) => setTimeout(r, 50))
    const postCall = global.fetch.mock.calls.find(([, opts]) => opts?.method === 'POST')
    expect(postCall).toBeUndefined()
  })

  it('shows an error banner when Save fails', async () => {
    global.fetch = vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: false, json: async () => ({ error: 'Write failed' }) })
      return Promise.resolve({ ok: true, json: async () => ({ ips: [], port: null }) })
    })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/spec\.md/)

    await user.click(screen.getByRole('button', { name: 'Editor' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByText(/Write failed/)
  })

  it('switching back to Preview shows updated content after save', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText(/quick brown fox/)

    await user.click(screen.getByRole('button', { name: 'Editor' }))

    const textarea = document.querySelector('.rmd-editor')
    fireEvent.change(textarea, { target: { value: '# New heading\n' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(([, opts]) => opts?.method === 'POST')
      expect(postCall).toBeDefined()
    })

    await user.click(screen.getByRole('button', { name: 'Preview' }))
    await screen.findByText('New heading')
    expect(screen.queryByText(/quick brown fox/)).toBeNull()
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
