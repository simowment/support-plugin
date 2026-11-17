import { Button, Label, Switch, Text } from '@medusajs/ui'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * S5. Technical details (commands, environment settings, file paths, exit codes, check ids)
 * for whoever runs or develops the shop. Collapsed by default so the owner's page stays a
 * plain status line; each admin user can choose "Always show" (stored in this browser) to
 * open every one of them by default. Copy this file as-is into a plugin's
 * `src/admin/components/ui/` (scripts/check-contract-mirrors.mjs checks the copies).
 */

/** localStorage key for the per-browser "Always show technical details" choice. */
export const SHOW_TECHNICAL_KEY = 'igm.admin.showTechnical'
// Every kit copy (backend and each plugin bundle) runs in the same admin window, so a
// window event keeps all open disclosures in step when one of them changes the choice.
const SHOW_TECHNICAL_EVENT = 'igm:show-technical'

function readShowTechnical(): boolean {
  try {
    return window.localStorage.getItem(SHOW_TECHNICAL_KEY) === '1'
  } catch {
    return false
  }
}

/** Saves the choice for this browser and tells every disclosure on the page. */
export function setShowTechnical(value: boolean) {
  try {
    if (value) window.localStorage.setItem(SHOW_TECHNICAL_KEY, '1')
    else window.localStorage.removeItem(SHOW_TECHNICAL_KEY)
  } catch {
    // Storage blocked (private window, policy): the choice lasts for this page only.
  }
  try {
    window.dispatchEvent(new CustomEvent(SHOW_TECHNICAL_EVENT, { detail: value }))
  } catch {
    // No window (server render): nothing to update.
  }
}

/** The "Always show technical details" choice, kept in step across tabs and kit copies. */
export function useShowTechnical(): [boolean, (value: boolean) => void] {
  const [show, setShow] = useState(readShowTechnical)
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      setShow(typeof detail === 'boolean' ? detail : readShowTechnical())
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === SHOW_TECHNICAL_KEY) setShow(readShowTechnical())
    }
    window.addEventListener(SHOW_TECHNICAL_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SHOW_TECHNICAL_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return [show, setShowTechnical]
}

/** The switch shown inside each disclosure and on the profile page. */
export function ShowTechnicalToggle({ label = 'Always show' }: { label?: string }) {
  const [show, setShow] = useShowTechnical()
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} size="small" checked={show} onCheckedChange={(checked) => setShow(checked === true)} />
      <Label htmlFor={id} size="xsmall" className="text-ui-fg-muted cursor-pointer">
        {label}
      </Label>
    </div>
  )
}

export function InstallerHint({
  children,
  title = 'Technical details',
  className = '',
}: {
  children: ReactNode
  title?: string
  className?: string
}) {
  const [always] = useShowTechnical()
  const [open, setOpen] = useState(always)
  // Turning "Always show" on opens every disclosure; turning it off leaves them as they are.
  useEffect(() => {
    if (always) setOpen(true)
  }, [always])
  return (
    <details
      className={`text-ui-fg-subtle ${className}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="txt-compact-xsmall text-ui-fg-muted hover:text-ui-fg-subtle cursor-pointer select-none">
        {title}
      </summary>
      <div className="mt-2 flex flex-col gap-2 break-words">
        {children}
        <ShowTechnicalToggle />
      </div>
    </details>
  )
}

/** The older plugin name; same component, same label. */
export const InstallerNote = InstallerHint

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the selection-based copy.
  }
  // Admin served over plain http (rehearsal shop on the LAN): no Clipboard API.
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/** A command or value shown inside an InstallerHint, with a Copy button. */
export function InstallerCode({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 1500)
    return () => window.clearTimeout(timer)
  }, [state])
  const onCopy = async () => {
    const text = ref.current?.textContent?.trim() ?? ''
    if (!text) return
    setState((await copyText(text)) ? 'copied' : 'failed')
  }
  return (
    <div className="bg-ui-bg-subtle flex items-start gap-2 rounded-md px-3 py-2">
      <Text as="div" size="small" ref={ref} className="min-w-0 flex-1 font-mono break-all">
        {children}
      </Text>
      <Button
        type="button"
        variant="transparent"
        size="small"
        className="min-w-[96px] shrink-0 justify-center"
        onClick={onCopy}
        aria-label="Copy to clipboard"
      >
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
      </Button>
    </div>
  )
}
