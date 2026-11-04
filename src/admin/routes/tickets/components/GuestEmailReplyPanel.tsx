import { Button, Container, Heading, Text, Textarea, toast } from '@medusajs/ui'
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

export function GuestEmailReplyPanel({
  ticketId,
  recipient,
}: {
  ticketId: string
  recipient: string
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
      const saved = result.draft
      clientId.current = null
      setEditingId(saved.id)
      setEditingRevision(saved.revision)
      setBody(saved.body)
      await refresh()
      toast.success('Email draft saved for review')
    } catch {
      toast.error('Unable to save email draft')
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
      toast.success('Email queued')
    } catch {
      toast.error('Email send needs review or reconciliation; reload the draft status')
      await refresh().catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Container className="mt-8 space-y-4">
      <div>
        <Heading level="h3">Guest email reply</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Draft and review the email before a human admin queues it. Saving does not send it.
        </Text>
      </div>
      <Text size="small">To: {recipient}</Text>
      <Textarea
        rows={5}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write an email reply…"
      />
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => void save()}
          disabled={!body.trim() || busy}
          isLoading={busy}
        >
          Save draft
        </Button>
        {editingId && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditingId(null)
              setEditingRevision(null)
              setBody('')
            }}
            disabled={busy}
          >
            New draft
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {drafts.map((draft) => (
          <div key={draft.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" weight="plus">
                To: {draft.recipient_email} · revision {draft.revision}
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {draft.delivery_status ?? draft.status}
              </Text>
            </div>
            <Text size="small" className="mt-2 whitespace-pre-wrap">
              {draft.body}
            </Text>
            {['draft', 'sending', 'unknown'].includes(draft.delivery_status ?? draft.status) && (
              <div className="mt-3 flex gap-2">
                {(draft.delivery_status ?? draft.status) === 'draft' && (
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
                )}
                <Button size="small" onClick={() => void send(draft)} disabled={busy}>
                  {draft.status === 'draft'
                    ? `Send reviewed revision ${draft.revision}`
                    : `Reconcile revision ${draft.revision}`}
                </Button>
              </div>
            )}
            {(draft.delivery_status ?? draft.status) === 'unknown' && (
              <Text size="small" className="text-ui-fg-subtle mt-3">
                Delivery outcome is uncertain. Reconciliation will inspect the same queue intent and
                will not create another email.
              </Text>
            )}
          </div>
        ))}
      </div>
    </Container>
  )
}
