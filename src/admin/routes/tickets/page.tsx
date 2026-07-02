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
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminFetch } from '../../lib/api'
import type { AIAnalysis } from './lib/ai'
import { formatLabel } from './lib/format'
import { AiAssistantTab } from './components/AiAssistantTab'
import { AiSettingsDrawer } from './components/AiSettingsDrawer'
import { ContextPanel } from './components/ContextPanel'
import { IntelligencePanel } from './components/IntelligencePanel'
import {
  STATUS_OPTIONS,
  ACTIVE_STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  CANNED_RESPONSES,
  TICKETS_POLL_MS,
  DETAILS_POLL_MS,
  formatDate,
  isClosedStatus,
  displayStatus,
  statusColor,
  normalizeAttachments,
  getAttachmentUrl,
} from './lib/ticket-page'
import type { Ticket, TicketDetails, Attachment } from './lib/ticket-page'

export type { Ticket }

const TICKETS_PAGE_SIZE = 25

const getLastTicketPageOffset = (count: number) =>
  count <= 0 ? 0 : Math.floor((count - 1) / TICKETS_PAGE_SIZE) * TICKETS_PAGE_SIZE

type TicketListResponse = {
  tickets?: Ticket[]
  count?: number
  limit?: number
  offset?: number
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketCount, setTicketCount] = useState(0)
  const [ticketOffset, setTicketOffset] = useState(0)
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
  const [activeTab, setActiveTab] = useState<'conversation' | 'notes' | 'events' | 'ai'>(
    'conversation',
  )
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [showContext, setShowContext] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)

  const handleTabChange = (value: string) => {
    if (value === 'conversation' || value === 'notes' || value === 'events' || value === 'ai') {
      setActiveTab(value)
    }
  }

  const selectedTicket = selectedTicketId
    ? details?.ticket.id === selectedTicketId
      ? details.ticket
      : tickets.find((ticket) => ticket.id === selectedTicketId)
    : null

  const currentPage = Math.floor(ticketOffset / TICKETS_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(ticketCount / TICKETS_PAGE_SIZE))
  const canGoPrevious = ticketOffset > 0
  const canGoNext = ticketOffset + tickets.length < ticketCount

  const fetchTickets = useCallback(
    async (requestedOffset = ticketOffset) => {
      setLoadingTickets(true)
      try {
        const params = new URLSearchParams({
          limit: String(TICKETS_PAGE_SIZE),
          offset: String(requestedOffset),
          tab: ticketTab,
        })
        const term = search.trim()

        if (statusFilter !== 'all') params.set('status', statusFilter)
        if (categoryFilter !== 'all') params.set('category', categoryFilter)
        if (term) params.set('q', term)

        const data = await adminFetch<TicketListResponse>(`/admin/tickets?${params.toString()}`)
        const nextTickets = data.tickets ?? []
        const nextCount = data.count ?? nextTickets.length
        const lastPageOffset = getLastTicketPageOffset(nextCount)

        if (requestedOffset > lastPageOffset) {
          setTicketCount(nextCount)
          setTicketOffset(lastPageOffset)
          return
        }

        const nextSelectedTicketId =
          selectedTicketId && nextTickets.some((ticket) => ticket.id === selectedTicketId)
            ? selectedTicketId
            : (nextTickets[0]?.id ?? null)

        setTickets(nextTickets)
        setTicketCount(nextCount)

        if (nextSelectedTicketId !== selectedTicketId) {
          setSelectedTicketId(nextSelectedTicketId)
          setDetails(null)
          setAnalysis(null)
        }
      } catch (error) {
        console.error('[tickets] fetchTickets failed', error)
        toast.error('Failed to load tickets')
      } finally {
        setLoadingTickets(false)
      }
    },
    [categoryFilter, search, selectedTicketId, statusFilter, ticketOffset, ticketTab],
  )

  const fetchAnalysis = useCallback(async (ticketId: string) => {
    setLoadingAnalysis(true)
    try {
      const data = await adminFetch<{ analysis: AIAnalysis }>(`/admin/tickets/${ticketId}/ai`)
      setAnalysis(data.analysis)
    } catch (error) {
      console.error(`[tickets] fetchAnalysis failed for ${ticketId}`, error)
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
    } catch (error) {
      console.error(`[tickets] fetchDetails failed for ${ticketId}`, error)
      toast.error('Failed to load ticket details')
      setDetails(null)
    } finally {
      setLoadingDetails(false)
    }
  }, [])

  const fetchCustomer = useCallback(async (customerId: string) => {
    try {
      const data = await adminFetch<{
        customer: { first_name?: string; last_name?: string; email?: string }
      }>(`/admin/customers/${customerId}`)
      const customer = data.customer
      if (customer) {
        setCustomerName(
          [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customerId,
        )
        setCustomerEmail(customer.email ?? null)
      }
    } catch (error) {
      console.error(`[tickets] fetchCustomer failed for ${customerId}`, error)
      setCustomerName(null)
      setCustomerEmail(null)
    }
  }, [])

  const fetchCustomerTickets = useCallback(async (customerId: string) => {
    try {
      const params = new URLSearchParams({
        customer_id: customerId,
        limit: '10',
        offset: '0',
      })
      const data = await adminFetch<TicketListResponse>(`/admin/tickets?${params.toString()}`)
      setCustomerTickets(data.tickets ?? [])
    } catch (error) {
      console.error(`[tickets] fetchCustomerTickets failed for ${customerId}`, error)
      setCustomerTickets([])
    }
  }, [])

  const updateTicket = useCallback(
    async (updates: { status?: string; assigned_to?: string | null }) => {
      if (!selectedTicketId) return
      setSaving(true)
      try {
        const updated = await adminFetch<{ ticket: Ticket }>(`/admin/tickets/${selectedTicketId}`, {
          method: 'POST',
          body: updates,
        })
        setDetails((prev) =>
          prev ? { ...prev, ticket: { ...prev.ticket, ...updated.ticket } } : prev,
        )
        await fetchTickets()
        toast.success('Ticket updated')
      } catch (error) {
        console.error(`[tickets] updateTicket failed for ${selectedTicketId}`, error)
        toast.error('Failed to update ticket')
      } finally {
        setSaving(false)
      }
    },
    [fetchTickets, selectedTicketId],
  )

  const sendReply = async () => {
    if (!selectedTicketId) return
    if (!reply.trim() && pendingAttachments.length === 0) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { message: reply.trim() || '(attachment)' }
      if (pendingAttachments.length > 0) {
        body.attachments = pendingAttachments.map((a) => ({
          id: a.id,
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
      console.error(`[tickets] sendReply failed for ${selectedTicketId}`, error)
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
    } catch (error) {
      console.error(`[tickets] addNote failed for ${selectedTicketId}`, error)
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
      })
      setPendingAttachments((prev) => [...prev, ...result.attachments])
    } catch (error) {
      console.error('[tickets] uploadFiles failed', error)
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
    } catch (error) {
      console.error(`[tickets] mergeTicket failed for ${selectedTicketId}`, error)
      toast.error('Failed to merge ticket')
    } finally {
      setSaving(false)
    }
  }

  const deleteTicket = async () => {
    if (!selectedTicketId || !selectedTicket) return
    const confirmed = window.confirm(
      `Delete ticket "${selectedTicket.subject}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setSaving(true)
    try {
      await adminFetch(`/admin/tickets/${selectedTicketId}`, { method: 'DELETE' })
      const nextCount = Math.max(0, ticketCount - 1)
      const nextOffset = Math.min(ticketOffset, getLastTicketPageOffset(nextCount))

      if (nextOffset !== ticketOffset) {
        setTicketOffset(nextOffset)
      }
      setDetails(null)
      setAnalysis(null)
      setCustomerName(null)
      setCustomerEmail(null)
      setCustomerTickets([])
      await fetchTickets(nextOffset)
      toast.success('Ticket deleted')
    } catch (error) {
      console.error(`[tickets] deleteTicket failed for ${selectedTicketId}`, error)
      toast.error('Failed to delete ticket', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      await fetchTickets()
      if (cancelled) return
      timeoutId = setTimeout(poll, TICKETS_POLL_MS)
    }

    void poll()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [fetchTickets])

  useEffect(() => {
    if (!selectedTicketId) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      await Promise.all([fetchDetails(selectedTicketId), fetchAnalysis(selectedTicketId)])
      if (cancelled) return
      timeoutId = setTimeout(poll, DETAILS_POLL_MS)
    }

    void poll()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [selectedTicketId, fetchDetails, fetchAnalysis])

  useEffect(() => {
    const customerId = selectedTicket?.customer_id
    if (!customerId) return
    let cancelled = false
    void (async () => {
      await Promise.all([fetchCustomer(customerId), fetchCustomerTickets(customerId)])
      if (cancelled) return
      setAssignedToInput(selectedTicket?.assigned_to ?? '')
    })()
    return () => {
      cancelled = true
    }
  }, [
    selectedTicket?.customer_id,
    selectedTicket?.assigned_to,
    fetchCustomer,
    fetchCustomerTickets,
  ])

  useEffect(() => {
    if (!selectedTicketId || !tickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(tickets[0]?.id ?? null)
    }
  }, [selectedTicketId, tickets])

  return (
    <Container className="bg-ui-bg-subtle/20 p-0">
      <div className="flex h-dvh flex-col overflow-hidden lg:h-[calc(100vh-57px)] lg:flex-row">
        {/* Left: Sidebar */}
        <div
          className={`${mobileView === 'detail' ? 'hidden' : 'flex'} bg-ui-bg-base z-10 w-full flex-shrink-0 flex-col border-r shadow-sm lg:flex lg:w-[380px]`}
        >
          <div className="bg-ui-bg-base/50 space-y-4 border-b p-4 backdrop-blur-sm lg:p-6">
            <div className="flex items-center justify-between">
              <Heading level="h1" className="flex items-center gap-2 text-xl font-bold">
                <ChatBubbleLeftRight className="text-ui-fg-interactive" />
                Tickets
              </Heading>
              <Button
                variant="secondary"
                size="small"
                onClick={() => fetchTickets()}
                disabled={loadingTickets}
              >
                <Clock className={`h-4 w-4 ${loadingTickets ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <Input
              size="small"
              placeholder="Search subject, order, or customer..."
              value={search}
              onChange={(e) => {
                setTicketOffset(0)
                setSearch(e.target.value)
              }}
            />
            <Tabs
              value={ticketTab}
              onValueChange={(value) => {
                setTicketOffset(0)
                setTicketTab(value as 'active' | 'closed')
                setStatusFilter('all')
              }}
            >
              <Tabs.List className="w-full">
                <Tabs.Trigger value="active" className="flex-1">
                  Active
                </Tabs.Trigger>
                <Tabs.Trigger value="closed" className="flex-1">
                  Closed
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
            <div className="flex gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setTicketOffset(0)
                  setStatusFilter(value)
                }}
                disabled={ticketTab === 'closed'}
              >
                <Select.Trigger className="h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All Active Statuses</Select.Item>
                  {ACTIVE_STATUS_OPTIONS.map((s) => (
                    <Select.Item key={s} value={s}>
                      {formatLabel(s)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setTicketOffset(0)
                  setCategoryFilter(value)
                }}
              >
                <Select.Trigger className="h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All Categories</Select.Item>
                  {CATEGORY_OPTIONS.map((c) => (
                    <Select.Item key={c} value={c}>
                      {formatLabel(c)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            </div>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {loadingTickets && tickets.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="text-ui-fg-interactive animate-spin" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-ui-fg-subtle flex h-full flex-col items-center justify-center p-12 text-center opacity-50">
                <ChatBubbleLeftRight className="mb-4 h-12 w-12" />
                <Text size="small">No matching tickets.</Text>
              </div>
            ) : (
              <div className="divide-ui-border-base divide-y">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ticket ${ticket.subject}`}
                    aria-pressed={ticket.id === selectedTicketId}
                    onClick={() => {
                      setSelectedTicketId(ticket.id)
                      setMobileView('detail')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedTicketId(ticket.id)
                        setMobileView('detail')
                      }
                    }}
                    className={`hover:bg-ui-bg-subtle group focus:ring-ui-fg-interactive cursor-pointer border-l-4 p-4 transition-all duration-200 focus:ring-2 focus:outline-none focus:ring-inset lg:p-5 ${
                      ticket.id === selectedTicketId
                        ? 'bg-ui-bg-subtle-pressed border-l-ui-fg-interactive shadow-inner'
                        : 'border-l-transparent'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <Text
                        size="small"
                        weight="plus"
                        className="group-hover:text-ui-fg-base line-clamp-1 flex-1 transition-colors"
                      >
                        {ticket.subject}
                      </Text>
                      <Badge size="2xsmall" color={statusColor(ticket.status)}>
                        {formatLabel(displayStatus(ticket.status))}
                      </Badge>
                    </div>
                    <div className="text-ui-fg-subtle flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-1.5">
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

          <div className="bg-ui-bg-base border-t px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {ticketCount === 0 ? '0 tickets' : `Page ${currentPage} of ${totalPages}`}
              </Text>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!canGoPrevious || loadingTickets}
                  onClick={() =>
                    setTicketOffset((offset) => Math.max(0, offset - TICKETS_PAGE_SIZE))
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={!canGoNext || loadingTickets}
                  onClick={() => setTicketOffset((offset) => offset + TICKETS_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Workspace */}
        <div
          className={`${mobileView === 'list' ? 'hidden' : 'flex'} bg-ui-bg-subtle/5 relative min-h-0 min-w-0 flex-1 flex-col lg:flex`}
        >
          {!selectedTicket ? (
            <div className="animate-in fade-in zoom-in mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center duration-500">
              <div className="bg-ui-bg-base border-ui-border-base mb-8 flex h-24 w-24 rotate-3 items-center justify-center rounded-3xl border shadow-xl">
                <ChatBubbleLeftRight className="text-ui-fg-interactive h-12 w-12" />
              </div>
              <Heading level="h2" className="mb-2 text-2xl">
                Support Workspace
              </Heading>
              <Text className="text-ui-fg-subtle">
                Select a conversation to start helping customers.
              </Text>
              <button
                type="button"
                onClick={() => setShowAiSettings(true)}
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover focus:ring-ui-fg-interactive mt-6 inline-flex items-center gap-2 rounded px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
              >
                <Sparkles className="h-3.5 w-3.5" /> Configure AI Assistant
              </button>
            </div>
          ) : (
            <>
              {/* Workspace Header */}
              <div className="bg-ui-bg-base/80 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-4 backdrop-blur-md lg:px-8 lg:py-6">
                <button
                  onClick={() => setMobileView('list')}
                  className="hover:bg-ui-bg-subtle -ml-1 flex-shrink-0 rounded-lg p-1 transition-colors lg:hidden"
                  aria-label="Back to tickets"
                >
                  <ChevronLeft className="text-ui-fg-subtle h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-3">
                    <Badge size="2xsmall" className="font-mono">
                      #{selectedTicket.id.split('_').pop()}
                    </Badge>
                    <div className="text-ui-fg-subtle flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <Text size="xsmall">
                        {new Date(selectedTicket.created_at).toLocaleString()}
                      </Text>
                    </div>
                  </div>
                  <Heading
                    level="h1"
                    className="line-clamp-1 text-xl font-bold tracking-tight lg:text-2xl"
                  >
                    {selectedTicket.subject}
                  </Heading>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {selectedTicket.order_id && (
                    <a href={`/orders/${selectedTicket.order_id}`} target="_blank" rel="noreferrer">
                      <Badge
                        color="orange"
                        className="hidden h-8 cursor-pointer gap-1.5 px-3 transition-colors hover:bg-orange-100 sm:inline-flex lg:h-9 lg:px-4"
                      >
                        Order #{selectedTicket.order_id.slice(-8)}
                      </Badge>
                    </a>
                  )}
                  <Button
                    variant="secondary"
                    size="small"
                    className="h-8 px-3 lg:h-9 lg:px-4"
                    onClick={() => setShowMergeModal(true)}
                  >
                    Merge
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    className="h-8 px-2 lg:h-9 lg:px-3"
                    onClick={deleteTicket}
                    disabled={saving}
                  >
                    <Trash />
                  </Button>
                </div>
              </div>

              {/* Tabs & Content */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                  <Tabs value={activeTab} onValueChange={handleTabChange}>
                    <Tabs.List className="w-fit">
                      <Tabs.Trigger value="conversation">Conversation</Tabs.Trigger>
                      <Tabs.Trigger value="notes">
                        Notes ({details?.notes.length || 0})
                      </Tabs.Trigger>
                      <Tabs.Trigger value="events">Activity Log</Tabs.Trigger>
                      <Tabs.Trigger value="ai">AI Assistant</Tabs.Trigger>
                    </Tabs.List>
                  </Tabs>
                </div>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:p-8">
                  {activeTab === 'conversation' && (
                    <div className="mx-auto max-w-4xl space-y-6">
                      {loadingDetails && !details ? (
                        <div className="flex h-64 items-center justify-center">
                          <Spinner className="animate-spin" />
                        </div>
                      ) : details?.messages.length ? (
                        details.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${msg.sender_type === 'customer' ? 'items-start' : 'items-end'}`}
                          >
                            <div
                              className={`max-w-[75%] rounded-2xl p-5 text-sm shadow-sm transition-all hover:shadow-md ${
                                msg.sender_type === 'customer'
                                  ? 'bg-ui-bg-base text-ui-fg-base rounded-tl-none border'
                                  : 'bg-ui-bg-interactive text-ui-fg-on-color rounded-tr-none'
                              }`}
                            >
                              <Text size="small" className="leading-relaxed whitespace-pre-wrap">
                                {msg.message}
                              </Text>
                              {(() => {
                                const attachments = normalizeAttachments(msg.attachments)
                                if (attachments.length === 0) return null
                                return (
                                  <div className="mt-4 flex flex-wrap gap-2 border-t border-current/10 pt-3">
                                    {attachments.map((a) => (
                                      <a
                                        key={a.url || a.filename}
                                        href={getAttachmentUrl(a)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                                          msg.sender_type === 'customer'
                                            ? 'bg-ui-bg-subtle hover:bg-ui-bg-subtle-pressed'
                                            : 'bg-white/10 hover:bg-white/20'
                                        }`}
                                      >
                                        <PaperClip className="h-3 w-3" /> {a.filename}
                                      </a>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                            <Text size="xsmall" className="text-ui-fg-subtle mt-2 px-1">
                              {formatLabel(msg.sender_type)} •{' '}
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </div>
                        ))
                      ) : (
                        <div className="py-20 text-center opacity-30">
                          <Text>No messages yet.</Text>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'notes' && (
                    <div className="mx-auto max-w-3xl space-y-6">
                      <div className="bg-ui-bg-base rounded-2xl border p-6 shadow-sm">
                        <Heading level="h3" className="mb-4 flex items-center gap-2">
                          <PaperClip className="h-4 w-4" />
                          Internal Notes
                        </Heading>
                        <div className="mb-6 space-y-4">
                          {details?.notes.map((note) => (
                            <div
                              key={note.id}
                              className="bg-ui-bg-subtle/50 border-ui-border-base group relative rounded-xl border p-4"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                                  {note.author_id || 'System'} • {formatDate(note.created_at)}
                                </Text>
                              </div>
                              <Text
                                size="small"
                                className="text-ui-fg-subtle leading-relaxed italic"
                              >
                                "{note.content}"
                              </Text>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-3">
                          <Textarea
                            placeholder="Add an internal note only admins can see..."
                            value={noteContent}
                            onChange={(e) => setNoteContent(e.target.value)}
                            className="bg-ui-bg-subtle border-none shadow-inner"
                          />
                          <Button
                            variant="secondary"
                            className="w-fit self-end"
                            onClick={addNote}
                            isLoading={addingNote}
                            disabled={!noteContent.trim()}
                          >
                            Add Note
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'events' && (
                    <div className="mx-auto max-w-2xl">
                      <div className="before:bg-ui-border-base relative space-y-8 pl-8 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-[1px]">
                        {details?.events.map((event) => (
                          <div key={event.id} className="relative">
                            <div className="bg-ui-bg-base border-ui-fg-interactive absolute top-1 -left-8 z-10 h-2.5 w-2.5 rounded-full border-2" />
                            <div className="bg-ui-bg-base rounded-xl border p-4 shadow-sm">
                              <Text size="small" weight="plus">
                                {formatLabel(event.event_type)}
                              </Text>
                              <Text size="xsmall" className="text-ui-fg-subtle mt-1">
                                {formatDate(event.created_at)}
                              </Text>
                              {event.data && (
                                <pre className="bg-ui-bg-subtle mt-2 max-h-32 overflow-auto rounded p-2 text-[10px]">
                                  {JSON.stringify(event.data, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'ai' && selectedTicketId && (
                    <AiAssistantTab
                      ticketId={selectedTicketId}
                      analysis={analysis}
                      loadingAnalysis={loadingAnalysis}
                      messages={details?.messages ?? []}
                      onOpenSettings={() => setShowAiSettings(true)}
                      onApplySuggestion={(text) => {
                        setReply(text)
                        setActiveTab('conversation')
                      }}
                      onSuggestionGenerated={(suggested, confidence) => {
                        setAnalysis((prev) =>
                          prev
                            ? {
                                ...prev,
                                suggested_response: suggested,
                                response_confidence: confidence,
                              }
                            : prev,
                        )
                      }}
                      onRetryAnalysis={() => fetchAnalysis(selectedTicketId)}
                    />
                  )}
                </div>

                {/* Reply Footer */}
                <div className="px-4 pb-4 lg:px-8 lg:pb-8">
                  <div className="bg-ui-bg-base flex flex-col overflow-hidden rounded-3xl border shadow-xl">
                    {analysis && (
                      <div className="bg-ui-bg-subtle/30 animate-in fade-in slide-in-from-top-2 flex items-center justify-between border-b px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Sparkles className="text-ui-fg-interactive h-5 w-5" />
                          <div>
                            <Text size="small" weight="plus">
                              AI Smart Suggestion
                            </Text>
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              Confidence: {Math.round((analysis.response_confidence || 0) * 100)}%
                            </Text>
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

                    <div className="space-y-4 p-6">
                      <div className="flex flex-col gap-4 lg:flex-row">
                        <div className="flex-1">
                          <Textarea
                            placeholder="Type your reply to the customer..."
                            rows={4}
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            className="bg-ui-bg-subtle/50 border-ui-border-base focus:border-ui-fg-interactive resize-none text-base leading-relaxed"
                          />
                        </div>
                        <div className="w-full space-y-3 lg:w-[240px]">
                          <Label className="text-ui-fg-subtle text-[10px] font-bold tracking-widest uppercase">
                            Quick Actions
                          </Label>
                          <Select
                            onValueChange={(v) =>
                              setReply((prev) => (prev ? `${prev}\n\n${v}` : v))
                            }
                          >
                            <Select.Trigger className="h-9">
                              <Select.Value placeholder="Canned Responses" />
                            </Select.Trigger>
                            <Select.Content>
                              {CANNED_RESPONSES.map((r) => (
                                <Select.Item key={r.label} value={r.value}>
                                  {r.label}
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select>
                          <Button
                            variant="secondary"
                            className="h-9 w-full gap-2"
                            onClick={() => fileInputRef.current?.click()}
                            isLoading={uploadingFiles}
                          >
                            <PaperClip className="h-4 w-4" /> Attach Files
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
                          />
                        </div>
                      </div>

                      {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {pendingAttachments.map((a, i) => (
                            <Badge
                              key={a.url || a.filename || String(i)}
                              size="small"
                              className="gap-1.5 pr-1"
                            >
                              {a.filename}
                              <button
                                type="button"
                                aria-label={`Remove attachment ${a.filename}`}
                                onClick={() =>
                                  setPendingAttachments((p) => p.filter((_, idx) => idx !== i))
                                }
                                className="hover:text-ui-fg-base text-ui-fg-subtle"
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="border-ui-border-base flex items-center justify-between border-t pt-4">
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col">
                            <Text
                              size="xsmall"
                              className="text-ui-fg-subtle tracking-tighter uppercase"
                            >
                              Status after reply
                            </Text>
                            <Select
                              value={selectedTicket.status}
                              onValueChange={(s) => updateTicket({ status: s })}
                            >
                              <Select.Trigger className="hover:text-ui-fg-base text-ui-fg-interactive h-6 w-fit border-none bg-transparent p-0 shadow-none transition-colors">
                                <Select.Value />
                              </Select.Trigger>
                              <Select.Content>
                                {STATUS_OPTIONS.map((s) => (
                                  <Select.Item key={s} value={s}>
                                    {formatLabel(s)}
                                  </Select.Item>
                                ))}
                              </Select.Content>
                            </Select>
                          </div>
                        </div>
                        <Button
                          className="shadow-ui-fg-interactive/20 h-11 rounded-2xl px-8 shadow-lg transition-all hover:translate-y-[-1px] active:translate-y-[0px]"
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
              className="bg-ui-bg-interactive text-ui-fg-on-color fixed right-6 bottom-6 z-30 flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all hover:opacity-90 active:scale-95 lg:hidden"
              aria-label="Toggle context panel"
            >
              <Sparkles className="h-5 w-5" />
            </button>

            {/* Desktop context sidebar */}
            <div className="bg-ui-bg-base custom-scrollbar animate-in slide-in-from-right-4 hidden w-[320px] flex-col space-y-8 overflow-y-auto border-l p-8 duration-500 lg:flex">
              <ContextPanel
                selectedTicket={selectedTicket}
                customerName={customerName}
                customerEmail={customerEmail}
                customerTickets={customerTickets}
                assignedToInput={assignedToInput}
                setAssignedToInput={setAssignedToInput}
                updateTicket={updateTicket}
                analysis={analysis}
                loadingAnalysis={loadingAnalysis}
                activeTab={activeTab}
                onConfigureAi={() => setShowAiSettings(true)}
                onSelectTicket={(id) => {
                  setSelectedTicketId(id)
                  setMobileView('detail')
                }}
                statusColor={statusColor}
              />
            </div>

            {/* Mobile context overlay */}
            {showContext && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => setShowContext(false)}
                />
                <div className="bg-ui-bg-base absolute top-0 right-0 bottom-0 flex w-[320px] max-w-[85vw] flex-col shadow-2xl">
                  <div className="bg-ui-bg-base sticky top-0 z-10 flex items-center justify-between border-b p-4">
                    <Text size="small" weight="plus">
                      Context Panel
                    </Text>
                    <button
                      onClick={() => setShowContext(false)}
                      className="hover:bg-ui-bg-subtle rounded-lg p-1.5 transition-colors"
                    >
                      <XCircleSolid className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 space-y-8 overflow-y-auto p-6">
                    <ContextPanel
                      selectedTicket={selectedTicket}
                      customerName={customerName}
                      customerEmail={customerEmail}
                      customerTickets={customerTickets}
                      assignedToInput={assignedToInput}
                      setAssignedToInput={setAssignedToInput}
                      updateTicket={updateTicket}
                      analysis={analysis}
                      loadingAnalysis={loadingAnalysis}
                      activeTab={activeTab}
                      onConfigureAi={() => {
                        setShowAiSettings(true)
                        setShowContext(false)
                      }}
                      onSelectTicket={(id) => {
                        setSelectedTicketId(id)
                        setMobileView('detail')
                      }}
                      onAfterSelect={() => setShowContext(false)}
                      statusColor={statusColor}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Merge Modal */}
      {showMergeModal && (
        <div className="animate-in fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200">
          <div className="bg-ui-bg-base w-full max-w-md space-y-6 rounded-3xl border p-8 shadow-2xl">
            <div>
              <Heading level="h2">Merge Records</Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Combine thread history into this ticket.
              </Text>
            </div>
            <div className="space-y-2">
              <Label>Source Ticket ID</Label>
              <Input
                placeholder="ticket_..."
                value={mergeSourceId}
                onChange={(e) => setMergeSourceId(e.target.value)}
                className="bg-ui-bg-subtle"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowMergeModal(false)
                  setMergeSourceId('')
                }}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl px-6"
                onClick={() => mergeSourceId.trim() && mergeTicket(mergeSourceId.trim())}
                isLoading={saving}
              >
                Confirm Merge
              </Button>
            </div>
          </div>
        </div>
      )}

      <AiSettingsDrawer
        open={showAiSettings}
        onOpenChange={setShowAiSettings}
        onSettingsChanged={() => {
          if (selectedTicketId) fetchAnalysis(selectedTicketId)
        }}
      />
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
