import { defineRouteConfig } from '@medusajs/admin-sdk'
import {
  ChatBubbleLeftRight,
  Clock,
  PaperClip,
  Sparkles,
  Spinner,
  Trash,
  User,
  XCircleSolid,
  CheckCircleSolid,
  ChevronLeft,
  ChevronRight,
} from '@medusajs/icons'
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Tabs,
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

type AIAnalysis = {
  id: string
  ticket_id: string
  category: string | null
  category_confidence: number | null
  suggested_priority: string | null
  priority_confidence: number | null
  auto_reply_eligible: boolean
  auto_replied: boolean
  suggested_response: string | null
  response_confidence: number | null
}

const STATUS_OPTIONS = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
  'closed',
]

const ACTIVE_STATUS_OPTIONS = STATUS_OPTIONS.filter((status) => status !== 'closed')

const CATEGORY_OPTIONS = [
  'order_issue',
  'return_request',
  'fulfillment_issue',
  'product_inquiry',
  'payment_issue',
  'general',
]

const CANNED_RESPONSES = [
  { label: 'Order status', value: 'Thanks for reaching out. We are checking the latest status of your order and will update you shortly.' },
  { label: 'Return instructions', value: 'We can help with your return. Please confirm the item condition and whether the original packaging is available.' },
  { label: 'Refund processing', value: 'Your refund request is being reviewed. Once approved, refunds usually appear on the original payment method within a few business days.' },
]

const formatLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  return new Date(value).toLocaleString()
}

const isClosedStatus = (status: string) => status === 'closed' || status === 'resolved'
const displayStatus = (status: string) => (status === 'resolved' ? 'closed' : status)

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'open': return 'blue'
    case 'in_progress': return 'orange'
    case 'closed':
    case 'resolved': return 'green'
    case 'waiting_admin': return 'red'
    case 'waiting_customer': return 'grey'
    default: return 'grey'
  }
}

const normalizeAttachments = (attachments: unknown): Attachment[] => {
  if (!attachments) return []
  if (Array.isArray(attachments)) return attachments as Attachment[]
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
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [ticketTab, setTicketTab] = useState<'active' | 'closed'>('active')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [assignedToInput, setAssignedToInput] = useState('')
  const [customerTickets, setCustomerTickets] = useState<Ticket[]>([])
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSourceId, setMergeSourceId] = useState('')
  const [activeTab, setActiveTab] = useState<'conversation' | 'notes' | 'events'>('conversation')
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [showContext, setShowContext] = useState(false)

  const selectedTicket = details?.ticket ?? tickets.find((ticket) => ticket.id === selectedTicketId)

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (ticketTab === 'active' && isClosedStatus(ticket.status)) return false
      if (ticketTab === 'closed' && !isClosedStatus(ticket.status)) return false
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false
      if (categoryFilter !== 'all' && ticket.category !== categoryFilter) return false
      if (!term) return true
      return (
        ticket.subject.toLowerCase().includes(term) ||
        ticket.customer_id.toLowerCase().includes(term) ||
        ticket.id.toLowerCase().includes(term) ||
        Boolean(ticket.order_id?.toLowerCase().includes(term))
      )
    })
  }, [tickets, ticketTab, statusFilter, categoryFilter, search])

  const activeTicketCount = tickets.filter((ticket) => !isClosedStatus(ticket.status)).length
  const closedTicketCount = tickets.length - activeTicketCount

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true)
    try {
      const data = await adminFetch<{ tickets: Ticket[] }>('/admin/tickets?limit=100')
      setTickets(data.tickets ?? [])
      if (!selectedTicketId && data.tickets?.[0]) {
        setSelectedTicketId(data.tickets[0].id)
      }
    } catch (error) {
      toast.error('Failed to load tickets')
    } finally {
      setLoadingTickets(false)
    }
  }, [selectedTicketId])

  const fetchAnalysis = useCallback(async (ticketId: string) => {
    setLoadingAnalysis(true)
    try {
      const data = await adminFetch<{ analysis: AIAnalysis }>(`/admin/tickets/${ticketId}/ai`)
      setAnalysis(data.analysis)
    } catch {
      setAnalysis(null)
    } finally {
      setLoadingAnalysis(false)
    }
  }, [])

  const fetchDetails = useCallback(async (ticketId: string) => {
    setLoadingDetails(true)
    try {
      const data = await adminFetch<TicketDetails>(`/admin/tickets/${ticketId}`)
      setDetails(data)
    } catch {
      toast.error('Failed to load ticket details')
      setDetails(null)
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  const fetchCustomer = useCallback(async (customerId: string) => {
    try {
      const data = await adminFetch<{ customer: { first_name?: string; last_name?: string; email?: string } }>(
        `/admin/customers/${customerId}`
      )
      const customer = data.customer
      if (customer) {
        setCustomerName([customer.first_name, customer.last_name].filter(Boolean).join(' ') || customerId)
        setCustomerEmail(customer.email ?? null)
      }
    } catch {
      setCustomerName(null)
      setCustomerEmail(null)
    }
  }, [])

  const fetchCustomerTickets = useCallback(async (customerId: string) => {
    try {
      const data = await adminFetch<{ tickets: Ticket[] }>(
        `/admin/tickets?customer_id=${encodeURIComponent(customerId)}&limit=10`,
      )
      setCustomerTickets(data.tickets ?? [])
    } catch {
      setCustomerTickets([])
    }
  }, [])

  const updateTicket = useCallback(async (updates: { status?: string; assigned_to?: string | null }) => {
    if (!selectedTicketId) return
    setSaving(true)
    try {
      const updated = await adminFetch<{ ticket: Ticket }>(`/admin/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        body: updates,
      })
      setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, ...updated.ticket } : t))
      setDetails(prev => prev ? { ...prev, ticket: { ...prev.ticket, ...updated.ticket } } : prev)
      toast.success('Ticket updated')
    } catch {
      toast.error('Failed to update ticket')
    } finally {
      setSaving(false)
    }
  }, [selectedTicketId]);

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
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSaving(false)
    }
  }

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
    } catch {
      toast.error('Failed to add note')
    } finally {
      setAddingNote(false)
    }
  }

  const uploadFiles = async (files: FileList) => {
    if (files.length === 0) return
    setUploadingFiles(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) formData.append('files', files[i])
      const result = await adminFetch<{ attachments: Attachment[] }>('/admin/tickets/upload', {
        method: 'POST',
        body: formData,
      } as any)
      setPendingAttachments((prev) => [...prev, ...result.attachments])
    } catch {
      toast.error('File upload failed')
    } finally {
      setUploadingFiles(false)
    }
  }

  const mergeTicket = async (sourceTicketId: string) => {
    if (!selectedTicketId) return
    setSaving(true)
    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}/merge`, {
        method: 'POST',
        body: { source_ticket_id: sourceTicketId },
      })
      toast.success('Ticket merged')
      await Promise.all([fetchDetails(selectedTicketId), fetchTickets()])
    } catch {
      toast.error('Failed to merge ticket')
    } finally {
      setSaving(false)
    }
  }

  const deleteTicket = async () => {
    if (!selectedTicketId || !selectedTicket) return
    const confirmed = window.confirm(`Delete ticket "${selectedTicket.subject}"? This cannot be undone.`)
    if (!confirmed) return

    setSaving(true)
    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}`, { method: 'DELETE' })
      const remainingTickets = tickets.filter((ticket) => ticket.id !== selectedTicketId)

      setTickets(remainingTickets)
      setSelectedTicketId(remainingTickets[0]?.id ?? null)
      setDetails(null)
      setAnalysis(null)
      setCustomerName(null)
      setCustomerEmail(null)
      setCustomerTickets([])
      toast.success('Ticket deleted')
    } catch (error) {
      toast.error('Failed to delete ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchTickets()
    const interval = setInterval(fetchTickets, 15_000)
    return () => clearInterval(interval)
  }, [fetchTickets])

  useEffect(() => {
    if (selectedTicketId) {
      fetchDetails(selectedTicketId)
      fetchAnalysis(selectedTicketId)
      const interval = setInterval(() => fetchDetails(selectedTicketId), 5_000)
      return () => clearInterval(interval)
    }
  }, [selectedTicketId, fetchDetails, fetchAnalysis])

  useEffect(() => {
    if (selectedTicket?.customer_id) {
      fetchCustomer(selectedTicket.customer_id)
      fetchCustomerTickets(selectedTicket.customer_id)
      setAssignedToInput(selectedTicket.assigned_to ?? '')
    }
  }, [selectedTicket?.customer_id, selectedTicket?.assigned_to, fetchCustomer, fetchCustomerTickets])

  useEffect(() => {
    if (!selectedTicketId || !filteredTickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(filteredTickets[0]?.id ?? null)
    }
  }, [filteredTickets, selectedTicketId])

  return (
    <Container className="p-0 bg-ui-bg-subtle/20">
      <div className="flex flex-col lg:flex-row h-dvh lg:h-[calc(100vh-57px)] overflow-hidden">
        {/* Left: Sidebar */}
        <div className={`${mobileView === 'detail' ? 'hidden' : 'flex'} lg:flex w-full lg:w-[380px] flex-shrink-0 border-r bg-ui-bg-base flex-col shadow-sm z-10`}>
          <div className="p-4 lg:p-6 border-b space-y-4 bg-ui-bg-base/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <Heading level="h1" className="text-xl font-bold flex items-center gap-2">
                <ChatBubbleLeftRight className="text-ui-fg-interactive" />
                Tickets
              </Heading>
              <Button variant="secondary" size="small" onClick={fetchTickets} disabled={loadingTickets}>
                <Clock className={`h-4 w-4 ${loadingTickets ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <Input
              size="small"
              placeholder="Search subject, order, or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Tabs
              value={ticketTab}
              onValueChange={(value) => {
                setTicketTab(value as 'active' | 'closed')
                setStatusFilter('all')
              }}
            >
              <Tabs.List className="w-full">
                <Tabs.Trigger value="active" className="flex-1">
                  Active ({activeTicketCount})
                </Tabs.Trigger>
                <Tabs.Trigger value="closed" className="flex-1">
                  Closed ({closedTicketCount})
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter} disabled={ticketTab === 'closed'}>
                <Select.Trigger className="h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All Active Statuses</Select.Item>
                  {ACTIVE_STATUS_OPTIONS.map((s) => (
                    <Select.Item key={s} value={s}>{formatLabel(s)}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <Select.Trigger className="h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All Categories</Select.Item>
                  {CATEGORY_OPTIONS.map((c) => (
                    <Select.Item key={c} value={c}>{formatLabel(c)}</Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            {loadingTickets && tickets.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="animate-spin text-ui-fg-interactive" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center text-ui-fg-subtle opacity-50">
                <ChatBubbleLeftRight className="mb-4 h-12 w-12" />
                <Text size="small">No matching tickets.</Text>
              </div>
            ) : (
              <div className="divide-y divide-ui-border-base">
                {filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => { setSelectedTicketId(ticket.id); setMobileView('detail') }}
                    className={`p-4 lg:p-5 cursor-pointer transition-all duration-200 hover:bg-ui-bg-subtle group border-l-4 ${
                      ticket.id === selectedTicketId 
                        ? 'bg-ui-bg-subtle-pressed border-l-ui-fg-interactive shadow-inner' 
                        : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <Text size="small" weight="plus" className="line-clamp-1 flex-1 group-hover:text-ui-fg-base transition-colors">
                        {ticket.subject}
                      </Text>
                      <Badge size="2xsmall" color={statusColor(ticket.status)}>
                        {formatLabel(displayStatus(ticket.status))}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-ui-fg-subtle">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <Text size="xsmall" className="truncate">
                          {ticket.customer_id.split('_').pop()}
                        </Text>
                      </div>
                      <Text size="xsmall">{formatTime(ticket.updated_at)}</Text>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Workspace */}
        <div className={`${mobileView === 'list' ? 'hidden' : 'flex'} lg:flex flex-1 flex-col bg-ui-bg-subtle/5 relative min-w-0 min-h-0`}>
          {!selectedTicket ? (
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 rounded-3xl bg-ui-bg-base shadow-xl flex items-center justify-center mb-8 border border-ui-border-base rotate-3">
                <ChatBubbleLeftRight className="h-12 w-12 text-ui-fg-interactive" />
              </div>
              <Heading level="h2" className="text-2xl mb-2">Support Workspace</Heading>
              <Text className="text-ui-fg-subtle">Select a conversation to start helping customers.</Text>
            </div>
          ) : (
            <>
              {/* Workspace Header */}
              <div className="flex items-center gap-3 border-b px-4 lg:px-8 py-4 lg:py-6 bg-ui-bg-base/80 backdrop-blur-md sticky top-0 z-20">
                <button 
                  onClick={() => setMobileView('list')} 
                  className="lg:hidden flex-shrink-0 p-1 -ml-1 rounded-lg hover:bg-ui-bg-subtle transition-colors"
                  aria-label="Back to tickets"
                >
                  <ChevronLeft className="h-5 w-5 text-ui-fg-subtle" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <Badge size="2xsmall" className="font-mono">#{selectedTicket.id.split('_').pop()}</Badge>
                    <div className="flex items-center gap-1.5 text-ui-fg-subtle">
                      <Clock className="h-3.5 w-3.5" />
                      <Text size="xsmall">{new Date(selectedTicket.created_at).toLocaleString()}</Text>
                    </div>
                  </div>
                  <Heading level="h1" className="text-xl lg:text-2xl font-bold tracking-tight line-clamp-1">{selectedTicket.subject}</Heading>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedTicket.order_id && (
                    <a href={`/orders/${selectedTicket.order_id}`} target="_blank" rel="noreferrer">
                      <Badge color="orange" className="h-8 lg:h-9 px-3 lg:px-4 cursor-pointer hover:bg-orange-100 transition-colors gap-1.5 hidden sm:inline-flex">
                        Order #{selectedTicket.order_id.slice(-8)}
                      </Badge>
                    </a>
                  )}
                  <Button variant="secondary" size="small" className="h-8 lg:h-9 px-3 lg:px-4" onClick={() => setShowMergeModal(true)}>Merge</Button>
                  <Button variant="danger" size="small" className="h-8 lg:h-9 px-2 lg:px-3" onClick={deleteTicket} disabled={saving}><Trash /></Button>
                </div>
              </div>

              {/* Tabs & Content */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="px-4 lg:px-8 pt-4 lg:pt-6">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
                    <Tabs.List className="w-fit">
                      <Tabs.Trigger value="conversation">Conversation</Tabs.Trigger>
                      <Tabs.Trigger value="notes">Notes ({details?.notes.length || 0})</Tabs.Trigger>
                      <Tabs.Trigger value="events">Activity Log</Tabs.Trigger>
                    </Tabs.List>
                  </Tabs>
                </div>

                <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar min-h-0">
                  {activeTab === 'conversation' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                      {loadingDetails && !details ? (
                        <div className="flex h-64 items-center justify-center"><Spinner className="animate-spin" /></div>
                      ) : details?.messages.length ? (
                        details.messages.map((msg) => (
                          <div key={msg.id} className={`flex flex-col ${msg.sender_type === 'customer' ? 'items-start' : 'items-end'}`}>
                            <div className={`max-w-[75%] rounded-2xl p-5 text-sm shadow-sm transition-all hover:shadow-md ${
                              msg.sender_type === 'customer' 
                                ? 'bg-ui-bg-base border rounded-tl-none text-ui-fg-base' 
                                : 'bg-ui-bg-interactive text-ui-fg-on-color rounded-tr-none'
                            }`}>
                              <Text size="small" className="whitespace-pre-wrap leading-relaxed">{msg.message}</Text>
                              {(() => {
                                const attachments = normalizeAttachments(msg.attachments)
                                if (attachments.length === 0) return null
                                return (
                                  <div className="mt-4 pt-3 border-t border-current/10 flex flex-wrap gap-2">
                                    {attachments.map((a, i) => (
                                      <a key={i} href={getAttachmentUrl(a)} target="_blank" rel="noreferrer" 
                                         className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                           msg.sender_type === 'customer' ? 'bg-ui-bg-subtle hover:bg-ui-bg-subtle-pressed' : 'bg-white/10 hover:bg-white/20'
                                         }`}>
                                        <PaperClip className="h-3 w-3" /> {a.filename}
                                      </a>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                            <Text size="xsmall" className="text-ui-fg-subtle mt-2 px-1">
                              {formatLabel(msg.sender_type)} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-20 opacity-30"><Text>No messages yet.</Text></div>
                      )}
                    </div>
                  )}

                  {activeTab === 'notes' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                      <div className="rounded-2xl border bg-ui-bg-base p-6 shadow-sm">
                        <Heading level="h3" className="mb-4 flex items-center gap-2"><PaperClip className="h-4 w-4" />Internal Notes</Heading>
                        <div className="space-y-4 mb-6">
                          {details?.notes.map(note => (
                            <div key={note.id} className="p-4 rounded-xl bg-ui-bg-subtle/50 border border-ui-border-base relative group">
                              <div className="flex items-center justify-between mb-2">
                                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">{note.author_id || 'System'} • {formatDate(note.created_at)}</Text>
                              </div>
                              <Text size="small" className="italic text-ui-fg-subtle leading-relaxed">"{note.content}"</Text>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-3">
                          <Textarea 
                            placeholder="Add an internal note only admins can see..." 
                            value={noteContent} 
                            onChange={e => setNoteContent(e.target.value)} 
                            className="bg-ui-bg-subtle border-none shadow-inner"
                          />
                          <Button variant="secondary" className="w-fit self-end" onClick={addNote} isLoading={addingNote} disabled={!noteContent.trim()}>Add Note</Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'events' && (
                    <div className="max-w-2xl mx-auto">
                      <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-ui-border-base">
                        {details?.events.map(event => (
                          <div key={event.id} className="relative">
                            <div className="absolute -left-8 top-1 h-2.5 w-2.5 rounded-full bg-ui-bg-base border-2 border-ui-fg-interactive z-10" />
                            <div className="bg-ui-bg-base border rounded-xl p-4 shadow-sm">
                              <Text size="small" weight="plus">{formatLabel(event.event_type)}</Text>
                              <Text size="xsmall" className="text-ui-fg-subtle mt-1">{formatDate(event.created_at)}</Text>
                              {event.data && <pre className="mt-2 text-[10px] bg-ui-bg-subtle p-2 rounded overflow-auto max-h-32">{JSON.stringify(event.data, null, 2)}</pre>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reply Footer */}
                <div className="px-4 lg:px-8 pb-4 lg:pb-8">
                  <div className="rounded-3xl border bg-ui-bg-base shadow-xl overflow-hidden flex flex-col">
                    {analysis && (
                      <div className="px-6 py-4 bg-ui-bg-subtle/30 border-b flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-3">
                          <Sparkles className="text-ui-fg-interactive h-5 w-5" />
                          <div>
                            <Text size="small" weight="plus">AI Smart Suggestion</Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">Confidence: {Math.round((analysis.response_confidence || 0) * 100)}%</Text>
                          </div>
                        </div>
                        <Button 
                          variant="secondary" 
                          size="small" 
                          className="h-8 gap-1.5"
                          onClick={() => setReply(analysis.suggested_response || '')}
                        >
                          Use Suggestion <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    <div className="p-6 space-y-4">
                      <div className="flex flex-col lg:flex-row gap-4">
                        <div className="flex-1">
                          <Textarea
                            placeholder="Type your reply to the customer..."
                            rows={4}
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            className="bg-ui-bg-subtle/50 border-ui-border-base focus:border-ui-fg-interactive resize-none text-base leading-relaxed"
                          />
                        </div>
                        <div className="w-full lg:w-[240px] space-y-3">
                          <Label className="text-ui-fg-subtle text-[10px] uppercase tracking-widest font-bold">Quick Actions</Label>
                          <Select onValueChange={(v) => setReply(prev => prev ? `${prev}\n\n${v}` : v)}>
                            <Select.Trigger className="h-9">
                              <Select.Value placeholder="Canned Responses" />
                            </Select.Trigger>
                            <Select.Content>
                              {CANNED_RESPONSES.map(r => <Select.Item key={r.label} value={r.value}>{r.label}</Select.Item>)}
                            </Select.Content>
                          </Select>
                          <Button variant="secondary" className="w-full h-9 gap-2" onClick={() => fileInputRef.current?.click()} isLoading={uploadingFiles}>
                            <PaperClip className="h-4 w-4" /> Attach Files
                          </Button>
                          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && uploadFiles(e.target.files)} />
                        </div>
                      </div>

                      {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {pendingAttachments.map((a, i) => (
                            <Badge key={i} size="small" className="pr-1 gap-1.5">
                              {a.filename}
                              <button onClick={() => setPendingAttachments(p => p.filter((_, idx) => idx !== i))} className="hover:text-ui-fg-base text-ui-fg-subtle">×</button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-ui-border-base">
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col">
                            <Text size="xsmall" className="text-ui-fg-subtle uppercase tracking-tighter">Status after reply</Text>
                            <Select value={selectedTicket.status} onValueChange={s => updateTicket({ status: s })}>
                              <Select.Trigger className="border-none p-0 h-6 w-fit bg-transparent shadow-none hover:text-ui-fg-base text-ui-fg-interactive transition-colors">
                                <Select.Value />
                              </Select.Trigger>
                              <Select.Content>{STATUS_OPTIONS.map(s => <Select.Item key={s} value={s}>{formatLabel(s)}</Select.Item>)}</Select.Content>
                            </Select>
                          </div>
                        </div>
                        <Button 
                          className="h-11 px-8 rounded-2xl shadow-lg shadow-ui-fg-interactive/20 transition-all hover:translate-y-[-1px] active:translate-y-[0px]"
                          onClick={sendReply}
                          disabled={(!reply.trim() && pendingAttachments.length === 0) || saving}
                          isLoading={saving}
                        >
                          Send Response
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: Context Sidebar */}
        {selectedTicket && (
          <>
            {/* Mobile: context FAB */}
            <button
              onClick={() => setShowContext(!showContext)} 
              className="lg:hidden fixed bottom-6 right-6 z-30 h-12 w-12 rounded-full bg-ui-bg-interactive text-ui-fg-on-color shadow-xl flex items-center justify-center hover:opacity-90 transition-all active:scale-95"
              aria-label="Toggle context panel"
            >
              <Sparkles className="h-5 w-5" />
            </button>

            {/* Desktop context sidebar */}
            <div className="hidden lg:flex w-[320px] border-l bg-ui-bg-base flex-col p-8 space-y-8 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-4 duration-500">
              <div>
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold mb-4">Intelligence</Text>
                {loadingAnalysis ? (
                  <div className="flex items-center gap-2"><Spinner className="animate-spin h-3 w-3" /><Text size="xsmall">Analyzing...</Text></div>
                ) : analysis ? (
                  <div className="space-y-6">
                    <div className="p-4 rounded-2xl border bg-ui-bg-subtle/30 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <Text size="xsmall" className="text-ui-fg-subtle">Category</Text>
                          <Badge size="small" color="blue">{formatLabel(analysis.category || 'Unknown')}</Badge>
                        </div>
                        <div className="w-full bg-ui-bg-subtle h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-ui-fg-interactive transition-all duration-1000" style={{ width: `${(analysis.category_confidence || 0) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Text size="xsmall" className="text-ui-fg-subtle">Priority</Text>
                        <Badge size="small" color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}>{formatLabel(analysis.suggested_priority || 'Normal')}</Badge>
                      </div>
                    </div>
                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${analysis.auto_reply_eligible ? 'bg-green-50/30 border-green-100' : 'bg-ui-bg-subtle/10 border-ui-border-base'}`}>
                      <Text size="xsmall" className="text-ui-fg-subtle">Automation</Text>
                      {analysis.auto_reply_eligible ? (
                        <div className="flex items-center gap-1.5 text-ui-fg-success"><CheckCircleSolid className="h-4 w-4" /><Text size="xsmall" weight="plus">Eligible</Text></div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-ui-fg-muted"><XCircleSolid className="h-4 w-4" /><Text size="xsmall">Manual Only</Text></div>
                      )}
                    </div>
                  </div>
                ) : <Text size="xsmall" className="text-ui-fg-subtle italic">No AI insights available for this ticket.</Text>}
              </div>

              <div className="border-t pt-8">
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold mb-4">Customer Info</Text>
                <div className="space-y-4">
                  <div className="flex flex-col">
                    <Text size="small" weight="plus" className="truncate">{customerName || 'Loading...'}</Text>
                    <Text size="xsmall" className="text-ui-fg-subtle truncate">{customerEmail || '...'}</Text>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <Text size="xsmall" className="text-ui-fg-subtle mb-1">Assigned To</Text>
                      <Input 
                        className="h-8 text-xs bg-ui-bg-subtle border-none" 
                        value={assignedToInput} 
                        onChange={e => setAssignedToInput(e.target.value)} 
                        onBlur={() => assignedToInput !== (selectedTicket.assigned_to ?? '') && updateTicket({ assigned_to: assignedToInput.trim() || null })}
                        placeholder="Admin ID"
                      />
                    </div>
                    <div>
                      <Text size="xsmall" className="text-ui-fg-subtle mb-1">Status</Text>
                      <Badge size="small" color={statusColor(selectedTicket.status)}>{formatLabel(selectedTicket.status)}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-8">
                <div className="flex items-center justify-between mb-4">
                  <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold">History</Text>
                  <Badge size="2xsmall">{customerTickets.length} tickets</Badge>
                </div>
                <div className="space-y-3">
                  {customerTickets.filter(t => t.id !== selectedTicket.id).slice(0, 5).map(t => (
                    <button key={t.id} onClick={() => { setSelectedTicketId(t.id); setMobileView('detail') }} className="w-full text-left p-3 rounded-xl border bg-ui-bg-subtle/20 hover:bg-ui-bg-subtle transition-all group">
                      <Text size="xsmall" weight="plus" className="line-clamp-1 group-hover:text-ui-fg-base">{t.subject}</Text>
                      <div className="flex items-center gap-2 mt-1 opacity-60">
                        <Badge size="2xsmall" color={statusColor(t.status)}>{t.status}</Badge>
                        <Text size="xsmall">{new Date(t.created_at).toLocaleDateString()}</Text>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile context overlay */}
            {showContext && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowContext(false)} />
                <div className="absolute right-0 top-0 bottom-0 w-[320px] max-w-[85vw] bg-ui-bg-base shadow-2xl flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-ui-bg-base z-10">
                    <Text size="small" weight="plus">Context Panel</Text>
                    <button onClick={() => setShowContext(false)} className="p-1.5 rounded-lg hover:bg-ui-bg-subtle transition-colors">
                      <XCircleSolid className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div>
                      <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold mb-4">Intelligence</Text>
                      {loadingAnalysis ? (
                        <div className="flex items-center gap-2"><Spinner className="animate-spin h-3 w-3" /><Text size="xsmall">Analyzing...</Text></div>
                      ) : analysis ? (
                        <div className="space-y-6">
                          <div className="p-4 rounded-2xl border bg-ui-bg-subtle/30 space-y-4">
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <Text size="xsmall" className="text-ui-fg-subtle">Category</Text>
                                <Badge size="small" color="blue">{formatLabel(analysis.category || 'Unknown')}</Badge>
                              </div>
                              <div className="w-full bg-ui-bg-subtle h-1 rounded-full overflow-hidden">
                                <div className="h-full bg-ui-fg-interactive transition-all duration-1000" style={{ width: `${(analysis.category_confidence || 0) * 100}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <Text size="xsmall" className="text-ui-fg-subtle">Priority</Text>
                              <Badge size="small" color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}>{formatLabel(analysis.suggested_priority || 'Normal')}</Badge>
                            </div>
                          </div>
                          <div className={`p-4 rounded-2xl border flex items-center justify-between ${analysis.auto_reply_eligible ? 'bg-green-50/30 border-green-100' : 'bg-ui-bg-subtle/10 border-ui-border-base'}`}>
                            <Text size="xsmall" className="text-ui-fg-subtle">Automation</Text>
                            {analysis.auto_reply_eligible ? (
                              <div className="flex items-center gap-1.5 text-ui-fg-success"><CheckCircleSolid className="h-4 w-4" /><Text size="xsmall" weight="plus">Eligible</Text></div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-ui-fg-muted"><XCircleSolid className="h-4 w-4" /><Text size="xsmall">Manual Only</Text></div>
                            )}
                          </div>
                        </div>
                      ) : <Text size="xsmall" className="text-ui-fg-subtle italic">No AI insights available for this ticket.</Text>}
                    </div>

                    <div className="border-t pt-8">
                      <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold mb-4">Customer Info</Text>
                      <div className="space-y-4">
                        <div className="flex flex-col">
                          <Text size="small" weight="plus" className="truncate">{customerName || 'Loading...'}</Text>
                          <Text size="xsmall" className="text-ui-fg-subtle truncate">{customerEmail || '...'}</Text>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <Text size="xsmall" className="text-ui-fg-subtle mb-1">Assigned To</Text>
                            <Input 
                              className="h-8 text-xs bg-ui-bg-subtle border-none" 
                              value={assignedToInput} 
                              onChange={e => setAssignedToInput(e.target.value)} 
                              onBlur={() => assignedToInput !== (selectedTicket.assigned_to ?? '') && updateTicket({ assigned_to: assignedToInput.trim() || null })}
                              placeholder="Admin ID"
                            />
                          </div>
                          <div>
                            <Text size="xsmall" className="text-ui-fg-subtle mb-1">Status</Text>
                            <Badge size="small" color={statusColor(selectedTicket.status)}>{formatLabel(selectedTicket.status)}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-8">
                      <div className="flex items-center justify-between mb-4">
                        <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold">History</Text>
                        <Badge size="2xsmall">{customerTickets.length} tickets</Badge>
                      </div>
                      <div className="space-y-3">
                        {customerTickets.filter(t => t.id !== selectedTicket.id).slice(0, 5).map(t => (
                          <button key={t.id} onClick={() => { setSelectedTicketId(t.id); setMobileView('detail'); setShowContext(false) }} className="w-full text-left p-3 rounded-xl border bg-ui-bg-subtle/20 hover:bg-ui-bg-subtle transition-all group">
                            <Text size="xsmall" weight="plus" className="line-clamp-1 group-hover:text-ui-fg-base">{t.subject}</Text>
                            <div className="flex items-center gap-2 mt-1 opacity-60">
                              <Badge size="2xsmall" color={statusColor(t.status)}>{t.status}</Badge>
                              <Text size="xsmall">{new Date(t.created_at).toLocaleDateString()}</Text>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-ui-bg-base rounded-3xl shadow-2xl border p-8 space-y-6">
            <div>
              <Heading level="h2">Merge Records</Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">Combine thread history into this ticket.</Text>
            </div>
            <div className="space-y-2">
              <Label>Source Ticket ID</Label>
              <Input placeholder="ticket_..." value={mergeSourceId} onChange={e => setMergeSourceId(e.target.value)} className="bg-ui-bg-subtle" />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" onClick={() => { setShowMergeModal(false); setMergeSourceId('') }}>Cancel</Button>
              <Button className="rounded-xl px-6" onClick={() => mergeSourceId.trim() && mergeTicket(mergeSourceId.trim())} isLoading={saving}>Confirm Merge</Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  )
}

function formatTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (diff < 1) return 'Just now'
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return date.toLocaleDateString()
}

export const config = defineRouteConfig({
  label: 'Support Tickets',
  icon: ChatBubbleLeftRight,
})
