import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

let counter = 0

function readVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function buildThemeVariables() {
  const background = readVar('--background')
  const foreground = readVar('--foreground')
  const primary = readVar('--primary')
  const primaryForeground = readVar('--primary-foreground')
  const secondary = readVar('--secondary')
  const muted = readVar('--muted')
  const border = readVar('--border')
  return {
    background,
    primaryColor: secondary,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: muted,
    tertiaryColor: muted,
    lineColor: border,
    textColor: foreground,
    mainBkg: secondary,
    nodeBorder: border,
    clusterBkg: muted,
    clusterBorder: border,
    edgeLabelBackground: background,
    actorBkg: secondary,
    actorBorder: border,
    actorTextColor: foreground,
    signalColor: foreground,
    signalTextColor: foreground,
    labelBoxBkgColor: secondary,
    labelBoxBorderColor: border,
    labelTextColor: foreground,
    noteBkgColor: muted,
    noteBorderColor: border,
    noteTextColor: foreground,
    titleColor: foreground,
    fontFamily: 'inherit',
    darkMode: document.documentElement.getAttribute('data-mode') === 'dark',
    primaryColorInverted: primaryForeground,
    // Kept for palette consistency even though not all diagram types read it.
    accentColor: primary,
  }
}

// Load mermaid lazily so documents without diagrams don't pay for its bundle.
let mermaidPromise = null
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: buildThemeVariables(),
        securityLevel: 'strict',
      })
      return mermaid
    })
  }
  return mermaidPromise
}

function reinitMermaid() {
  if (!mermaidPromise) return Promise.resolve()
  return mermaidPromise.then((mermaid) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: buildThemeVariables(),
      securityLevel: 'strict',
    })
  })
}

// Single shared observer + pub/sub so N mounted diagrams don't each register
// their own MutationObserver on document.documentElement.
const themeChangeListeners = new Set()
let themeObserver = null
function subscribeThemeChange(listener) {
  themeChangeListeners.add(listener)
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      reinitMermaid().then(() => {
        themeChangeListeners.forEach((fn) => fn())
      })
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-mode'],
    })
  }
  return () => {
    themeChangeListeners.delete(listener)
    if (themeChangeListeners.size === 0 && themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
  }
}

// Renders a ```mermaid code block as an SVG diagram. Falls back to showing the
// raw source in a code block if the diagram fails to parse.
export default function Mermaid({ code }) {
  const ref = useRef(null)
  const [error, setError] = useState(null)
  const [svg, setSvg] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [themeVersion, setThemeVersion] = useState(0)

  useEffect(() => subscribeThemeChange(() => setThemeVersion((v) => v + 1)), [])

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
  }, [code, themeVersion])

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
