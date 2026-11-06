import { defineRouteConfig } from '@medusajs/admin-sdk'
import {
  ArrowPath,
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
  Switch,
  Tabs,
  Text,
  Textarea,
  toast,
  usePrompt,
} from '@medusajs/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { adminFetch } from '../../lib/api'
import { analyzeTicketNow, type AIAnalysis } from './lib/ai'
import { formatLabel } from './lib/format'
import { AiAssistantTab } from './components/AiAssistantTab'
import { AiSettingsDrawer } from './components/AiSettingsDrawer'
import { ContextPanel } from './components/ContextPanel'
import { GuestEmailReplyPanel } from './components/GuestEmailReplyPanel'
import { SupportHelpStrip } from './components/SupportHelpStrip'
import {
  ACTIVE_STATUS_OPTIONS,
  CATEGORY_OPTIONS,
  CANNED_RESPONSES,
  TICKETS_POLL_MS,
  DETAILS_POLL_MS,
  formatDate,
  displayStatus,
  statusColor,
  statusName,
  normalizeAttachments,
  getAttachmentUrl,
  customerLabel,
  describeTicketEvent,
  userLabel,
} from './lib/ticket-page'
import type { AdminUser, Attachment, Ticket, TicketDetails, TicketsConfig } from './lib/ticket-page'

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

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : undefined)

export default function SupportTicketsPage() {
  const prompt = usePrompt()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ticketCount, setTicketCount] = useState(0)
  const [ticketOffset, setTicketOffset] = useState(0)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [details, setDetails] = useState<TicketDetails | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [ticketTab, setTicketTab] = useState<'active' | 'closed'>('active')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [search, setSearch] = useState('')
  const [reply, setReply] = useState('')
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)
  const [customerMissing, setCustomerMissing] = useState(false)
  const [customerTickets, setCustomerTickets] = useState<Ticket[]>([])
  const [noteContent, setNoteContent] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'conversation' | 'notes' | 'events' | 'ai'>(
    'conversation',
  )
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [showContext, setShowContext] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)
  const [config, setConfig] = useState<TicketsConfig | null>(null)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const handleTabChange = (value: string) => {
    if (value === 'conversation' || value === 'notes' || value === 'events' || value === 'ai') {
      setActiveTab(value)
    }
  }

  const userNames = useMemo(() => {
    const map = new Map(adminUsers.map((user) => [user.id, userLabel(user)]))
    return (id: string | null | undefined) => {
      if (!id) return 'An admin'
      if (id === currentUserId) return 'You'
      return map.get(id) ?? 'An admin'
    }
  }, [adminUsers, currentUserId])

  const selectedTicket = selectedTicketId
    ? details?.ticket.id === selectedTicketId
      ? {
          ...tickets.find((ticket) => ticket.id === selectedTicketId),
          ...details.ticket,
        }
      : tickets.find((ticket) => ticket.id === selectedTicketId)
    : null

  const currentPage = Math.floor(ticketOffset / TICKETS_PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(ticketCount / TICKETS_PAGE_SIZE))
  const canGoPrevious = ticketOffset > 0
  const canGoNext = ticketOffset + tickets.length < ticketCount
  const otherCustomerTickets = customerTickets.filter((ticket) => ticket.id !== selectedTicketId)

  const fetchConfig = useCallback(async () => {
    try {
      setConfig(await adminFetch<TicketsConfig>('/admin/tickets/config'))
    } catch (error) {
      console.error('[tickets] fetchConfig failed', error)
    }
  }, [])

  useEffect(() => {
    void fetchConfig()
    void (async () => {
      try {
        const [me, users] = await Promise.all([
          adminFetch<{ user: AdminUser }>('/admin/users/me'),
          adminFetch<{ users: AdminUser[] }>(
            '/admin/users?limit=100&fields=id,email,first_name,last_name',
          ),
        ])
        setCurrentUserId(me.user?.id ?? null)
        setAdminUsers(users.users ?? [])
      } catch (error) {
        console.error('[tickets] loading admin users failed', error)
      }
    })()
  }, [fetchConfig])

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
        if (assignedToMe && currentUserId) params.set('assigned_to', currentUserId)
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
        toast.error('Could not load tickets', { description: errorMessage(error) })
      } finally {
        setLoadingTickets(false)
      }
    },
    [
      assignedToMe,
      categoryFilter,
      currentUserId,
      search,
      selectedTicketId,
      statusFilter,
      ticketOffset,
      ticketTab,
    ],
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
      toast.error('Could not load the ticket', { description: errorMessage(error) })
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
      setCustomerMissing(false)
      setCustomerName(
        [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') ||
          customer?.email ||
          'Customer',
      )
      setCustomerEmail(customer?.email ?? null)
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 404) console.error(`[tickets] fetchCustomer failed for ${customerId}`, error)
      // A 404 means the customer account was deleted (for example by a privacy request).
      setCustomerMissing(status === 404)
      setCustomerName(status === 404 ? 'Deleted customer' : 'Customer')
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
        toast.success(
          updates.status
            ? `Status set to ${statusName(updates.status)}`
            : updates.assigned_to === null
              ? 'Ticket unassigned'
              : `Assigned to ${userNames(updates.assigned_to)}`,
        )
      } catch (error) {
        console.error(`[tickets] updateTicket failed for ${selectedTicketId}`, error)
        toast.error('Could not update the ticket', { description: errorMessage(error) })
      } finally {
        setSaving(false)
      }
    },
    [fetchTickets, selectedTicketId, userNames],
  )

  const sendReply = async () => {
    if (!selectedTicketId || !selectedTicket?.customer_id) return
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
      if (config?.customer_replies.can_send) {
        toast.success('Reply sent', {
          description: customerEmail ? `Emailed to ${customerEmail}` : undefined,
        })
      } else {
        toast.warning('Reply saved on the ticket, but not emailed', {
          description: config?.customer_replies.reason ?? undefined,
        })
      }
      await Promise.all([fetchDetails(selectedTicketId), fetchTickets()])
    } catch (error) {
      console.error(`[tickets] sendReply failed for ${selectedTicketId}`, error)
      toast.error('Reply not sent', { description: errorMessage(error) })
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
      toast.error('Could not add the note', { description: errorMessage(error) })
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
      toast.error('File upload failed', { description: errorMessage(error) })
    } finally {
      setUploadingFiles(false)
    }
  }

  const analyzeNow = async () => {
    if (!selectedTicketId) return
    setAnalyzing(true)
    try {
      setAnalysis(await analyzeTicketNow(selectedTicketId))
      toast.success('Ticket analyzed')
    } catch (error) {
      toast.error('Analysis failed', { description: errorMessage(error) })
    } finally {
      setAnalyzing(false)
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
      toast.success('Tickets merged', {
        description: 'Messages and notes moved here; the other ticket is closed.',
      })
      setShowMergeModal(false)
      setMergeSourceId(null)
      await Promise.all([fetchDetails(selectedTicketId), fetchTickets()])
      if (selectedTicket?.customer_id) await fetchCustomerTickets(selectedTicket.customer_id)
    } catch (error) {
      console.error(`[tickets] mergeTicket failed for ${selectedTicketId}`, error)
      toast.error('Could not merge the tickets', { description: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const deleteTicket = async () => {
    if (!selectedTicketId || !selectedTicket) return
    const confirmed = await prompt({
      title: 'Delete this ticket?',
      description: `"${selectedTicket.subject}" and all its messages and notes are removed. This cannot be undone. To keep the history, set the status to Closed instead.`,
      confirmText: 'Delete',
      cancelText: 'Keep',
      variant: 'danger',
    })
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
      toast.error('Could not delete the ticket', { description: errorMessage(error) })
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
    setCustomerMissing(false)
    if (!customerId) {
      setCustomerName(selectedTicket ? customerLabel(selectedTicket) : null)
      setCustomerEmail(selectedTicket?.contact_email ?? null)
      setCustomerTickets([])
      return
    }
    setCustomerName(null)
    setCustomerEmail(null)
    void Promise.all([fetchCustomer(customerId), fetchCustomerTickets(customerId)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket?.id, selectedTicket?.customer_id, fetchCustomer, fetchCustomerTickets])

  useEffect(() => {
    if (!selectedTicketId || !tickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(tickets[0]?.id ?? null)
    }
  }, [selectedTicketId, tickets])

  const senderLabel = (senderType: string) =>
    senderType === 'customer'
      ? (customerName ?? 'Customer')
      : senderType === 'system'
        ? 'Automatic reply'
        : 'Support team'

  const contextPanelProps = selectedTicket
    ? {
        selectedTicket: selectedTicket as Ticket,
        customerName,
        customerEmail,
        customerMissing,
        customerTickets,
        adminUsers,
        currentUserId,
        saving,
        updateTicket,
        analysis,
        loadingAnalysis,
        config,
        activeTab,
        onConfigureAi: () => setShowAiSettings(true),
        onAnalyzeNow: () => void analyzeNow(),
        analyzing,
        onMergeFromHistory: () => setShowMergeModal(true),
        statusColor,
      }
    : null

  const canReplyToCustomer = Boolean(selectedTicket?.customer_id) && !customerMissing

  return (
    <Container className="bg-ui-bg-subtle/20 p-0">
      <div className="flex h-dvh flex-col overflow-hidden lg:h-[calc(100vh-57px)]">
        <SupportHelpStrip config={config} />
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left: ticket list */}
          <div
            className={`${mobileView === 'detail' ? 'hidden' : 'flex'} bg-ui-bg-base w-full flex-shrink-0 flex-col border-r lg:flex lg:w-[380px]`}
          >
            <div className="space-y-3 border-b p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <Heading level="h1" className="flex items-center gap-2 text-xl font-bold">
                  <ChatBubbleLeftRight className="text-ui-fg-interactive" />
                  Support tickets
                </Heading>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => void fetchTickets()}
                  disabled={loadingTickets}
                >
                  <ArrowPath className={loadingTickets ? 'animate-spin' : ''} />
                  Refresh
                </Button>
              </div>
              <Input
                size="small"
                placeholder="Search subject, order ID or guest email"
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
                  <Select.Trigger className="h-8" aria-label="Filter by status">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">Any status</Select.Item>
                    {ACTIVE_STATUS_OPTIONS.map((s) => (
                      <Select.Item key={s} value={s}>
                        {statusName(s)}
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
                  <Select.Trigger className="h-8" aria-label="Filter by category">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">Any category</Select.Item>
                    {CATEGORY_OPTIONS.map((c) => (
                      <Select.Item key={c} value={c}>
                        {formatLabel(c)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="tickets-assigned-to-me"
                  checked={assignedToMe}
                  disabled={!currentUserId}
                  onCheckedChange={(checked) => {
                    setTicketOffset(0)
                    setAssignedToMe(checked)
                  }}
                />
                <Label htmlFor="tickets-assigned-to-me" size="small">
                  Assigned to me
                </Label>
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
              {loadingTickets && tickets.length === 0 ? (
                <div className="flex h-64 items-center justify-center">
                  <Spinner className="text-ui-fg-interactive animate-spin" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-ui-fg-subtle flex h-full flex-col items-center justify-center p-10 text-center">
                  <ChatBubbleLeftRight className="mb-4 h-10 w-10 opacity-50" />
                  <Text size="small" weight="plus">
                    No tickets here
                  </Text>
                  <Text size="xsmall" className="mt-1">
                    Tickets appear when a signed-in customer sends the storefront contact form, or
                    when someone emails the support address while email intake is on.
                  </Text>
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
                      className={`hover:bg-ui-bg-subtle group focus:ring-ui-fg-interactive cursor-pointer border-l-4 p-4 transition-colors focus:ring-2 focus:outline-none focus:ring-inset lg:p-5 ${
                        ticket.id === selectedTicketId
                          ? 'bg-ui-bg-subtle-pressed border-l-ui-fg-interactive'
                          : 'border-l-transparent'
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <Text size="small" weight="plus" className="line-clamp-1 flex-1">
                          {ticket.subject}
                        </Text>
                        <Badge size="2xsmall" color={statusColor(ticket.status)}>
                          {statusName(displayStatus(ticket.status))}
                        </Badge>
                      </div>
                      <div className="text-ui-fg-subtle flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <User className="h-3.5 w-3.5 flex-shrink-0" />
                          <Text size="xsmall" className="truncate">
                            {customerLabel(ticket)}
                            {!ticket.customer_id && ticket.contact_email ? ' · email' : ''}
                          </Text>
                        </div>
                        <Text size="xsmall" className="flex-shrink-0">
                          {ticket.assigned_to && ticket.assigned_to === currentUserId
                            ? 'Yours · '
                            : ''}
                          {formatTime(ticket.updated_at)}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-ui-bg-base border-t px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {ticketCount === 0
                    ? '0 tickets'
                    : `${ticketCount} ticket${ticketCount === 1 ? '' : 's'} · page ${currentPage} of ${totalPages}`}
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

          {/* Center: ticket workspace */}
          <div
            className={`${mobileView === 'list' ? 'hidden' : 'flex'} relative min-h-0 min-w-0 flex-1 flex-col lg:flex`}
          >
            {!selectedTicket ? (
              <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center p-8 text-center">
                <ChatBubbleLeftRight className="text-ui-fg-subtle mb-4 h-10 w-10" />
                <Heading level="h2" className="mb-2">
                  No ticket selected
                </Heading>
                <Text className="text-ui-fg-subtle">
                  Pick a ticket on the left to read it and reply.
                </Text>
              </div>
            ) : (
              <>
                {/* Ticket header */}
                <div className="bg-ui-bg-base flex items-center gap-3 border-b px-4 py-4 lg:px-8 lg:py-5">
                  <button
                    onClick={() => setMobileView('list')}
                    className="hover:bg-ui-bg-subtle -ml-1 flex-shrink-0 rounded-lg p-1 transition-colors lg:hidden"
                    aria-label="Back to tickets"
                  >
                    <ChevronLeft className="text-ui-fg-subtle h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-ui-fg-subtle mb-1 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <Text size="xsmall">
                        Opened {new Date(selectedTicket.created_at).toLocaleString()}
                      </Text>
                    </div>
                    <Heading level="h1" className="line-clamp-1 text-xl font-bold lg:text-2xl">
                      {selectedTicket.subject}
                    </Heading>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {selectedTicket.order_id && (
                      <a
                        href={`/app/orders/${selectedTicket.order_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Badge color="orange" className="hidden h-8 gap-1.5 px-3 sm:inline-flex">
                          Order #{selectedTicket.order_id.slice(-8)}
                        </Badge>
                      </a>
                    )}
                    {canReplyToCustomer && otherCustomerTickets.length > 0 && (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setShowMergeModal(true)}
                      >
                        Merge…
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => void deleteTicket()}
                      disabled={saving}
                      aria-label="Delete ticket"
                    >
                      <Trash />
                    </Button>
                  </div>
                </div>

                {/* Tabs & content */}
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="px-4 pt-4 lg:px-8 lg:pt-6">
                    <Tabs value={activeTab} onValueChange={handleTabChange}>
                      <Tabs.List className="w-fit">
                        <Tabs.Trigger value="conversation">Conversation</Tabs.Trigger>
                        <Tabs.Trigger value="notes">
                          Internal notes ({details?.notes.length || 0})
                        </Tabs.Trigger>
                        <Tabs.Trigger value="events">Activity</Tabs.Trigger>
                        <Tabs.Trigger value="ai">AI suggestions</Tabs.Trigger>
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
                                className={`max-w-[75%] rounded-2xl p-5 text-sm shadow-sm ${
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
                                {senderLabel(msg.sender_type)} · {formatDate(msg.created_at)}
                              </Text>
                            </div>
                          ))
                        ) : (
                          <div className="py-20 text-center">
                            <Text className="text-ui-fg-subtle">No messages yet.</Text>
                          </div>
                        )}
                        {!selectedTicket.customer_id && selectedTicket.contact_email && (
                          <GuestEmailReplyPanel
                            key={selectedTicket.id}
                            ticketId={selectedTicket.id}
                            recipient={selectedTicket.contact_email}
                            canSend={config?.guest_replies.can_send ?? true}
                            cannotSendReason={config?.guest_replies.reason ?? null}
                          />
                        )}
                        {!selectedTicket.customer_id && !selectedTicket.contact_email && (
                          <Text size="small" className="text-ui-fg-subtle text-center">
                            This ticket has no customer account or email address any more, so it
                            cannot be answered. Close it when you are done.
                          </Text>
                        )}
                      </div>
                    )}

                    {activeTab === 'notes' && (
                      <div className="mx-auto max-w-3xl space-y-6">
                        <div className="bg-ui-bg-base rounded-2xl border p-6 shadow-sm">
                          <Heading level="h3" className="mb-1">
                            Internal notes
                          </Heading>
                          <Text size="small" className="text-ui-fg-subtle mb-4">
                            Only admins see these. The customer never does.
                          </Text>
                          <div className="mb-6 space-y-4">
                            {(details?.notes ?? []).length === 0 && (
                              <Text size="small" className="text-ui-fg-subtle">
                                No notes yet.
                              </Text>
                            )}
                            {details?.notes.map((note) => (
                              <div
                                key={note.id}
                                className="bg-ui-bg-subtle/50 border-ui-border-base rounded-xl border p-4"
                              >
                                <Text
                                  size="xsmall"
                                  weight="plus"
                                  className="text-ui-fg-subtle mb-2"
                                >
                                  {note.author_id ? userNames(note.author_id) : 'The store'} ·{' '}
                                  {formatDate(note.created_at)}
                                </Text>
                                <Text size="small" className="leading-relaxed whitespace-pre-wrap">
                                  {note.content}
                                </Text>
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-col gap-3">
                            <Textarea
                              placeholder="Add a note for other admins…"
                              value={noteContent}
                              onChange={(e) => setNoteContent(e.target.value)}
                              aria-label="New internal note"
                            />
                            <Button
                              variant="secondary"
                              className="w-fit self-end"
                              onClick={addNote}
                              isLoading={addingNote}
                              disabled={!noteContent.trim()}
                            >
                              Add note
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'events' && (
                      <div className="mx-auto max-w-2xl">
                        {(details?.events ?? []).length === 0 ? (
                          <Text size="small" className="text-ui-fg-subtle">
                            No activity recorded.
                          </Text>
                        ) : (
                          <ol className="space-y-3">
                            {details?.events.map((event) => (
                              <li key={event.id} className="border-l-2 pl-4">
                                <Text size="small">{describeTicketEvent(event, userNames)}</Text>
                                <Text size="xsmall" className="text-ui-fg-subtle">
                                  {formatDate(event.created_at)}
                                </Text>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    )}

                    {activeTab === 'ai' && selectedTicketId && (
                      <AiAssistantTab
                        ticketId={selectedTicketId}
                        analysis={analysis}
                        loadingAnalysis={loadingAnalysis}
                        messages={details?.messages ?? []}
                        config={config}
                        onAnalyzeNow={() => void analyzeNow()}
                        analyzing={analyzing}
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
                      />
                    )}
                  </div>

                  {/* Reply box (signed-in customers; guests use the email panel above) */}
                  {canReplyToCustomer && activeTab === 'conversation' && (
                    <div className="px-4 pb-4 lg:px-8 lg:pb-8">
                      <div className="bg-ui-bg-base flex flex-col overflow-hidden rounded-2xl border shadow-sm">
                        {analysis?.suggested_response && (
                          <div className="bg-ui-bg-subtle/30 flex items-center justify-between border-b px-6 py-3">
                            <div className="flex items-center gap-3">
                              <Sparkles className="text-ui-fg-interactive h-5 w-5" />
                              <div>
                                <Text size="small" weight="plus">
                                  AI suggested a reply
                                </Text>
                                <Text size="xsmall" className="text-ui-fg-subtle">
                                  Confidence {Math.round((analysis.response_confidence || 0) * 100)}
                                  %. Read it before sending.
                                </Text>
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setReply(analysis.suggested_response || '')}
                            >
                              Use suggestion <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}

                        <div className="space-y-4 p-6">
                          <div className="flex flex-col gap-4 lg:flex-row">
                            <div className="flex-1">
                              <Textarea
                                placeholder="Write your reply to the customer…"
                                rows={4}
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                aria-label="Reply to the customer"
                                className="resize-none text-base leading-relaxed"
                              />
                            </div>
                            <div className="w-full space-y-3 lg:w-[240px]">
                              <Select
                                value=""
                                onValueChange={(v) =>
                                  setReply((prev) => (prev ? `${prev}\n\n${v}` : v))
                                }
                              >
                                <Select.Trigger className="h-9" aria-label="Insert a saved answer">
                                  <Select.Value placeholder="Insert a saved answer" />
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
                                <PaperClip className="h-4 w-4" /> Attach files
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

                          <div className="border-ui-border-base flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <Text size="xsmall" className="text-ui-fg-subtle max-w-md">
                              {config?.customer_replies.can_send
                                ? `The reply is emailed to ${customerEmail ?? 'the customer'} and the status becomes Waiting for customer.`
                                : (config?.customer_replies.reason ??
                                  'The reply is saved on the ticket.')}
                            </Text>
                            <Button
                              onClick={sendReply}
                              disabled={
                                (!reply.trim() && pendingAttachments.length === 0) || saving
                              }
                              isLoading={saving}
                            >
                              Send reply
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: context sidebar */}
          {selectedTicket && contextPanelProps && (
            <>
              <button
                onClick={() => setShowContext(!showContext)}
                className="bg-ui-bg-interactive text-ui-fg-on-color fixed right-6 bottom-6 flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-all hover:opacity-90 active:scale-95 lg:hidden"
                aria-label="Show customer and ticket details"
              >
                <User className="h-5 w-5" />
              </button>

              <div className="bg-ui-bg-base custom-scrollbar hidden w-[320px] flex-col space-y-8 overflow-y-auto border-l p-8 lg:flex">
                <ContextPanel
                  {...contextPanelProps}
                  onSelectTicket={(id) => {
                    setSelectedTicketId(id)
                    setMobileView('detail')
                  }}
                />
              </div>

              {showContext && (
                <div className="fixed inset-0 lg:hidden">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setShowContext(false)}
                  />
                  <div className="bg-ui-bg-base absolute top-0 right-0 bottom-0 flex w-[320px] max-w-[85vw] flex-col shadow-2xl">
                    <div className="bg-ui-bg-base flex items-center justify-between border-b p-4">
                      <Text size="small" weight="plus">
                        Ticket details
                      </Text>
                      <button
                        onClick={() => setShowContext(false)}
                        className="hover:bg-ui-bg-subtle rounded-lg p-1.5 transition-colors"
                        aria-label="Close ticket details"
                      >
                        <XCircleSolid className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 space-y-8 overflow-y-auto p-6">
                      <ContextPanel
                        {...contextPanelProps}
                        onConfigureAi={() => {
                          setShowAiSettings(true)
                          setShowContext(false)
                        }}
                        onSelectTicket={(id) => {
                          setSelectedTicketId(id)
                          setMobileView('detail')
                        }}
                        onAfterSelect={() => setShowContext(false)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Merge picker: another ticket from the same customer into this one */}
      {showMergeModal && selectedTicket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-tickets-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
        >
          <div className="bg-ui-bg-base w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-2xl">
            <div>
              <Heading level="h2" id="merge-tickets-title">
                Merge a ticket into this one
              </Heading>
              <Text size="small" className="text-ui-fg-subtle mt-1">
                Pick another ticket from this customer. Its messages and notes move into "
                {selectedTicket.subject}", and the other ticket is closed.
              </Text>
            </div>
            {otherCustomerTickets.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                This customer has no other tickets.
              </Text>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {otherCustomerTickets.map((ticket) => (
                  <label
                    key={ticket.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      mergeSourceId === ticket.id ? 'border-ui-fg-interactive bg-ui-bg-subtle' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="merge-source"
                      className="mt-1"
                      checked={mergeSourceId === ticket.id}
                      onChange={() => setMergeSourceId(ticket.id)}
                    />
                    <div className="min-w-0">
                      <Text size="small" weight="plus" className="line-clamp-1">
                        {ticket.subject}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {statusName(ticket.status)} · opened{' '}
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowMergeModal(false)
                  setMergeSourceId(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => mergeSourceId && void mergeTicket(mergeSourceId)}
                disabled={!mergeSourceId}
                isLoading={saving}
              >
                Merge into this ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      <AiSettingsDrawer
        open={showAiSettings}
        onOpenChange={setShowAiSettings}
        onSettingsChanged={() => {
          void fetchConfig()
          if (selectedTicketId) void fetchAnalysis(selectedTicketId)
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
  label: 'Support tickets',
  icon: ChatBubbleLeftRight,
})
