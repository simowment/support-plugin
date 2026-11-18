import { ArrowLeft } from '@medusajs/icons'
import { Heading, Text } from '@medusajs/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * S1. The top of every admin page: h1, a one-line subtitle, and at most one primary action
 * on the right. No icon, no card. Optional tools go in `links` as text links, never as a
 * second primary button (S9).
 */
export function PageHeader({
  title,
  subtitle,
  action,
  links,
  back,
}: {
  title: string
  /** One sentence: what this page is for. */
  subtitle?: ReactNode
  /** The one `variant="primary"` button that matters now. */
  action?: ReactNode
  /** Secondary tools, rendered as text links next to the action. */
  links?: ReactNode
  /** A way back for detail pages: { to: '/store-health', label: 'Store health' }. */
  back?: { to: string; label: string }
}) {
  return (
    <div className="flex flex-col gap-2 px-1">
      {back ? (
        <Link
          to={back.to}
          className="txt-compact-small text-ui-fg-subtle hover:text-ui-fg-base inline-flex w-fit items-center gap-1"
        >
          <ArrowLeft />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level="h1">{title}</Heading>
          {subtitle ? (
            <Text size="small" className="text-ui-fg-subtle">
              {subtitle}
            </Text>
          ) : null}
        </div>
        {action || links ? (
          <div className="flex flex-wrap items-center gap-3">
            {links}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  )
}
