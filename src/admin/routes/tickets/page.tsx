import { defineRouteConfig } from '@medusajs/admin-sdk'
import { ChatBubbleLeftRight, Spinner } from '@medusajs/icons'
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Table,
  Text,
  Textarea,
  toast,
} from '@medusajs/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { adminFetch } from '../../lib/api'

type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  customer_id: string
  order_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

type TicketMessage = {
  id: string
  sender_type: string
  sender_id: string | null
  message: string
  created_at: string
  attachments: unknown
}

type Attachment = {
  url: string
  filename: string
  mimeType: string
  size: number
}

type TicketEvent = {
  id: string
  event_type: string
  data: Record<string, unknown> | null
  created_at: string
}

type TicketDetails = {
  ticket: Ticket
  messages: TicketMessage[]
  events: TicketEvent[]
}

const STATUS_OPTIONS = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
  'resolved',
  'closed',
]


const CATEGORY_OPTIONS = [
  'order_issue',
  'return_request',
  'fulfillment_issue',
  'product_inquiry',
  'payment_issue',
  'general',
]

const formatLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'N/A'
  }

  return new Date(value).toLocaleString()
}

const statusColor = (status: string) => {
  if (status === 'closed' || status === 'resolved') {
    return 'green'
  }
  if (status === 'urgent' || status === 'waiting_admin') {
    return 'red'
  }
  if (status === 'waiting_customer') {
    return 'orange'
  }
  return 'blue'
}



const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const normalizeAttachments = (attachments: unknown): Attachment[] => {
  if (!attachments) {
    return []
  }
  if (Array.isArray(attachments)) {
    return attachments as Attachment[]
  }
  if (typeof attachments === 'object' && attachments !== null && 'items' in attachments) {
    const obj = attachments as { items: Attachment[] }
    return Array.isArray(obj.items) ? obj.items : []
  }
  return []
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [details, setDetails] = useState<TicketDetails | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedTicket = details?.ticket ?? tickets.find((ticket) => ticket.id === selectedTicketId)

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()

    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) {
        return false
      }
      if (categoryFilter !== 'all' && ticket.category !== categoryFilter) {
        return false
      }
      if (!term) {
        return true
      }

      return (
        ticket.subject.toLowerCase().includes(term) ||
        ticket.customer_id.toLowerCase().includes(term) ||
        ticket.id.toLowerCase().includes(term) ||
        Boolean(ticket.order_id?.toLowerCase().includes(term))
      )
    })
  }, [tickets, statusFilter, categoryFilter, search])

  const fetchTickets = async () => {
    setLoadingTickets(true)

    try {
      const data = await adminFetch<{ tickets: Ticket[] }>('/admin/tickets?limit=100')
      setTickets(data.tickets ?? [])

      if (!selectedTicketId && data.tickets?.[0]) {
        setSelectedTicketId(data.tickets[0].id)
      }
    } catch (error) {
      toast.error('Failed to load tickets', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoadingTickets(false)
    }
  }

  const fetchDetails = async (ticketId: string) => {
    setLoadingDetails(true)

    try {
      const data = await adminFetch<TicketDetails>(`/admin/tickets/${ticketId}`)
      setDetails(data)
    } catch (error) {
      toast.error('Failed to load ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setDetails(null)
    } finally {
      setLoadingDetails(false)
    }
  }

  const updateTicket = async (updates: { status?: string }) => {
    if (!selectedTicketId) {
      return
    }

    setSaving(true)

    try {
      await adminFetch<{ ticket: Ticket }>(`/admin/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        body: updates,
      })
      await Promise.all([fetchTickets(), fetchDetails(selectedTicketId)])
    } catch (error) {
      toast.error('Failed to update ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteTicket = async () => {
    if (!selectedTicketId) {
      return
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this ticket? This action cannot be undone.',
    )
    if (!confirmed) {
      return
    }

    setSaving(true)

    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}`, {
        method: 'DELETE',
      })
      setSelectedTicketId(null)
      setDetails(null)
      await fetchTickets()
      toast.success('Ticket deleted')
    } catch (error) {
      toast.error('Failed to delete ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const sendReply = async () => {
    if (!selectedTicketId || (!reply.trim() && pendingAttachments.length === 0)) {
      return
    }

    setSaving(true)

    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        body: { message: reply.trim() || '(attachment)', attachments: pendingAttachments },
      })
      setReply('')
      setPendingAttachments([])
      await Promise.all([fetchTickets(), fetchDetails(selectedTicketId)])
    } catch (error) {
      toast.error('Failed to send reply', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const uploadFiles = async (files: FileList) => {
    if (!files || files.length === 0) {
      return
    }

    setUploadingFiles(true)

    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }

      const response = await fetch('/admin/tickets/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const data = await response.json()
      const newAttachments: Attachment[] = data.attachments ?? []
      setPendingAttachments((prev) => [...prev, ...newAttachments])
    } catch (error) {
      toast.error('Failed to upload file', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setUploadingFiles(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  useEffect(() => {
    fetchTickets()
  }, [])

  useEffect(() => {
    if (selectedTicketId) {
      fetchDetails(selectedTicketId)
    } else {
      setDetails(null)
    }
  }, [selectedTicketId])

  return (
    <Container>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Heading>Support Tickets</Heading>
          <Text className="text-ui-fg-subtle mt-1">Review customer conversations and manage support status.</Text>
        </div>
        <Button variant="secondary" onClick={fetchTickets} disabled={loadingTickets}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(420px,1fr)_minmax(360px,0.9fr)] gap-4">
        <div className="rounded-lg border bg-ui-bg-base">
          <div className="grid grid-cols-[1fr_180px_180px] gap-3 border-b p-4">
            <Input
              placeholder="Search tickets"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <Select.Trigger>
                <Select.Value placeholder="Status" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Statuses</Select.Item>
                {STATUS_OPTIONS.map((status) => (
                  <Select.Item key={status} value={status}>
                    {formatLabel(status)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <Select.Trigger>
                <Select.Value placeholder="Category" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All Categories</Select.Item>
                {CATEGORY_OPTIONS.map((category) => (
                  <Select.Item key={category} value={category}>
                    {formatLabel(category)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>

          {loadingTickets ? (
            <div className="flex h-72 items-center justify-center">
              <Spinner className="animate-spin" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex h-72 items-center justify-center">
              <Text className="text-ui-fg-subtle">No tickets found.</Text>
            </div>
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Ticket</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Updated</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredTickets.map((ticket) => (
                  <Table.Row
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`cursor-pointer ${ticket.id === selectedTicketId ? 'bg-ui-bg-subtle' : ''}`}
                  >
                    <Table.Cell>
                      <div className="max-w-sm">
                        <Text size="small" weight="plus" className="truncate">
                          {ticket.subject}
                        </Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {formatLabel(ticket.category)} · {ticket.customer_id}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={statusColor(ticket.status)}>
                        {formatLabel(ticket.status)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="small" className="text-ui-fg-subtle whitespace-nowrap">
                        {formatDate(ticket.updated_at)}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </div>

        <div className="rounded-lg border bg-ui-bg-base">
          {!selectedTicket ? (
            <div className="flex h-full min-h-96 items-center justify-center p-8 text-center">
              <Text className="text-ui-fg-subtle">Select a ticket to view the conversation.</Text>
            </div>
          ) : (
            <div className="flex h-full min-h-96 flex-col">
              <div className="border-b p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Heading level="h2" className="truncate">
                      {selectedTicket.subject}
                    </Heading>
                    <a
                      href={`/customers/${selectedTicket.customer_id}`}
                      className="mt-1 inline-block text-small text-ui-fg-subtle hover:text-ui-fg-base"
                    >
                      Customer {selectedTicket.customer_id}
                    </a>
                    {selectedTicket.order_id ? (
                      <a
                        href={`/orders/${selectedTicket.order_id}`}
                        className="inline-block text-small text-ui-fg-subtle hover:text-ui-fg-base"
                      >
                        Order {selectedTicket.order_id}
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="small"
                      onClick={deleteTicket}
                      disabled={saving}
                    >
                      Delete
                    </Button>
                    {loadingDetails ? <Spinner className="animate-spin" /> : null}
                  </div>
                </div>

                <div>
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(status) => updateTicket({ status })}
                      disabled={saving}
                    >
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {STATUS_OPTIONS.map((status) => (
                          <Select.Item key={status} value={status}>
                            {formatLabel(status)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {details?.messages.length ? (
                  details.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-md border p-3 ${
                        message.sender_type === 'admin' ? 'bg-ui-bg-subtle' : 'bg-ui-bg-base'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <Badge size="2xsmall" color={message.sender_type === 'admin' ? 'blue' : 'green'}>
                          {formatLabel(message.sender_type)}
                        </Badge>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {formatDate(message.created_at)}
                        </Text>
                      </div>
                      <Text size="small" className="whitespace-pre-wrap">
                        {message.message}
                      </Text>
                      {(() => {
                        const messageAttachments = normalizeAttachments(message.attachments)
                        if (messageAttachments.length === 0) {
                          return null
                        }
                        return (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {messageAttachments.map((attachment, index) => (
                              <a
                                key={index}
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-small text-ui-fg-interactive hover:underline"
                              >
                                📄 {attachment.filename}
                              </a>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                  ))
                ) : (
                  <Text className="text-ui-fg-subtle">No messages yet.</Text>
                )}
              </div>

              <div className="border-t p-4">
                <Label htmlFor="support-ticket-reply">Reply</Label>
                <Textarea
                  id="support-ticket-reply"
                  rows={4}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a response to the customer"
                />
                {pendingAttachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pendingAttachments.map((attachment, index) => (
                      <Badge
                        key={index}
                        size="small"
                        className="flex items-center gap-1 pr-1"
                      >
                        <span className="max-w-32 truncate">{attachment.filename}</span>
                        <span className="text-ui-fg-subtle">({formatFileSize(attachment.size)})</span>
                        <button
                          type="button"
                          onClick={() => removePendingAttachment(index)}
                          className="ml-1 cursor-pointer text-ui-fg-subtle hover:text-ui-fg-base"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx"
                  onChange={(event) => event.target.files && uploadFiles(event.target.files)}
                  className="hidden"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleAttachClick}
                    disabled={uploadingFiles}
                    isLoading={uploadingFiles}
                  >
                    Attach
                  </Button>
                  <Button onClick={sendReply} disabled={(!reply.trim() && pendingAttachments.length === 0) || saving} isLoading={saving}>
                    Send Reply
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'Support Tickets',
  icon: ChatBubbleLeftRight,
})
