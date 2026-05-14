import { defineRouteConfig } from '@medusajs/admin-sdk'
import { ChatBubbleLeftRight, Spinner } from '@medusajs/icons'
import {
  Badge,
  Button,
  Checkbox,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminFetch } from '../../lib/api'

type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  assigned_to: string | null
  customer_id: string
  order_id: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown> | null
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

type TicketNote = {
  id: string
  ticket_id: string
  content: string
  author_id: string | null
  created_at: string
  updated_at: string
}

type TicketEvent = {
  id: string
  event_type: string
  data: Record<string, unknown> | null
  performed_by_type: string | null
  created_at: string
}

type TicketDetails = {
  ticket: Ticket
  messages: TicketMessage[]
  events: TicketEvent[]
  notes: TicketNote[]
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

const CANNED_RESPONSES = [
  {
    label: 'Order status',
    value: 'Thanks for reaching out. We are checking the latest status of your order and will update you shortly.',
  },
  {
    label: 'Return instructions',
    value: 'We can help with your return. Please confirm the item condition and whether the original packaging is available.',
  },
  {
    label: 'Refund processing',
    value: 'Your refund request is being reviewed. Once approved, refunds usually appear on the original payment method within a few business days.',
  },
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
  if (status === 'waiting_admin') {
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

const getAttachmentUrl = (attachment: Attachment) => {
  const separator = attachment.url.includes('?') ? '&' : '?'
  return `${attachment.url}${separator}v=${attachment.size}`
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
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [assignedToInput, setAssignedToInput] = useState('')
  const [loadingCustomer, setLoadingCustomer] = useState(false)
  const [customerTickets, setCustomerTickets] = useState<Ticket[]>([])
  const [loadingCustomerTickets, setLoadingCustomerTickets] = useState(false)
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkAssignedTo, setBulkAssignedTo] = useState('')
  // Notes
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  // Notifications / customer replies
  const [recentTicketCount, setRecentTicketCount] = useState(0)
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  // Merge
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSourceId, setMergeSourceId] = useState('')

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

  const fetchTickets = useCallback(async () => {
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
  }, [selectedTicketId])

  const fetchDetails = useCallback(async (ticketId: string) => {
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
  }, [])

  const fetchCustomer = useCallback(async (customerId: string) => {
    setLoadingCustomer(true)
    const requestedId = customerId
    try {
      const data = await adminFetch<{ customer: { first_name?: string; last_name?: string; email?: string } }>(
        `/admin/customers/${customerId}`
      )
      const customer = data.customer
      if (customer) {
        const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customerId
        if (selectedTicket?.customer_id === requestedId) {
          setCustomerName(name)
          setCustomerEmail(customer.email ?? null)
        }
      }
    } catch (e) {
      console.warn('Failed to fetch customer details:', e)
      setCustomerName(null)
      setCustomerEmail(null)
    } finally {
      setLoadingCustomer(false)
    }
  }, [selectedTicket?.customer_id])

  const fetchCustomerTickets = useCallback(async (customerId: string) => {
    setLoadingCustomerTickets(true)
    try {
      const data = await adminFetch<{ tickets: Ticket[] }>(
        `/admin/tickets?customer_id=${encodeURIComponent(customerId)}&limit=10`,
      )
      setCustomerTickets(data.tickets ?? [])
    } catch (error) {
      toast.error('Failed to load customer history', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setCustomerTickets([])
    } finally {
      setLoadingCustomerTickets(false)
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifications(true)
    try {
      const data = await adminFetch<{ recent_ticket_count: number }>('/admin/tickets/notifications')
      setRecentTicketCount(data.recent_ticket_count ?? 0)
    } catch {
      // Non-critical: notification count failure should not interrupt workflow
      setRecentTicketCount(0)
    } finally {
      setLoadingNotifications(false)
    }
  }, [])

  const updateTicket = async (updates: { status?: string; assigned_to?: string | null }) => {
    if (!selectedTicketId) return
    setSaving(true)
    try {
      const updated = await adminFetch<{ ticket: Ticket }>(`/admin/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        body: updates,
      })
      setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, ...updated.ticket } : t))
      setDetails(prev => prev ? { ...prev, ticket: { ...prev.ticket, ...updated.ticket } } : prev)
      if (updates.status) {
        toast.success(`Status updated to ${formatLabel(updates.status)}`)
      }
    } catch (error) {
      toast.error('Failed to update ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const bulkUpdateTickets = async (updates: { status?: string; assigned_to?: string | null }) => {
    const ticketIds = Array.from(selectedTicketIds)
    if (ticketIds.length === 0) return

    setBulkSaving(true)
    try {
      const data = await adminFetch<{ tickets: Ticket[] }>('/admin/tickets/bulk', {
        method: 'POST',
        body: {
          ticket_ids: ticketIds,
          ...updates,
        },
      })

      setTickets((current) =>
        current.map((ticket) => {
          const updated = data.tickets.find((item) => item.id === ticket.id)
          return updated ? { ...ticket, ...updated } : ticket
        }),
      )
      setDetails((current) => {
        if (!current) return current
        const updated = data.tickets.find((ticket) => ticket.id === current.ticket.id)
        return updated ? { ...current, ticket: { ...current.ticket, ...updated } } : current
      })
      setSelectedTicketIds(new Set())
      toast.success('Tickets updated')
    } catch (error) {
      toast.error('Failed to update tickets', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setBulkSaving(false)
    }
  }

  const toggleTicketSelection = (ticketId: string, checked: boolean) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(ticketId)
      } else {
        next.delete(ticketId)
      }
      return next
    })
  }

  const sendReply = async () => {
    if (!selectedTicketId) return
    if (!reply.trim() && pendingAttachments.length === 0) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { message: reply.trim() || '(attachment)' }
      if (pendingAttachments.length > 0) {
        body.attachments = pendingAttachments.map((a) => ({
          url: a.url,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
        }))
      }
      await adminFetch(`/admin/tickets/${selectedTicketId}/messages`, { method: 'POST', body })
      setReply('')
      setPendingAttachments([])
      toast.success('Reply sent')
      await fetchDetails(selectedTicketId)
    } catch (error) {
      toast.error('Failed to send reply', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const uploadFiles = async (files: FileList) => {
    if (files.length === 0) return
    setUploadingFiles(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }
      const result = await adminFetch<{ attachments: Attachment[] }>('/admin/tickets/upload', {
        method: 'POST',
        body: formData,
        // Let adminFetch use fetch with FormData (no Content-Type header)
      } as any)
      setPendingAttachments((prev) => [...prev, ...result.attachments])
    } catch (error) {
      toast.error('File upload failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setUploadingFiles(false)
    }
  }

  const handleAttachClick = () => fileInputRef.current?.click()
  const removePendingAttachment = (index: number) =>
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index))

  // Merge ticket
  const mergeTicket = async (sourceTicketId: string) => {
    if (!selectedTicketId) return
    if (sourceTicketId === selectedTicketId) {
      toast.error('Cannot merge a ticket with itself.')
      return
    }
    setSaving(true)
    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}/merge`, {
        method: 'POST',
        body: { source_ticket_id: sourceTicketId },
      })
      toast.success('Ticket merged')
      await fetchDetails(selectedTicketId)
      await fetchTickets()
    } catch (error) {
      toast.error('Failed to merge ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  // Notes
  const addNote = async () => {
    if (!selectedTicketId || !noteContent.trim()) return
    setAddingNote(true)
    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}/notes`, {
        method: 'POST',
        body: { content: noteContent.trim() },
      })
      setNoteContent('')
      toast.success('Note added')
      await fetchDetails(selectedTicketId)
    } catch (error) {
      toast.error('Failed to add note', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setAddingNote(false)
    }
  }

  useEffect(() => {
    fetchTickets()
    fetchNotifications()
    const interval = setInterval(() => {
      fetchTickets()
      fetchNotifications()
    }, 15_000)
    return () => clearInterval(interval)
  }, [fetchTickets, fetchNotifications])

  useEffect(() => {
    if (selectedTicketId) {
      fetchDetails(selectedTicketId)
      setReply('')
      setNoteContent('')
      const interval = setInterval(() => fetchDetails(selectedTicketId), 5_000)
      return () => clearInterval(interval)
    } else {
      setDetails(null)
    }
  }, [selectedTicketId, fetchDetails])

  useEffect(() => {
    if (selectedTicket?.customer_id) {
      fetchCustomer(selectedTicket.customer_id)
      fetchCustomerTickets(selectedTicket.customer_id)
      setAssignedToInput(selectedTicket.assigned_to ?? '')
    }
  }, [selectedTicket?.customer_id, selectedTicket?.assigned_to, fetchCustomer, fetchCustomerTickets])

  return (
    <Container>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Heading>Support Tickets</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} total
          </Text>
        </div>
        <div className="flex items-center gap-4">
          {!loadingNotifications && recentTicketCount > 0 && (
            <Badge color="red" size="small">
              {recentTicketCount} recent
            </Badge>
          )}
          <Button variant="secondary" size="small" onClick={fetchTickets} disabled={loadingTickets}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(360px,1fr)_minmax(400px,1fr)] gap-4">
        {/* Ticket List */}
        <div className="rounded-lg border bg-ui-bg-base">
          <div className="border-b p-4 space-y-3">
            <Input
              placeholder="Search tickets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
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
            {selectedTicketIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded border bg-ui-bg-subtle p-3">
                <Text size="small" weight="plus">
                  {selectedTicketIds.size} selected
                </Text>
                <Select
                  onValueChange={(status) => bulkUpdateTickets({ status })}
                  disabled={bulkSaving}
                >
                  <Select.Trigger className="w-40">
                    <Select.Value placeholder="Set status" />
                  </Select.Trigger>
                  <Select.Content>
                    {STATUS_OPTIONS.map((status) => (
                      <Select.Item key={status} value={status}>{formatLabel(status)}</Select.Item>
                    ))}
                  </Select.Content>
                </Select>
                <Input
                  className="w-48"
                  value={bulkAssignedTo}
                  onChange={(event) => setBulkAssignedTo(event.target.value)}
                  placeholder="Assign admin ID"
                  disabled={bulkSaving}
                />
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => bulkUpdateTickets({ assigned_to: bulkAssignedTo.trim() || null })}
                  isLoading={bulkSaving}
                >
                  Assign
                </Button>
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => setSelectedTicketIds(new Set())}
                  disabled={bulkSaving}
                >
                  Clear
                </Button>
              </div>
            )}
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
                  <Table.HeaderCell className="w-10">
                    <Checkbox
                      checked={filteredTickets.length > 0 && filteredTickets.every((ticket) => selectedTicketIds.has(ticket.id))}
                      onCheckedChange={(checked) => {
                        setSelectedTicketIds((current) => {
                          const next = new Set(current)
                          for (const ticket of filteredTickets) {
                            if (checked) {
                              next.add(ticket.id)
                            } else {
                              next.delete(ticket.id)
                            }
                          }
                          return next
                        })
                      }}
                    />
                  </Table.HeaderCell>
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
                    <Table.Cell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedTicketIds.has(ticket.id)}
                        onCheckedChange={(checked) => toggleTicketSelection(ticket.id, checked === true)}
                      />
                    </Table.Cell>
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

        {/* Ticket Detail Panel */}
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
                      href={loadingCustomer ? '#' : `/customers/${selectedTicket.customer_id}`}
                      onClick={loadingCustomer ? (e) => e.preventDefault() : undefined}
                      className="mt-1 inline-block text-small text-ui-fg-subtle hover:text-ui-fg-base"
                      title={loadingCustomer ? 'Loading customer...' : `Customer: ${selectedTicket.customer_id}`}
                    >
                      {loadingCustomer ? (
                        <span className="inline-flex items-center gap-1">
                          <Spinner className="animate-spin" />
                          Loading...
                        </span>
                      ) : customerName ? (
                        `${customerName} · ${customerEmail}`
                      ) : (
                        `${selectedTicket.customer_id} (unavailable)`
                      )}
                    </a>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedTicket.order_id ? (
                      <a href={`/orders/${selectedTicket.order_id}`}>
                        <Badge size="small">Order #{selectedTicket.order_id.slice(-8)}</Badge>
                      </a>
                    ) : (
                      <Badge size="small" className="text-ui-fg-subtle">No order</Badge>
                    )}
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setShowMergeModal(true)}
                    >
                      Merge
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                  <div>
                    <Label>Assigned To</Label>
                    <Input
                      value={assignedToInput}
                      onChange={(event) => setAssignedToInput(event.target.value)}
                      onBlur={() => {
                        const value = assignedToInput.trim()
                        if (value !== (selectedTicket.assigned_to ?? '')) {
                          updateTicket({ assigned_to: value || null })
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          const value = assignedToInput.trim()
                          if (value !== (selectedTicket.assigned_to ?? '')) {
                            updateTicket({ assigned_to: value || null })
                          }
                        }
                      }}
                      placeholder="Admin user ID"
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              <div className="border-b p-4">
                <Text size="small" leading="compact" weight="plus">Customer History</Text>
                {loadingCustomerTickets ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Spinner className="animate-spin" />
                    <Text size="small" className="text-ui-fg-subtle">Loading previous tickets...</Text>
                  </div>
                ) : customerTickets.filter((ticket) => ticket.id !== selectedTicket.id).length === 0 ? (
                  <Text size="small" className="mt-2 text-ui-fg-subtle">No previous tickets.</Text>
                ) : (
                  <div className="mt-2 space-y-2">
                    {customerTickets
                      .filter((ticket) => ticket.id !== selectedTicket.id)
                      .map((ticket) => (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className="block w-full rounded border p-2 text-left hover:bg-ui-bg-subtle"
                        >
                          <Text size="small" weight="plus" className="truncate">{ticket.subject}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {formatLabel(ticket.status)} · {formatDate(ticket.created_at)}
                          </Text>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Messages */}
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
                        if (messageAttachments.length === 0) return null
                        return (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {messageAttachments.map((attachment, index) => (
                              <a
                                key={index}
                                href={getAttachmentUrl(attachment)}
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
                ) : loadingDetails ? (
                  <div className="flex justify-center py-8">
                    <Spinner className="animate-spin" />
                  </div>
                ) : (
                  <Text className="text-ui-fg-subtle">No messages yet.</Text>
                )}
              </div>

              {/* Notes */}
              {details && (
                <div className="border-t p-4">
                  <Heading level="h3" className="mb-3">Notes</Heading>
                  {details.notes.length > 0 && (
                    <div className="mb-4 space-y-2 max-h-40 overflow-y-auto">
                      {details.notes.map((note) => (
                        <div key={note.id} className="rounded border bg-ui-bg-subtle p-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <Text size="xsmall" className="text-ui-fg-muted">
                              {formatDate(note.created_at)}
                              {note.author_id && ` · ${note.author_id}`}
                            </Text>
                          </div>
                          <Text size="small" className="whitespace-pre-wrap">{note.content}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add an internal note..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          addNote()
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={addNote}
                      disabled={!noteContent.trim() || addingNote}
                      isLoading={addingNote}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Reply */}
              <div className="border-t p-4">
                <Label htmlFor="support-ticket-reply">Reply</Label>
                <div className="mb-2">
                  <Select
                    onValueChange={(label) => {
                      const cannedResponse = CANNED_RESPONSES.find((item) => item.label === label)
                      if (!cannedResponse) return
                      setReply((current) => current.trim()
                        ? `${current.trim()}\n\n${cannedResponse.value}`
                        : cannedResponse.value)
                    }}
                  >
                    <Select.Trigger>
                      <Select.Value placeholder="Insert canned response" />
                    </Select.Trigger>
                    <Select.Content>
                      {CANNED_RESPONSES.map((response) => (
                        <Select.Item key={response.label} value={response.label}>
                          {response.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
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
                          aria-label={`Remove ${attachment.filename}`}
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

      {/* Merge modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg border bg-ui-bg-base p-6 shadow-lg">
            <Heading level="h2" className="mb-4">Merge Ticket</Heading>
            <Text size="small" className="mb-4 text-ui-fg-subtle">
              This ticket will become the target. Enter the ID of the source ticket to merge into this one.
              Both tickets must belong to the same customer.
            </Text>
            <div className="mb-4 space-y-2">
              <Label>Source Ticket ID</Label>
              <Input
                value={mergeSourceId}
                onChange={(e) => setMergeSourceId(e.target.value)}
                placeholder="ticket_..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowMergeModal(false); setMergeSourceId('') }}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!mergeSourceId.trim()) return
                  await mergeTicket(mergeSourceId.trim())
                  setShowMergeModal(false)
                  setMergeSourceId('')
                }}
                disabled={!mergeSourceId.trim() || saving}
                isLoading={saving}
              >
                Merge
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'Support Tickets',
  icon: ChatBubbleLeftRight,
})
