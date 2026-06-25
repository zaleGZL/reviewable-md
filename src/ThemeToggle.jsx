import { useState, useEffect } from 'react'
import { Check, Laptop, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const THEMES = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Laptop },
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
      <DropdownMenuContent align="end" className="w-36">
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
