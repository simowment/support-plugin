import { Badge, Button, Text, Textarea, toast } from '@medusajs/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '../../../lib/api'
import { InstallerHint } from '../../../components/ui/installer-hint'

/**
 * Email replies to a guest ticket (someone who wrote to the support address without an
 * account). The email is the only way to answer them: write a draft, check it, then send it;
 * their answer comes back on this ticket.
 *
 * Split in three so the ticket page reads like a chat: useGuestEmailDrafts (state and calls),
 * GuestEmailBubble (one draft or sent email, shown in the thread at its time) and
 * GuestEmailComposer (docked under the thread).
 */

export type GuestDraft = {
  id: string
  body: string
  revision: number
  status: string
  recipient_email: string
  subject: string
  email_queue_id: string | null
  delivery_status?: string
  created_at?: string | null
  updated_at?: string | null
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

const statusOf = (draft: GuestDraft) => draft.delivery_status ?? draft.status

export type GuestEmail = ReturnType<typeof useGuestEmailDrafts>

export function useGuestEmailDrafts(ticketId: string | null) {
  const [drafts, setDrafts] = useState<GuestDraft[]>([])
  const [body, setBody] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRevision, setEditingRevision] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const clientId = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!ticketId) return
    const result = await adminFetch<{ drafts: GuestDraft[] }>(
      `/admin/tickets/${ticketId}/email-drafts`,
    )
    setDrafts(result.drafts)
  }, [ticketId])

  useEffect(() => {
    setDrafts([])
    setBody('')
    setEditingId(null)
    setEditingRevision(null)
    clientId.current = null
    if (!ticketId) return
    void refresh().catch(() => setDrafts([]))
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 8000)
    return () => window.clearInterval(timer)
  }, [ticketId, refresh])

  const save = async () => {
    if (!ticketId || !body.trim()) return
    setBusy(true)
    try {
      clientId.current ??= `ted_${crypto.randomUUID().replace(/-/g, '')}`
      const result = await adminFetch<{ draft: GuestDraft }>(
        `/admin/tickets/${ticketId}/email-drafts`,
        {
          method: 'POST',
          body: {
            body,
            ...(editingId
              ? { draft_id: editingId, expected_revision: editingRevision }
              : { client_id: clientId.current }),
          },
        },
      )
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

  const send = async (draft: GuestDraft) => {
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

  const edit = (draft: GuestDraft) => {
    setEditingId(draft.id)
    setEditingRevision(draft.revision)
    setBody(draft.body)
  }

  const stopEditing = () => {
    setEditingId(null)
    setEditingRevision(null)
    setBody('')
  }

  return { drafts, body, setBody, editingId, busy, save, send, edit, stopEditing }
}

/** One guest email (draft or sent) as an outgoing bubble in the thread. */
export function GuestEmailBubble({
  draft,
  email,
  canSend,
}: {
  draft: GuestDraft
  email: GuestEmail
  canSend: boolean
}) {
  const status = statusOf(draft)
  const label = STATUS_TEXT[status] ?? { label: status, color: 'grey' as const }
  const isDraft = status === 'draft'
  const editing = email.editingId === draft.id
  return (
    <div
      className={`max-w-[80%] rounded-2xl rounded-tr-sm border px-4 py-3 ${
        isDraft
          ? 'border-ui-border-strong bg-ui-bg-subtle border-dashed'
          : 'bg-ui-bg-component border-ui-border-base'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <Text size="xsmall" className="text-ui-fg-subtle min-w-0 truncate" title={draft.recipient_email}>
          Email to {draft.recipient_email}
        </Text>
        <Badge size="2xsmall" color={label.color} className="flex-shrink-0">
          {editing ? 'Editing below' : label.label}
        </Badge>
      </div>
      <Text size="small" className="leading-relaxed whitespace-pre-wrap">
        {draft.body}
      </Text>
      {isDraft && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            onClick={() => email.edit(draft)}
            disabled={email.busy}
          >
            Edit
          </Button>
          <Button
            size="small"
            onClick={() => void email.send(draft)}
            disabled={email.busy || !canSend}
            title={!canSend ? 'Email replies to guests are not set up yet.' : undefined}
          >
            Send email
          </Button>
        </div>
      )}
      {(status === 'sending' || status === 'unknown') && (
        <div className="mt-3 space-y-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            We could not confirm whether this email went out. Checking looks at the same send and
            never sends a second copy.
          </Text>
          <Button
            size="small"
            variant="secondary"
            onClick={() => void email.send(draft)}
            disabled={email.busy}
          >
            Check delivery
          </Button>
        </div>
      )}
    </div>
  )
}

/** The docked composer for a guest ticket: writes a draft, which is sent from its bubble. */
export function GuestEmailComposer({
  recipient,
  email,
  canSend,
  cannotSendReason,
}: {
  recipient: string
  email: GuestEmail
  canSend: boolean
  cannotSendReason: string | null
}) {
  return (
    <div className="space-y-2">
      {!canSend && cannotSendReason && (
        <div className="bg-ui-tag-orange-bg border-ui-tag-orange-border rounded-lg border px-3 py-2">
          <Text size="small" weight="plus">
            Email replies to guests are not set up, so this guest cannot be answered yet. Ask the
            person who installed your shop.
          </Text>
          {/* The server reason names module options and env variables. */}
          <InstallerHint className="mt-1">
            <Text size="xsmall" className="break-words whitespace-pre-wrap">
              {cannotSendReason}
            </Text>
          </InstallerHint>
        </div>
      )}
      <Textarea
        rows={3}
        value={email.body}
        onChange={(event) => email.setBody(event.target.value)}
        placeholder={`Write an email to ${recipient}…`}
        aria-label="Email reply"
        className="max-h-[40vh] min-h-[76px] resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="xsmall" className="text-ui-fg-subtle min-w-0 flex-1">
          No account: you answer by email. Save a draft, then send it from the conversation.
        </Text>
        <div className="flex items-center gap-2">
          {email.editingId && (
            <Button
              size="small"
              variant="transparent"
              onClick={email.stopEditing}
              disabled={email.busy}
            >
              Stop editing
            </Button>
          )}
          <Button
            size="small"
            variant="secondary"
            onClick={() => void email.save()}
            disabled={!email.body.trim() || email.busy}
            isLoading={email.busy}
          >
            {email.editingId ? 'Save changes' : 'Save draft'}
          </Button>
        </div>
      </div>
    </div>
  )
}
