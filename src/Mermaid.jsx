import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    let cancelled = false
    const id = 'mmd-' + counter++
    getMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <pre className="rmd-mermaid-error">
        <code>{code}</code>
      </pre>
    )
  }
  return <div className="rmd-mermaid" data-mermaid-source={code} ref={ref} />
}
