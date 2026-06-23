import { useState, useEffect } from 'react'

const THEMES = [
  { key: 'light', label: 'Light', icon: '☀️' },
  { key: 'dark', label: 'Dark', icon: '🌙' },
  { key: 'system', label: 'System', icon: '🖥️' },
]
function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(mode) {
  const dark = mode === 'dark' || (mode === 'system' && getSystemDark())
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export default function ThemeToggle() {
  const [mode, setMode] = useState(() => localStorage.getItem('rmd-theme') || 'system')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    applyTheme(mode)
    localStorage.setItem('rmd-theme', mode)
  }, [mode])

  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    const timer = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handler)
    }
  }, [open])

  const current = THEMES.find((t) => t.key === mode)

  return (
    <div className="rmd-theme-toggle">
      <button
        className="rmd-theme-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        title="Switch theme"
      >
        {current.icon}
      </button>
      {open && (
        <div className="rmd-theme-menu">
          {THEMES.map((t) => (
            <button
              key={t.key}
              className={'rmd-theme-option' + (t.key === mode ? ' active' : '')}
              onClick={(e) => {
                e.stopPropagation()
                setMode(t.key)
                setOpen(false)
              }}
            >
              <span>{t.icon} {t.label}</span>
              {t.key === mode && <span className="rmd-theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
