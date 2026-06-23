import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchDocument, fetchComments, saveComments } from './api'
import { selectionToAnchor, highlightAnchors } from './anchor'
import { buildAiPrompt } from './aiText'

function uid() {
  return 'c_' + Math.random().toString(36).slice(2, 10)
}

export default function App() {
  const [doc, setDoc] = useState(null)
  const [comments, setComments] = useState([])
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null) // { anchor, x, y }
  const [draftText, setDraftText] = useState('')
  const [copied, setCopied] = useState(false)
  const contentRef = useRef(null)

  // Load document + comments on mount.
  useEffect(() => {
    Promise.all([fetchDocument(), fetchComments()])
      .then(([d, c]) => {
        setDoc(d)
        setComments(c.comments || [])
      })
      .catch((e) => setError(e.message))
  }, [])

  // Persist comments whenever they change (after initial load).
  const persist = useCallback((next) => {
    setComments(next)
    saveComments(next).catch((e) => setError(e.message))
  }, [])

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

  if (error) return <div className="rmd-error">Error: {error}</div>
  if (!doc) return <div className="rmd-loading">Loading…</div>

  const open = comments.filter((c) => !c.resolved)

  return (
    <div className="rmd-layout">
      <header className="rmd-header">
        <div className="rmd-title">📝 {doc.path}</div>
        <div className="rmd-actions">
          <span className="rmd-count">{open.length} open / {comments.length} total</span>
          <button className="rmd-btn" onClick={copyForAi} disabled={!comments.length}>
            {copied ? '✓ Copied' : 'Copy for AI'}
          </button>
        </div>
      </header>

      <main className="rmd-main">
        <article
          ref={contentRef}
          className="rmd-content"
          onMouseUp={onMouseUp}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.markdown}</ReactMarkdown>
        </article>

        <aside className="rmd-sidebar">
          <h2>Comments</h2>
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
