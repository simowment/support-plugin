import { Text } from '@medusajs/ui'
import type { ReactNode } from 'react'

/**
 * Technical notes for whoever installed the shop (host commands, env variables).
 * Closed by default so the owner sees plain words first.
 */
export function InstallerNote({ children }: { children: ReactNode }) {
  return (
    <details className="mt-2">
      <summary className="text-ui-fg-muted hover:text-ui-fg-subtle txt-compact-xsmall cursor-pointer select-none">
        For your installer
      </summary>
      <Text size="xsmall" className="text-ui-fg-subtle mt-1 break-words whitespace-pre-wrap">
        {children}
      </Text>
    </details>
  )
}
