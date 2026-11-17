import { StatusBadge } from '@medusajs/ui'
import { statusColor, statusLabel, type StatusKind } from './format'

/**
 * S3. The one status badge: five fixed states with fixed labels and colours
 * (OK, Needs a look, Problem, Off, Not checked yet). Put the specifics in the text next to
 * it, not in the badge. `title` adds a tooltip, e.g. when the state was last checked.
 */
export function StatusKindBadge({
  kind,
  title,
  className,
}: {
  kind: StatusKind
  title?: string
  className?: string
}) {
  return (
    <StatusBadge color={statusColor(kind)} title={title} className={`shrink-0 ${className ?? ''}`}>
      {statusLabel(kind)}
    </StatusBadge>
  )
}
