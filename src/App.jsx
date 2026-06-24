import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './hljs-theme.css'
import { loadDocument, loadLastDocument, readMarkdownFile, saveDocument, saveComments } from './storage'
import { selectionToAnchor, highlightAnchors } from './anchor'
import { buildAiPrompt } from './aiText'
import Mermaid from './Mermaid.jsx'
import ThemeToggle from './ThemeToggle.jsx'

// Custom renderer for fenced code: ```mermaid becomes a diagram, everything
// else falls through to react-markdown's default (with rehype-highlight applied).
const mdComponents = {
  code(props) {
    const { className = '', children, ...rest } = props
    const match = /language-mermaid/.test(className)
    if (match) {
      return <Mermaid code={String(children).replace(/\n$/, '')} />
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  },
}

function uid() {
  return 'c_' + Math.random().toString(36).slice(2, 10)
}

export default function App() {
  const [doc, setDoc] = useState(null)
  const [comments, setComments] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [draft, setDraft] = useState(null) // { anchor, x, y }
  const [draftText, setDraftText] = useState('')
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const contentRef = useRef(null)

  // Close sidebar menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(false)
    const timer = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [menuOpen])

  // Restore the most recent document from IndexedDB on mount.
  useEffect(() => {
    loadLastDocument()
      .then((saved) => {
        if (saved) {
          setDoc(saved)
          setComments(saved.comments || [])
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Persist comments whenever they change (after initial load).
  const persist = useCallback((next) => {
    if (!doc) return
    setComments(next)
    saveComments(doc.key, next).catch((e) => setError(e.message))
  }, [doc])

  async function openFile(file) {
    if (!file) return
    if (!/\.md$/i.test(file.name)) {
      setError('Please choose a markdown file with a .md extension.')
      return
    }
    try {
      const nextDoc = await readMarkdownFile(file)
      const existing = await loadDocument(nextDoc.key)
      const saved = await saveDocument(nextDoc, existing?.comments || [])
      setDoc(saved)
      setComments(saved.comments || [])
      setError(null)
      setDraft(null)
      setDraftText('')
    } catch (e) {
      setError(e.message)
    }
  }

  function onChooseFile(e) {
    openFile(e.target.files?.[0])
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
    openFile(e.dataTransfer.files?.[0])
  }

  // Re-highlight after render and whenever comments change.
  useEffect(() => {
    if (!contentRef.current) return
    // Clear previous highlights by re-rendering markdown: react-markdown owns
    // the DOM, so we strip our <mark> wrappers before re-applying.
    const container = contentRef.current
    container.querySelectorAll('mark.rmd-highlight').forEach((m) => {
      const parent = m.parentNode
      while (m.firstChild) parent.insertBefore(m.firstChild, m)
      parent.removeChild(m)
      parent.normalize()
    })
    highlightAnchors(container, comments)

    // Click a highlight -> scroll its comment card into view.
    const onClick = (e) => {
      const mark = e.target.closest('mark.rmd-highlight')
      if (!mark) return
      const card = document.getElementById('card-' + mark.dataset.commentId)
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      card?.classList.add('rmd-flash')
      setTimeout(() => card?.classList.remove('rmd-flash'), 1000)
    }
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [comments, doc])

  // Capture a text selection inside the content to start a comment draft.
  function onMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return
    const anchor = selectionToAnchor(contentRef.current, range)
    if (!anchor) return
    const rect = range.getBoundingClientRect()
    setDraft({ anchor, top: rect.bottom + window.scrollY })
    setDraftText('')
  }

  function addComment() {
    if (!draftText.trim() || !draft) return
    const comment = {
      id: uid(),
      anchor: draft.anchor,
      body: draftText.trim(),
      resolved: false,
      createdAt: new Date().toISOString(),
    }
    persist([...comments, comment])
    setDraft(null)
    setDraftText('')
    window.getSelection()?.removeAllRanges()
  }

  function deleteComment(id) {
    persist(comments.filter((c) => c.id !== id))
  }

  function toggleResolved(id) {
    persist(comments.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)))
  }

  async function copyForAi() {
    const text = buildAiPrompt(doc, comments)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <div className="rmd-loading">Loading...</div>

  if (!doc) {
    return (
      <div className="rmd-empty">
        <header className="rmd-header">
          <div className="rmd-title">Reviewable Markdown</div>
          <ThemeToggle />
        </header>
        <main
          className={'rmd-picker' + (dragActive ? ' rmd-picker-active' : '')}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragActive(false)
          }}
          onDrop={onDrop}
        >
          <div className="rmd-picker-panel">
            <h1>Open a markdown file</h1>
            <p>Drop a .md file here or choose one from your computer.</p>
            <label className="rmd-file-btn">
              Choose file
              <input type="file" accept=".md,text/markdown,text/plain" onChange={onChooseFile} />
            </label>
            {error && <p className="rmd-error-text">Error: {error}</p>}
          </div>
        </main>
      </div>
    )
  }

  const open = comments.filter((c) => !c.resolved)

  return (
    <div className="rmd-layout">
      <header className="rmd-header">
        <div className="rmd-title">📝 {doc.path}</div>
        <div className="rmd-actions">
          <span className="rmd-count">{open.length} open / {comments.length} total</span>
          <label className="rmd-secondary-btn">
            Open file
            <input type="file" accept=".md,text/markdown,text/plain" onChange={onChooseFile} />
          </label>
          <ThemeToggle />
          <button className="rmd-btn" onClick={copyForAi} disabled={!comments.length}>
            {copied ? '✓ Copied' : 'Copy for AI'}
          </button>
        </div>
      </header>
      {error && <div className="rmd-banner-error">Error: {error}</div>}

      <main className="rmd-main">
        <article
          ref={contentRef}
          className="rmd-content"
          onMouseUp={onMouseUp}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeKatex]}
            components={mdComponents}
          >
            {doc.markdown}
          </ReactMarkdown>
        </article>

        <aside className="rmd-sidebar">
          <div className="rmd-sidebar-header">
            <h2>Comments</h2>
            {comments.length > 0 && (
              <div className="rmd-sidebar-menu">
                <button
                  className="rmd-sidebar-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(!menuOpen)
                  }}
                  title="More actions"
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div className="rmd-sidebar-menu-dropdown">
                    <button
                      className="rmd-sidebar-menu-item"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Delete all comments? This cannot be undone.')) {
                          persist([])
                        }
                        setMenuOpen(false)
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {comments.length === 0 && (
            <p className="rmd-hint">Select any text in the document to add a comment.</p>
          )}
          {comments.map((c) => (
            <div
              key={c.id}
              id={'card-' + c.id}
              className={'rmd-card' + (c.resolved ? ' rmd-card-resolved' : '')}
            >
              <blockquote className="rmd-quote">{c.anchor.quote}</blockquote>
              <p className="rmd-body">{c.body}</p>
              <div className="rmd-card-actions">
                <button onClick={() => toggleResolved(c.id)}>
                  {c.resolved ? 'Reopen' : 'Resolve'}
                </button>
                <button onClick={() => deleteComment(c.id)}>Delete</button>
              </div>
            </div>
          ))}
        </aside>
      </main>

      {draft && (
        <div className="rmd-draft" style={{ top: draft.top }}>
          <blockquote className="rmd-quote">{draft.anchor.quote}</blockquote>
          <textarea
            autoFocus
            value={draftText}
            placeholder="Write a comment…"
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment()
              if (e.key === 'Escape') setDraft(null)
            }}
          />
          <div className="rmd-draft-actions">
            <button className="rmd-btn" onClick={addComment}>Comment</button>
            <button onClick={() => setDraft(null)}>Cancel</button>
            <span className="rmd-kbd">⌘+Enter</span>
          </div>
        </div>
      )}
    </div>
  )
}
