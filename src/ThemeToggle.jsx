import { useState, useEffect } from 'react'
import { Check, Laptop, Moon, Palette, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const THEME_MODE = {
  'github-light': 'light',
  'github-dark': 'dark',
  nord: 'dark',
  dracula: 'dark',
  'solarized-light': 'light',
  'solarized-dark': 'dark',
}

const THEMES = [
  { key: 'system', label: 'System', Icon: Laptop },
  { key: 'github-light', label: 'GitHub Light', Icon: Sun },
  { key: 'github-dark', label: 'GitHub Dark', Icon: Moon },
  { key: 'nord', label: 'Nord', Icon: Palette },
  { key: 'dracula', label: 'Dracula', Icon: Palette },
  { key: 'solarized-light', label: 'Solarized Light', Icon: Sun },
  { key: 'solarized-dark', label: 'Solarized Dark', Icon: Moon },
]

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(mode) {
  if (mode === 'system') return getSystemDark() ? 'github-dark' : 'github-light'
  return mode
}

function applyTheme(mode) {
  const theme = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.setAttribute('data-mode', THEME_MODE[theme])
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

  const current = THEMES.find((t) => t.key === mode)
  const CurrentIcon = current.Icon

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title="Switch theme"
          aria-label="Switch theme"
        >
          <CurrentIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {THEMES.map((t) => {
          const Icon = t.Icon
          return (
            <DropdownMenuItem
              key={t.key}
              onClick={() => {
                setMode(t.key)
                setOpen(false)
              }}
            >
              <Icon aria-hidden="true" />
              <span>{t.label}</span>
              {t.key === mode && <Check className="ml-auto" aria-hidden="true" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
