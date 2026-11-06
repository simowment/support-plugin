import { Badge, Button, Container, Heading, Text, Textarea, toast } from '@medusajs/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '../../../lib/api'

type Draft = {
  id: string
  body: string
  revision: number
  status: string
  recipient_email: string
  subject: string
  email_queue_id: string | null
  delivery_status?: string
}

const STATUS_TEXT: Record<
  string,
  { label: string; color: 'grey' | 'blue' | 'green' | 'orange' | 'red' }
> = {
  draft: { label: 'Draft, not sent', color: 'grey' },
  sending: { label: 'Sending', color: 'blue' },
  processing: { label: 'Sending', color: 'blue' },
  pending: { label: 'Queued', color: 'blue' },
  queued: { label: 'Queued', color: 'blue' },
  retrying: { label: 'Retrying', color: 'orange' },
  accepted: { label: 'Sent', color: 'green' },
  sent: { label: 'Sent', color: 'green' },
  delivered: { label: 'Delivered', color: 'green' },
  unknown: { label: 'Delivery unknown', color: 'orange' },
  failed: { label: 'Not sent', color: 'red' },
  dead_letter: { label: 'Not sent', color: 'red' },
  cancelled: { label: 'Not sent (cancelled or blocked address)', color: 'red' },
}

const statusOf = (draft: Draft) => draft.delivery_status ?? draft.status

/**
 * Email reply to a guest ticket (someone who wrote to the support address without an
 * account). Write a draft, check it, then send it; the customer's answer comes back on
 * this ticket.
 */
export function GuestEmailReplyPanel({
  ticketId,
  recipient,
  canSend,
  cannotSendReason,
}: {
  ticketId: string
  recipient: string
  canSend: boolean
  cannotSendReason: string | null
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRevision, setEditingRevision] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const clientId = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    const result = await adminFetch<{ drafts: Draft[] }>(`/admin/tickets/${ticketId}/email-drafts`)
    setDrafts(result.drafts)
  }, [ticketId])

  useEffect(() => {
    void refresh().catch(() => setDrafts([]))
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 8000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const save = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      clientId.current ??= `ted_${crypto.randomUUID().replace(/-/g, '')}`
      const result = await adminFetch<{ draft: Draft }>(`/admin/tickets/${ticketId}/email-drafts`, {
        method: 'POST',
        body: {
          body,
          ...(editingId
            ? { draft_id: editingId, expected_revision: editingRevision }
            : { client_id: clientId.current }),
        },
      })
      clientId.current = null
      setEditingId(null)
      setEditingRevision(null)
      setBody('')
      await refresh()
      toast.success('Draft saved. It is not sent until you click Send email.', {
        description: result.draft ? `To ${result.draft.recipient_email}` : undefined,
      })
    } catch (error) {
      toast.error('Could not save the draft', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const send = async (draft: Draft) => {
    setBusy(true)
    try {
      await adminFetch(`/admin/tickets/email-drafts/${draft.id}/send`, {
        method: 'POST',
        body: { expected_revision: draft.revision },
      })
      await refresh()
      toast.success(statusOf(draft) === 'draft' ? 'Email queued for sending' : 'Delivery checked')
    } catch (error) {
      toast.error('Email not sent', {
        description: error instanceof Error ? error.message : undefined,
      })
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="mt-8 space-y-4">
      <div>
        <Heading level="h3">Email reply to {recipient}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          This guest has no account (they used the contact form or wrote to the support mailbox), so
          this email is the only way to answer them. Save a draft, read it again, then send it.
          Their answer comes back on this ticket.
        </Text>
      </div>
      {!canSend && cannotSendReason && (
        <div className="bg-ui-tag-orange-bg border-ui-tag-orange-border rounded-lg border p-3">
          <Text size="small" weight="plus">
            The guest cannot be answered yet.
          </Text>
          <Text size="small">{cannotSendReason}</Text>
        </div>
      )}
      <Textarea
        rows={5}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write your email reply…"
        aria-label="Email reply"
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => void save()}
          disabled={!body.trim() || busy}
          isLoading={busy}
        >
          {editingId ? 'Save changes' : 'Save draft'}
        </Button>
        {editingId && (
          <Button
            variant="transparent"
            onClick={() => {
              setEditingId(null)
              setEditingRevision(null)
              setBody('')
            }}
            disabled={busy}
          >
            Stop editing
          </Button>
        )}
      </div>
      {drafts.length > 0 && (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const status = statusOf(draft)
            const label = STATUS_TEXT[status] ?? { label: status, color: 'grey' as const }
            return (
              <div key={draft.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="small" weight="plus">
                    {draft.subject}
                  </Text>
                  <Badge size="2xsmall" color={label.color}>
                    {label.label}
                  </Badge>
                </div>
                <Text size="small" className="mt-2 whitespace-pre-wrap">
                  {draft.body}
                </Text>
                {status === 'draft' && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(draft.id)
                        setEditingRevision(draft.revision)
                        setBody(draft.body)
                      }}
                      disabled={busy}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      onClick={() => void send(draft)}
                      disabled={busy || !canSend}
                      title={!canSend ? (cannotSendReason ?? undefined) : undefined}
                    >
                      Send email
                    </Button>
                  </div>
                )}
                {(status === 'sending' || status === 'unknown') && (
                  <div className="mt-3 space-y-2">
                    <Text size="small" className="text-ui-fg-subtle">
                      We could not confirm whether this email went out. Checking looks at the same
                      send and never sends a second copy.
                    </Text>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => void send(draft)}
                      disabled={busy}
                    >
                      Check delivery
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Container>
  )
}
