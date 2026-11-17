import { Alert, Button, Text } from '@medusajs/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** A readable message from whatever a fetch threw (Medusa SDK errors carry `message`). */
export function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined
  if (typeof error === 'string') return error
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message
  return undefined
}

/**
 * S2. A failed load, shown where the content would be: "Could not load Store problems.
 * [Try again]". The raw error goes under "Details for support" so the owner sees one sentence.
 */
export function ErrorState({
  what,
  error,
  onRetry,
  retrying = false,
  children,
}: {
  /** What failed to load, as the page calls it: "Store problems", "your tickets". */
  what: string
  error?: unknown
  onRetry?: () => unknown
  retrying?: boolean
  /** Extra plain-words advice, e.g. what still works meanwhile. */
  children?: ReactNode
}) {
  const detail = errorMessage(error)
  return (
    <Alert variant="error" role="alert">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text size="small" weight="plus">
            Could not load {what}.
          </Text>
          {onRetry ? (
            <Button
              size="small"
              variant="secondary"
              onClick={() => void onRetry()}
              isLoading={retrying}
            >
              Try again
            </Button>
          ) : null}
        </div>
        {children}
        {detail ? (
          <details className="text-ui-fg-subtle">
            <summary className="txt-compact-xsmall cursor-pointer select-none">
              Details for support
            </summary>
            <Text size="xsmall" className="mt-1 font-mono break-all">
              {detail}
            </Text>
          </details>
        ) : null}
      </div>
    </Alert>
  )
}

/** S2. A record that does not exist (deleted, wrong link): a title, a way back and Retry. */
export function NotFoundState({
  title,
  description = 'It may have been deleted, or the link is out of date.',
  backTo,
  backLabel,
  onRetry,
}: {
  title: string
  description?: string
  backTo: string
  backLabel: string
  onRetry?: () => unknown
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-6 py-8">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="text-ui-fg-subtle">
        {description}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button size="small" variant="secondary" asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
        {onRetry ? (
          <Button size="small" variant="transparent" onClick={() => void onRetry()}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  )
}
