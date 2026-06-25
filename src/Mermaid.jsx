import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

let counter = 0

// Load mermaid lazily so documents without diagrams don't pay for its bundle.
let mermaidPromise = null
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'default',
        securityLevel: 'strict',
      })
      return mermaid
    })
  }
  return mermaidPromise
}

// Renders a ```mermaid code block as an SVG diagram. Falls back to showing the
// raw source in a code block if the diagram fails to parse.
export default function Mermaid({ code }) {
  const ref = useRef(null)
  const [error, setError] = useState(null)
  const [svg, setSvg] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    const id = 'mmd-' + counter++
    setError(null)
    setSvg('')
    getMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) setSvg(renderedSvg)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  if (error) {
    return (
      <pre className="rmd-mermaid-error">
        <code>{code}</code>
      </pre>
    )
  }

  const zoomPercent = Math.round(zoom * 100)

  return (
    <figure className="rmd-mermaid-shell">
      <div
        className="rmd-mermaid"
        data-mermaid-source={code}
        ref={ref}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="rmd-mermaid-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setZoom(1)
            setExpanded(true)
          }}
          disabled={!svg}
        >
          <Maximize2 aria-hidden="true" />
          Expand diagram
        </Button>
      </figcaption>

      {expanded && (
        <>
          <div className="rmd-mermaid-modal-backdrop" />
          <div
            className="rmd-mermaid-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded Mermaid diagram"
          >
            <div className="rmd-mermaid-modal-header">
              <div className="rmd-mermaid-modal-title">Mermaid diagram</div>
              <div className="rmd-mermaid-modal-controls">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Zoom out"
                  onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="rmd-mermaid-zoom">{zoomPercent}%</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Zoom in"
                  onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Reset zoom"
                  onClick={() => setZoom(1)}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Close expanded diagram"
                  onClick={() => setExpanded(false)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="rmd-mermaid-modal-body">
              <div
                className="rmd-mermaid-modal-canvas"
                style={{ transform: `scale(${zoom})` }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </div>
        </>
      )}
    </figure>
  )
}
