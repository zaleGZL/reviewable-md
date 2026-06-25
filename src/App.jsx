import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import './hljs-theme.css'
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  FolderOpen,
  MessageSquareText,
  Trash2,
} from 'lucide-react'
import {
  fetchServerDocument,
  loadDocument,
  loadLastDocument,
  saveDocument,
  saveComments,
} from './storage'
import { selectionToAnchor, highlightAnchors } from './anchor'
import { buildAiPrompt } from './aiText'
import { copyConfluenceSource } from './confluenceCopy'
import { stripFrontMatter } from './frontMatter'
import Mermaid from './Mermaid.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

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

function displayNameForPath(filePath) {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath
}

export default function App() {
  const [doc, setDoc] = useState(null)
  const [comments, setComments] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pathText, setPathText] = useState(() => new URLSearchParams(window.location.search).get('path') || '')
  const [draft, setDraft] = useState(null) // { anchor, x, y }
  const [draftText, setDraftText] = useState('')
  const [copied, setCopied] = useState(false)
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)
  const [copiedSource, setCopiedSource] = useState(null)
  const [lanInfo, setLanInfo] = useState({ ips: [], port: null })
  const contentRef = useRef(null)

  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => r.ok ? r.json() : { ips: [], port: null })
      .then((data) => setLanInfo({ ips: data.ips || [], port: data.port || null }))
      .catch(() => {})
  }, [])

  // Restore from the URL first so refreshes re-read the latest disk content.
  useEffect(() => {
    async function restore() {
      const filePath = new URLSearchParams(window.location.search).get('path')
      if (filePath) {
        const freshDoc = await fetchServerDocument(filePath)
        const existing = await loadDocument(freshDoc.key)
        const saved = await saveDocument(freshDoc, existing?.comments || [])
        setDoc(saved)
        setComments(saved.comments || [])
        return
      }

      const saved = await loadLastDocument()
      if (saved) {
        setDoc(saved)
        setComments(saved.comments || [])
      }
    }

    restore()
      .catch((e) => {
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }, [])

  // Persist comments whenever they change (after initial load).
  const persist = useCallback((next) => {
    if (!doc) return
    setComments(next)
    saveComments(doc.key, next).catch((e) => setError(e.message))
  }, [doc])

  async function openServerPath(filePath) {
    const trimmed = filePath.trim()
    if (!trimmed) {
      setError('Please enter an absolute markdown file path.')
      return
    }
    try {
      const freshDoc = await fetchServerDocument(trimmed)
      const existing = await loadDocument(freshDoc.key)
      const saved = await saveDocument(freshDoc, existing?.comments || [])
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set('path', freshDoc.path)
      window.history.replaceState(null, '', nextUrl)
      setPathText(freshDoc.path)
      setDoc(saved)
      setComments(saved.comments || [])
      setError(null)
      setDraft(null)
      setDraftText('')
    } catch (e) {
      setError(e.message)
    }
  }

  function onOpenPath(e) {
    e.preventDefault()
    openServerPath(pathText)
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

  function clearComments() {
    persist([])
  }

  async function copyForAi() {
    const text = buildAiPrompt(doc, comments)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function markSourceCopied(label) {
    setCopiedSource(label)
    setSourceMenuOpen(false)
    setTimeout(() => setCopiedSource(null), 1500)
  }

  async function copyMarkdownSource() {
    try {
      await navigator.clipboard.writeText(stripFrontMatter(doc.markdown))
      markSourceCopied('Markdown')
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function copyLanUrl() {
    const ip = lanInfo.ips[0]
    const port = lanInfo.port
    if (!ip || !port || !doc) return
    const lanUrl = `http://${ip}:${port}/?path=${encodeURIComponent(doc.path)}`
    try {
      await navigator.clipboard.writeText(lanUrl)
      markSourceCopied('Share Link')
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function copyConfluenceSourceForEditor() {
    try {
      await copyConfluenceSource(contentRef.current)
      markSourceCopied('Confluence')
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="rmd-loading">Loading...</div>

  if (!doc) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="rmd-header">
          <div className="flex items-center gap-2 font-mono text-sm font-semibold">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            Reviewable Markdown
          </div>
          <ThemeToggle />
        </header>
        <main className="rmd-picker">
          <Card className="w-full max-w-xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Open a markdown file</CardTitle>
              <CardDescription>Enter the full path to a local .md file.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="rmd-path-form" onSubmit={onOpenPath}>
                <Input
                  aria-label="Markdown file path"
                  value={pathText}
                  placeholder="/Users/me/project/spec.md"
                  onChange={(e) => setPathText(e.target.value)}
                />
                <Button type="submit">
                  <FolderOpen aria-hidden="true" />
                  Open path
                </Button>
              </form>
              {error && <p className="rmd-error-text">Error: {error}</p>}
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const open = comments.filter((c) => !c.resolved)
  const visibleMarkdown = stripFrontMatter(doc.markdown)
  const displayName = doc.fileMeta?.name || displayNameForPath(doc.path)

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <header className="rmd-header">
          <div className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold" title={doc.path}>
            <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate" title={doc.path}>{displayName}</span>
          </div>
          <div className="rmd-actions">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {open.length} open / {comments.length} total
            </Badge>
            <ThemeToggle />
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!comments.length}
                      aria-label="Clear all comments"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Clear all comments</TooltipContent>
              </Tooltip>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all comments?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. The current document stays open, but every saved comment for it will be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={clearComments}>
                    Delete all comments
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <DropdownMenu open={sourceMenuOpen} onOpenChange={setSourceMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-[132px]">
                  <Copy aria-hidden="true" />
                  {copiedSource ? `Copied ${copiedSource}` : 'Copy Source'}
                  <ChevronDown aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={copyMarkdownSource}>Markdown</DropdownMenuItem>
                <DropdownMenuItem onClick={copyConfluenceSourceForEditor}>Confluence</DropdownMenuItem>
                <DropdownMenuItem onClick={copyLanUrl} disabled={!lanInfo.ips.length}>Share Link</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={copyForAi} disabled={!comments.length}>
              {copied ? <Check aria-hidden="true" /> : <MessageSquareText aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy Prompt'}
            </Button>
          </div>
        </header>
        <form className="rmd-path-bar" onSubmit={onOpenPath}>
          <Input
            aria-label="Markdown file path"
            value={pathText}
            placeholder="/Users/me/project/spec.md"
            onChange={(e) => setPathText(e.target.value)}
          />
          <Button variant="outline" type="submit">
            <FolderOpen aria-hidden="true" />
            Open path
          </Button>
        </form>
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
              {visibleMarkdown}
            </ReactMarkdown>
          </article>

          <aside className="rmd-sidebar">
            <div className="rmd-sidebar-header">
              <h2>Comments</h2>
            </div>
            {comments.length === 0 && (
              <p className="rmd-hint">Select any text in the document to add a comment.</p>
            )}
            <div className="grid gap-3">
              {comments.map((c) => (
                <Card
                  key={c.id}
                  id={'card-' + c.id}
                  className={cn('rmd-card gap-3 py-4', c.resolved && 'rmd-card-resolved')}
                >
                  <CardContent className="px-4">
                    <blockquote className="rmd-quote">{c.anchor.quote}</blockquote>
                    <p className="rmd-body">{c.body}</p>
                    <Separator className="my-3" />
                    <div className="rmd-card-actions">
                      <Button variant="outline" size="sm" onClick={() => toggleResolved(c.id)}>
                        {c.resolved ? 'Reopen' : 'Resolve'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteComment(c.id)}>
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </aside>
        </main>

        {draft && (
          <Card className="rmd-draft gap-3 py-4" style={{ top: draft.top }}>
            <CardContent className="px-4">
              <blockquote className="rmd-quote">{draft.anchor.quote}</blockquote>
              <Textarea
                autoFocus
                value={draftText}
                placeholder="Write a comment..."
                className="mb-3 min-h-24 resize-y"
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment()
                  if (e.key === 'Escape') setDraft(null)
                }}
              />
              <div className="rmd-draft-actions">
                <Button onClick={addComment}>Comment</Button>
                <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                <span className="rmd-kbd">Cmd+Enter</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
