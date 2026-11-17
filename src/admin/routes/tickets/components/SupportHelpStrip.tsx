import { Text } from '@medusajs/ui'
import { useState } from 'react'
import type { TicketsConfig } from '../lib/ticket-page'
import { InstallerHint } from '../../../components/ui/installer-hint'
import { StatusKindBadge } from '../../../components/ui/status-badge'
import { formatList, worstStatus, type StatusKind } from '../../../components/ui/format'

const STORAGE_KEY = 'support-tickets:help-strip-hidden'

/** The owner's own choice: true = hidden, false = shown, null = not chosen (follow the status). */
function readHidden(): boolean | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (value === '1') return true
    if (value === '0') return false
    return null
  } catch {
    return null
  }
}

function writeHidden(hidden: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0')
  } catch {
    // Storage can be blocked; the strip then follows the status again next time.
  }
}

type StripItem = { title: string; kind: StatusKind; text: string }

/**
 * S3. One status per part of the support setup, in the five fixed states. Optional parts
 * that are not in use (email intake, AI) are "Off", not a warning; a part that is in use
 * but cannot work (replies not emailed) is "Needs a look".
 */
function stripItems(config: TicketsConfig): StripItem[] {
  return [
    {
      title: 'Email intake',
      kind: config.inbound_email.enabled ? 'ok' : 'off',
      text: config.inbound_email.enabled
        ? `Emails to ${config.inbound_email.recipients.join(', ') || 'the support address'} become tickets.`
        : 'Emails to the support address do not create tickets; only signed-in customers using the contact form do.',
    },
    {
      title: 'Replies to customers',
      kind: config.customer_replies.can_send ? 'ok' : 'attention',
      text: config.customer_replies.can_send
        ? config.customer_replies.reply_to === 'ticket'
          ? 'Your reply is emailed; the customer can answer by email and it lands on the ticket.'
          : 'Your reply is emailed; customer answers go to the support mailbox.'
        : 'Replies are only saved on the ticket; they are not emailed yet.',
    },
    {
      title: 'Email-only guests',
      kind: config.guest_replies.can_send
        ? 'ok'
        : config.inbound_email.enabled
          ? 'attention'
          : 'off',
      text: config.guest_replies.can_send
        ? 'People who wrote by email get a reviewed email reply (Save draft, then Send email).'
        : 'People who wrote by email cannot get an email reply yet. Drafts can still be saved.',
    },
    {
      title: 'AI suggestions',
      kind: config.ai.configured && config.ai.enabled ? 'ok' : 'off',
      text: !config.ai.configured
        ? 'No AI provider key is configured, so tickets are not analyzed.'
        : config.ai.enabled
          ? `New tickets get a suggested category and reply.${config.ai.auto_reply_enabled ? ' Auto-reply is on.' : ''}`
          : 'Turned off in AI settings.',
    },
  ]
}

function Item({ item }: { item: StripItem }) {
  return (
    <div className="min-w-[200px] flex-1">
      <div className="flex items-center gap-2">
        <Text size="xsmall" weight="plus">
          {item.title}
        </Text>
        <StatusKindBadge kind={item.kind} />
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle mt-0.5">
        {item.text}
      </Text>
    </div>
  )
}

/** One line for the collapsed strip: what needs a look, or that everything works. */
function summaryLine(items: StripItem[], worst: StatusKind): string {
  const named = (kind: StatusKind) =>
    formatList(items.filter((item) => item.kind === kind).map((item) => item.title))
  if (worst === 'problem' || worst === 'attention') {
    return `Support setup: ${named('problem') || named('attention')}.`
  }
  const off = named('off')
  return off ? `Support setup works. Off: ${off}.` : 'Support setup works.'
}

/**
 * One-glance explanation of the support inbox: where tickets come from and what this
 * shop can do with them (email intake, emailed replies, AI). Collapsed to one status line
 * when everything works; open when something needs a look, unless the owner chose
 * otherwise. Setup itself happens in the backend configuration; technical notes and the
 * host's `setup_help` hint sit in a closed "For your installer" disclosure.
 */
export function SupportHelpStrip({ config }: { config: TicketsConfig | null }) {
  const [hiddenChoice, setHiddenChoice] = useState(readHidden)
  const items = config ? stripItems(config) : []
  const worst = config ? worstStatus(items.map((item) => item.kind)) : 'not_checked'
  const needsLook = worst === 'problem' || worst === 'attention'
  const hidden = hiddenChoice ?? !needsLook

  const choose = (nextHidden: boolean) => {
    setHiddenChoice(nextHidden)
    writeHidden(nextHidden)
  }

  if (hidden) {
    return (
      <div className="bg-ui-bg-base flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 lg:px-6">
        {config ? (
          <div className="flex min-w-0 items-center gap-2">
            <StatusKindBadge kind={worst} />
            <Text size="xsmall" className="text-ui-fg-subtle truncate">
              {summaryLine(items, worst)}
            </Text>
          </div>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-expanded={false}
          className="text-ui-fg-subtle hover:text-ui-fg-base flex-shrink-0 text-xs underline underline-offset-4"
          onClick={() => choose(false)}
        >
          How support works
        </button>
      </div>
    )
  }

  return (
    <div className="bg-ui-bg-base flex-shrink-0 border-b px-4 py-3 lg:px-6">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-y-1">
          <Text size="small" className="text-ui-fg-subtle">
            Customer questions from the storefront contact form and the support mailbox. Reply here;
            customers get your answer by email. If something below needs a look, ask the person who
            installed your shop.
          </Text>
          <InstallerHint className="mt-1">
            <Text size="xsmall" className="break-words whitespace-pre-wrap">
              Email sending comes from the email queue (SMTP or Mailgun); email intake and guest
              replies come from this plugin's inbound options (inbound recipients, reply domain,
              Mailgun inbound webhook). Both are set in the backend configuration.
              {config &&
                !config.customer_replies.can_send &&
                config.customer_replies.reason &&
                ` Replies to customers: ${config.customer_replies.reason}`}
              {config &&
                !config.guest_replies.can_send &&
                config.guest_replies.reason &&
                ` Email-only guests: ${config.guest_replies.reason}`}
              {config?.setup_help?.text && (
                <>
                  {' '}
                  <span className="break-words whitespace-pre-wrap">{config.setup_help.text}</span>
                </>
              )}
              {config?.setup_help?.url && (
                <>
                  {' '}
                  <a
                    href={config.setup_help.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ui-fg-interactive hover:underline"
                  >
                    {config.setup_help.text ? 'More help' : 'Setup help'}
                  </a>
                </>
              )}
            </Text>
          </InstallerHint>
        </div>
        <button
          type="button"
          aria-expanded={true}
          className="text-ui-fg-subtle hover:text-ui-fg-base flex-shrink-0 text-xs underline underline-offset-4"
          onClick={() => choose(true)}
        >
          Hide
        </button>
      </div>
      {config && (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {items.map((item) => (
            <Item key={item.title} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
