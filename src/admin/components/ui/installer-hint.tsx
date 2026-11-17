import { Text } from '@medusajs/ui'
import type { ReactNode } from 'react'

/**
 * S5. Technical details (commands, environment settings, file paths, exit codes, check ids)
 * for whoever installed the shop. Collapsed by default so the owner's page stays a plain
 * status line. Copy this file as-is into a plugin's `src/admin/components/ui/`.
 */
export function InstallerHint({
  children,
  title = 'For your installer',
  className = '',
}: {
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <details className={`text-ui-fg-subtle ${className}`}>
      <summary className="txt-compact-xsmall text-ui-fg-muted hover:text-ui-fg-subtle cursor-pointer select-none">
        {title}
      </summary>
      <div className="mt-2 flex flex-col gap-2 break-words">{children}</div>
    </details>
  )
}

/** The older plugin name; same component, same label. */
export const InstallerNote = InstallerHint

/** A command or value shown inside an InstallerHint. */
export function InstallerCode({ children }: { children: ReactNode }) {
  return (
    <Text size="small" className="bg-ui-bg-subtle rounded-md px-3 py-2 font-mono break-all">
      {children}
    </Text>
  )
}
