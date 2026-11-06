import { Badge, Text } from '@medusajs/ui'
import { useState } from 'react'
import type { TicketsConfig } from '../lib/ticket-page'

const STORAGE_KEY = 'support-tickets:help-strip-hidden'

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(STORAGE_KEY, '1')
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be blocked; the strip just shows again next time.
  }
}

function Item({
  title,
  state,
  ok,
  children,
}: {
  title: string
  state: string
  ok: boolean
  children: string
}) {
  return (
    <div className="min-w-[200px] flex-1">
      <div className="flex items-center gap-2">
        <Text size="xsmall" weight="plus">
          {title}
        </Text>
        <Badge size="2xsmall" color={ok ? 'green' : 'orange'}>
          {state}
        </Badge>
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
        {children}
      </Text>
    </div>
  )
}

/**
 * One-glance explanation of the support inbox: where tickets come from and what this
 * shop can do with them (email intake, emailed replies, AI). Setup itself happens in
 * the igm CLI.
 */
export function SupportHelpStrip({ config }: { config: TicketsConfig | null }) {
  const [hidden, setHidden] = useState(readHidden)

  if (hidden) {
    return (
      <div className="bg-ui-bg-base flex justify-end border-b px-4 py-1">
        <button
          type="button"
          className="text-ui-fg-subtle hover:text-ui-fg-base text-xs underline underline-offset-4"
          onClick={() => {
            setHidden(false)
            writeHidden(false)
          }}
        >
          How support works
        </button>
      </div>
    )
  }

  return (
    <div className="bg-ui-bg-base flex-shrink-0 border-b px-4 py-3 lg:px-6">
      <div className="mb-2 flex items-start justify-between gap-4">
        <Text size="small" className="text-ui-fg-subtle">
          Customer questions from the storefront contact form and the support mailbox. Reply here;
          customers get your answer by email. Set up email (sending and replies) with{' '}
          <code className="text-xs">igm shop provision mail --shop &lt;slug&gt;</code>; an existing
          SMTP account goes in with{' '}
          <code className="text-xs">igm shop configure mail --shop &lt;slug&gt;</code>.
        </Text>
        <button
          type="button"
          className="text-ui-fg-subtle hover:text-ui-fg-base flex-shrink-0 text-xs underline underline-offset-4"
          onClick={() => {
            setHidden(true)
            writeHidden(true)
          }}
        >
          Hide
        </button>
      </div>
      {config && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Item
            title="Email intake"
            state={config.inbound_email.enabled ? 'On' : 'Off'}
            ok={config.inbound_email.enabled}
          >
            {config.inbound_email.enabled
              ? `Emails to ${config.inbound_email.recipients.join(', ') || 'the support address'} become tickets.`
              : 'Emails to the support address do not create tickets; only signed-in customers using the contact form do.'}
          </Item>
          <Item
            title="Replies to customers"
            state={config.customer_replies.can_send ? 'Emailed' : 'Not emailed'}
            ok={config.customer_replies.can_send}
          >
            {config.customer_replies.can_send
              ? config.customer_replies.reply_to === 'ticket'
                ? 'Your reply is emailed; the customer can answer by email and it lands on the ticket.'
                : 'Your reply is emailed; customer answers go to the support mailbox.'
              : (config.customer_replies.reason ?? 'Replies are only saved on the ticket.')}
          </Item>
          <Item
            title="Email-only guests"
            state={config.guest_replies.can_send ? 'Can reply' : 'Cannot reply'}
            ok={config.guest_replies.can_send}
          >
            {config.guest_replies.can_send
              ? 'People who wrote by email get a reviewed email reply (Save draft, then Send email).'
              : (config.guest_replies.reason ?? 'Email replies to guests are not available.')}
          </Item>
          <Item
            title="AI suggestions"
            state={!config.ai.configured ? 'Not set up' : config.ai.enabled ? 'On' : 'Off'}
            ok={config.ai.configured && config.ai.enabled}
          >
            {!config.ai.configured
              ? 'No AI provider key is configured, so tickets are not analyzed.'
              : config.ai.enabled
                ? `New tickets get a suggested category and reply.${config.ai.auto_reply_enabled ? ' Auto-reply is on.' : ''}`
                : 'Turned off in AI settings.'}
          </Item>
        </div>
      )}
    </div>
  )
}
