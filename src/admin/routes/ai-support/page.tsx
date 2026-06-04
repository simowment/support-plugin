import { defineRouteConfig } from '@medusajs/admin-sdk'
import {
  ChatBubbleLeftRight,
  CheckCircleSolid,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExclamationCircleSolid,
  Sparkles,
  Spinner,
  Trash,
  User,
  XCircleSolid,
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
  Table,
  Tabs,
  Text,
  Textarea,
  toast,
} from '@medusajs/ui'
import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from '../../lib/api'

type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  customer_id: string
  order_id: string | null
  created_at: string
}

type TicketMessage = {
  id: string
  sender_type: 'customer' | 'admin' | 'system'
  message: string
  created_at: string
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
  auto_replied_at: string | null
  suggested_response: string | null
  response_confidence: number | null
}

type ProviderSettings = {
  provider: string
  model: string
  base_url: string
  has_api_key: boolean
  api_key_preview: string
}

type PromptSettings = {
  analysis_system_prompt: string
  response_system_prompt: string
  escalation_rules: string
}

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  custom: '',
}

const DEFAULT_MODEL = 'gpt-4o'

const formatLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const confidenceColor = (score: number | null) => {
  if (score === null) return 'grey'
  if (score >= 0.8) return 'green'
  if (score >= 0.5) return 'orange'
  return 'red'
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000)

  if (diffInMinutes < 1) return 'Just now'
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours}h ago`
  return date.toLocaleDateString()
}

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'open':
      return 'blue'
    case 'in_progress':
      return 'orange'
    case 'resolved':
      return 'green'
    case 'closed':
      return 'grey'
    case 'waiting_admin':
      return 'red'
    default:
      return 'grey'
  }
}

export default function AISupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'active' | 'closed'>('active')
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [search, setSearch] = useState('')
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const [messages, setMessages] = useState<TicketMessage[]>([])

  // Settings state
  const [aiEnabled, setAiEnabled] = useState(true)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [loadingToggle, setLoadingToggle] = useState(false)
  const [loadingAutoReplyToggle, setLoadingAutoReplyToggle] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>({
    provider: 'openrouter',
    model: '',
    base_url: '',
    has_api_key: false,
    api_key_preview: '',
  })
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null)
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    analysis_system_prompt: '',
    response_system_prompt: '',
    escalation_rules: '',
  })
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase()
    const baseTickets = tickets.filter((t) =>
      activeTab === 'active' ? t.status !== 'closed' : t.status === 'closed'
    )

    if (!term) return baseTickets
    return baseTickets.filter(
      (t) =>
        t.subject.toLowerCase().includes(term) ||
        t.id.toLowerCase().includes(term) ||
        t.customer_id.toLowerCase().includes(term)
    )
  }, [tickets, search, activeTab])

  const fetchSettings = async () => {
    try {
      const data = await adminFetch<{
        enabled: boolean
        auto_reply_enabled: boolean
        provider: ProviderSettings
        prompts: PromptSettings
      }>('/admin/tickets/ai-settings')
      setAiEnabled(data.enabled)
      setAutoReplyEnabled(data.auto_reply_enabled)
      setProviderSettings(data.provider)
      setPromptSettings(data.prompts)
    } catch {
      setAiEnabled(true)
      setAutoReplyEnabled(false)
    }
  }

  const toggleAi = async (checked: boolean) => {
    setLoadingToggle(true)
    try {
      const data = await adminFetch<{ enabled: boolean }>('/admin/tickets/ai-settings', {
        method: 'POST',
        body: { enabled: checked },
      })
      setAiEnabled(data.enabled)
      toast.success(checked ? 'AI analysis enabled' : 'AI analysis disabled')
    } catch {
      toast.error('Failed to update AI settings')
    } finally {
      setLoadingToggle(false)
    }
  }

  const toggleAutoReply = async (checked: boolean) => {
    setLoadingAutoReplyToggle(true)
    try {
      const data = await adminFetch<{ auto_reply_enabled: boolean }>('/admin/tickets/ai-settings', {
        method: 'POST',
        body: { auto_reply_enabled: checked },
      })
      setAutoReplyEnabled(data.auto_reply_enabled)
      toast.success(checked ? 'Auto-reply enabled' : 'Auto-reply disabled')
    } catch {
      toast.error('Failed to update auto-reply setting')
    } finally {
      setLoadingAutoReplyToggle(false)
    }
  }

  const saveProviderSettings = async () => {
    setSavingSettings(true)
    try {
      const body: any = {
        provider: providerSettings.provider,
        model: providerSettings.model,
        base_url: providerSettings.base_url,
        analysis_system_prompt: promptSettings.analysis_system_prompt,
        response_system_prompt: promptSettings.response_system_prompt,
        escalation_rules: promptSettings.escalation_rules,
      }
      if (editingApiKey && apiKeyInput) {
        body.api_key = apiKeyInput
      }

      const data = await adminFetch<{
        provider: ProviderSettings
        prompts: PromptSettings
      }>('/admin/tickets/ai-settings', {
        method: 'POST',
        body,
      })
      setProviderSettings(data.provider)
      setPromptSettings(data.prompts)
      setEditingApiKey(false)
      setApiKeyInput('')
      toast.success('Settings saved')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleProviderChange = (newProvider: string) => {
    setProviderSettings((prev) => ({
      ...prev,
      provider: newProvider,
      base_url: PROVIDER_BASE_URLS[newProvider] ?? prev.base_url,
    }))
  }

  const deleteTicket = async (ticketId: string) => {
    if (!window.confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) {
      return
    }

    setDeletingTicketId(ticketId)
    try {
      await adminFetch(`/admin/tickets/${ticketId}`, {
        method: 'DELETE',
      })
      toast.success('Ticket deleted')
      setTickets((prev) => prev.filter((t) => t.id !== ticketId))
      setSelectedTicketId(null)
      setAnalysis(null)
    } catch {
      toast.error('Failed to delete ticket')
    } finally {
      setDeletingTicketId(null)
    }
  }

  const fetchTickets = async () => {
    setLoadingTickets(true)
    try {
      const data = await adminFetch<{ tickets: Ticket[] }>('/admin/tickets?limit=100')
      setTickets(data.tickets ?? [])
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoadingTickets(false)
    }
  }

  const fetchAnalysis = async (ticketId: string) => {
    setLoadingAnalysis(true)
    try {
      const [analysisData, ticketData] = await Promise.all([
        adminFetch<{ analysis: AIAnalysis }>(`/admin/tickets/${ticketId}/ai`),
        adminFetch<{ ticket: Ticket; messages: TicketMessage[] }>(`/admin/tickets/${ticketId}`)
      ])
      setAnalysis(analysisData.analysis)
      setMessages(ticketData.messages)
    } catch {
      setAnalysis(null)
      setMessages([])
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const generateSuggestion = async () => {
    if (!selectedTicketId) return
    setGenerating(true)
    try {
      const data = await adminFetch<{ suggested_response: string; confidence: number }>(
        `/admin/tickets/${selectedTicketId}/ai/suggest`,
        { method: 'POST' }
      )
      setReplyDraft(data.suggested_response)
      setAnalysis((prev) =>
        prev
          ? {
              ...prev,
              suggested_response: data.suggested_response,
              response_confidence: data.confidence,
            }
          : null
      )
      toast.success('AI suggestion generated')
    } catch {
      toast.error('Failed to generate suggestion')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    fetchTickets()
    fetchSettings()
  }, [])

  useEffect(() => {
    if (selectedTicketId) {
      fetchAnalysis(selectedTicketId)
      setReplyDraft('')
    } else {
      setAnalysis(null)
    }
  }, [selectedTicketId])

  const selectedTicket = tickets.find(t => t.id === selectedTicketId)

  return (
    <Container className="p-0 bg-ui-bg-subtle/20 flex flex-col h-dvh lg:h-[calc(100vh-57px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 lg:px-8 py-4 lg:py-6 bg-ui-bg-base flex-shrink-0">
        <div>
          <Heading level="h1" className="flex items-center gap-2">
            <Sparkles className="text-ui-fg-interactive" />
            AI Support Center
          </Heading>
          <Text className="text-ui-fg-subtle mt-1">
            Deep analysis and automated response intelligence
          </Text>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-4 border-r pr-4">
            <Text size="small" weight="plus">AI Intelligence</Text>
            <Switch
              checked={aiEnabled}
              onCheckedChange={toggleAi}
              disabled={loadingToggle}
            />
          </div>
          <Button
            variant="secondary"
            size="small"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? 'Hide Config' : 'Configure AI'}
          </Button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-ui-bg-subtle border-b p-4 lg:p-8 animate-in fade-in slide-in-from-top-4 duration-300 max-h-[70vh] overflow-y-auto flex-shrink-0">
          <div className="max-w-5xl mx-auto grid gap-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
              <div className="rounded-xl border bg-ui-bg-base p-6 shadow-sm">
                <Heading level="h3" className="mb-4">Provider Settings</Heading>
                <div className="grid gap-4">
                  <div>
                    <Label>Model Provider</Label>
                    <Select value={providerSettings.provider} onValueChange={handleProviderChange}>
                      <Select.Trigger id="ai-provider" className="mt-1">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {PROVIDER_OPTIONS.map((o) => (
                          <Select.Item key={o.value} value={o.value}>{o.label}</Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                  <div>
                    <Label>Model Name</Label>
                    <Input
                      className="mt-1"
                      value={providerSettings.model}
                      onChange={(e) => setProviderSettings(p => ({ ...p, model: e.target.value }))}
                      placeholder={DEFAULT_MODEL}
                    />
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        type="password"
                        value={editingApiKey ? apiKeyInput : providerSettings.api_key_preview}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        disabled={!editingApiKey}
                        placeholder={providerSettings.has_api_key ? '••••••••' : 'Enter API key'}
                      />
                      {!editingApiKey ? (
                        <Button variant="secondary" onClick={() => setEditingApiKey(true)}>Edit</Button>
                      ) : (
                        <Button variant="secondary" onClick={() => { setEditingApiKey(false); setApiKeyInput(''); }}>Cancel</Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-ui-bg-base p-6 shadow-sm flex flex-col">
                <Heading level="h3" className="mb-4">Auto-Response Policy</Heading>
                <div className="flex-1 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <Text weight="plus">Direct Automation</Text>
                      <Text size="small" className="text-ui-fg-subtle">Automatically reply to low-risk inquiries</Text>
                    </div>
                    <Switch
                      checked={autoReplyEnabled}
                      onCheckedChange={toggleAutoReply}
                      disabled={loadingAutoReplyToggle}
                    />
                  </div>
                  <div className="p-4 rounded-lg bg-ui-bg-subtle text-ui-fg-subtle text-xs border border-ui-border-base">
                    <Text size="xsmall" weight="plus" className="mb-1 uppercase tracking-tight">Safety Protocol</Text>
                    <Text size="xsmall">
                      AI only replies automatically when confidence &gt; 90% and no sensitive keywords (refund, legal, fraud) are detected.
                    </Text>
                  </div>
                </div>
                <Button variant="primary" className="w-full mt-6" onClick={saveProviderSettings} isLoading={savingSettings}>
                  Save All Settings
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-ui-bg-base p-6 shadow-sm">
              <Heading level="h3" className="mb-4">System Intelligence Prompts</Heading>
              <div className="grid gap-6">
                <div>
                  <Label>Triage & Analysis Logic (Required)</Label>
                  <Textarea
                    className="mt-1 font-mono text-xs leading-relaxed"
                    rows={4}
                    value={promptSettings.analysis_system_prompt}
                    onChange={(e) => setPromptSettings(p => ({ ...p, analysis_system_prompt: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Strict Escalation Rules</Label>
                  <Textarea
                    className="mt-1 font-mono text-xs leading-relaxed"
                    rows={3}
                    value={promptSettings.escalation_rules}
                    onChange={(e) => setPromptSettings(p => ({ ...p, escalation_rules: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Voice & Tone Profile (Required)</Label>
                  <Textarea
                    className="mt-1 font-mono text-xs leading-relaxed"
                    rows={4}
                    value={promptSettings.response_system_prompt}
                    onChange={(e) => setPromptSettings(p => ({ ...p, response_system_prompt: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content: sidebar + workspace */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Sidebar: Tickets */}
        <div className={`${mobileView === 'detail' ? 'hidden' : 'flex'} lg:flex w-full lg:w-[420px] flex-shrink-0 border-r bg-ui-bg-base flex-col shadow-sm z-10`}>
          <div className="p-6 border-b space-y-4 bg-ui-bg-base/50 backdrop-blur-sm sticky top-0">
            <Input
              size="small"
              placeholder="Search by subject, ID, or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <Tabs.List className="w-full">
                <Tabs.Trigger value="active" className="flex-1">Active</Tabs.Trigger>
                <Tabs.Trigger value="closed" className="flex-1">Closed</Tabs.Trigger>
              </Tabs.List>
            </Tabs>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
            {loadingTickets ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner className="animate-spin text-ui-fg-interactive" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-12 text-center text-ui-fg-subtle opacity-50">
                <ChatBubbleLeftRight className="mb-4 h-12 w-12" />
                <Text size="small">No tickets found in this category.</Text>
              </div>
            ) : (
              <div className="divide-y divide-ui-border-base">
                {filteredTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => { setSelectedTicketId(ticket.id); setMobileView('detail') }}
                    className={`p-5 cursor-pointer transition-all duration-200 hover:bg-ui-bg-subtle group border-l-4 ${
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
                        {ticket.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-ui-fg-subtle">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        <Text size="xsmall" className="truncate">
                          {ticket.customer_id.split('_').pop()}
                        </Text>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                        <Text size="xsmall">{formatTime(ticket.created_at)}</Text>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Workspace: Analysis */}
        <div className={`${mobileView === 'list' ? 'hidden' : 'block'} lg:block flex-1 overflow-y-auto p-4 lg:p-10 bg-ui-bg-subtle/10 scroll-smooth min-h-0`}>
          {!selectedTicketId ? (
            <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto text-center animate-in fade-in zoom-in duration-500">
              <div className="w-24 h-24 rounded-3xl bg-ui-bg-base shadow-xl flex items-center justify-center mb-8 border border-ui-border-base rotate-3 hover:rotate-0 transition-transform cursor-default">
                <Sparkles className="h-12 w-12 text-ui-fg-interactive" />
              </div>
              <Heading level="h2" className="mb-3 text-2xl">Insight Workspace</Heading>
              <Text className="text-ui-fg-subtle leading-relaxed">
                Select a ticket to activate the AI Support Engine. You'll get instant classification, priority assessment, and a ready-to-send draft.
              </Text>
            </div>
          ) : loadingAnalysis ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <Spinner className="animate-spin h-12 w-12 text-ui-fg-interactive" />
                  <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-ui-fg-interactive animate-pulse" />
                </div>
                <div className="text-center">
                  <Text weight="plus" className="text-lg tracking-tight">AI is Thinking...</Text>
                  <Text size="small" className="text-ui-fg-subtle">Processing ticket context and history</Text>
                </div>
              </div>
            </div>
          ) : !selectedTicket ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-ui-bg-base rounded-2xl border shadow-sm max-w-md mx-auto">
              <XCircleSolid className="h-12 w-12 text-ui-fg-error mb-4" />
              <Heading level="h3">Ticket Not Found</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                The selected ticket is no longer available. Choose another ticket from the list.
              </Text>
            </div>
          ) : !analysis ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-ui-bg-base rounded-2xl border shadow-sm max-w-md mx-auto">
              <XCircleSolid className="h-12 w-12 text-ui-fg-error mb-4" />
              <Heading level="h3">Analysis Pipeline Failed</Heading>
              <Text className="text-ui-fg-subtle mt-2">
                We couldn't retrieve the AI analysis for this ticket. The server might be busy or the configuration is invalid.
              </Text>
              <Button variant="secondary" className="mt-6" onClick={() => fetchAnalysis(selectedTicketId)}>Try Again</Button>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Context Header */}
              <div className="rounded-2xl border bg-ui-bg-base p-4 lg:p-8 shadow-md flex items-center justify-between border-t-4 border-t-ui-fg-interactive">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <button 
                    onClick={() => setMobileView('list')} 
                    className="lg:hidden flex-shrink-0 p-1 -ml-1 rounded-lg hover:bg-ui-bg-subtle transition-colors"
                    aria-label="Back to tickets"
                  >
                    <ChevronLeft className="h-5 w-5 text-ui-fg-subtle" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-3 flex-wrap">
                      <Badge size="2xsmall" className="font-mono bg-ui-bg-subtle text-ui-fg-base px-2">ID: {selectedTicketId.split('_').pop()}</Badge>
                      <div className="flex items-center gap-1.5 text-ui-fg-subtle">
                        <Clock className="h-3.5 w-3.5" />
                        <Text size="xsmall">{new Date(selectedTicket.created_at).toLocaleString()}</Text>
                      </div>
                    </div>
                    <Heading level="h1" className="text-xl lg:text-3xl font-bold tracking-tight line-clamp-2">{selectedTicket.subject}</Heading>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedTicket.order_id && (
                    <Badge size="small" color="orange" className="h-8 lg:h-10 px-3 lg:px-4 hidden sm:inline-flex">
                      Order: {selectedTicket.order_id.split('_').pop()}
                    </Badge>
                  )}
                  <Button
                    variant="danger"
                    size="small"
                    className="h-8 lg:h-10 px-3 lg:px-4"
                    onClick={() => deleteTicket(selectedTicketId)}
                    isLoading={deletingTicketId === selectedTicketId}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
                <div className="space-y-8">
                  {/* Conversation Transcript */}
                  <div className="rounded-2xl border bg-ui-bg-base shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b bg-ui-bg-subtle/20 flex items-center gap-2">
                      <ChatBubbleLeftRight className="h-4 w-4 text-ui-fg-subtle" />
                      <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold">Conversation Transcript</Text>
                    </div>
                    <div className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar bg-ui-bg-subtle/5">
                      {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.sender_type === 'customer' ? 'items-start' : 'items-end'}`}>
                          <div className={`max-w-[80%] rounded-2xl p-4 text-sm ${
                            msg.sender_type === 'customer' 
                              ? 'bg-ui-bg-base border shadow-sm rounded-tl-none text-ui-fg-base' 
                              : msg.sender_type === 'system'
                                ? 'bg-ui-bg-subtle border-dashed border text-ui-fg-subtle text-xs italic'
                                : 'bg-ui-bg-interactive text-ui-fg-on-color rounded-tr-none'
                          }`}>
                            {msg.message}
                          </div>
                          <Text size="xsmall" className="text-ui-fg-subtle mt-1 px-1">
                            {formatLabel(msg.sender_type)} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Solution Workspace */}
                  <div className="rounded-2xl border bg-ui-bg-base shadow-xl overflow-hidden flex flex-col min-h-[400px]">
                    <div className="px-8 py-6 border-b bg-ui-bg-base/50 backdrop-blur-sm flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-ui-bg-interactive/10">
                          <Sparkles className="text-ui-fg-interactive h-6 w-6" />
                        </div>
                        <div>
                          <Heading level="h3">AI Suggested Response</Heading>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-ui-fg-success animate-pulse" />
                            <Text size="xsmall" className="text-ui-fg-subtle">Confidence: {Math.round((analysis.response_confidence || 0) * 100)}%</Text>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={generateSuggestion}
                          isLoading={generating}
                          className="h-10 px-4"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Regenerate
                        </Button>
                        {analysis.suggested_response && (
                          <Button
                            variant="primary"
                            size="small"
                            className="h-10 px-6"
                            onClick={() => {
                              navigator.clipboard.writeText(replyDraft || analysis.suggested_response || '')
                              toast.success('Ready to paste in ticket!')
                            }}
                          >
                            Copy Solution
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col bg-ui-bg-base p-8 gap-6">
                      <Textarea
                        className="flex-1 w-full p-6 text-base leading-relaxed bg-ui-bg-subtle/30 border-ui-border-base focus:border-ui-fg-interactive transition-all resize-none shadow-inner italic"
                        value={replyDraft || analysis.suggested_response || ''}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder="Waiting for AI generation..."
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Intelligence Stats */}
                  <div className="rounded-2xl border bg-ui-bg-base p-6 shadow-sm">
                    <Text size="xsmall" weight="plus" className="text-ui-fg-subtle mb-4 uppercase tracking-widest font-bold block">Classification</Text>
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Text size="small" className="text-ui-fg-subtle">Category</Text>
                          <Badge size="small" color="blue">{formatLabel(analysis.category || 'Unknown')}</Badge>
                        </div>
                        <div className="w-full bg-ui-bg-subtle h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-ui-fg-interactive" style={{ width: `${(analysis.category_confidence || 0) * 100}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Text size="small" className="text-ui-fg-subtle">Priority</Text>
                          <Badge size="small" color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}>
                            {formatLabel(analysis.suggested_priority || 'Normal')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-ui-bg-base p-6 shadow-sm">
                    <Text size="xsmall" weight="plus" className="text-ui-fg-subtle mb-4 uppercase tracking-widest font-bold block">Automation</Text>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Text size="small" className="text-ui-fg-subtle">Eligibility</Text>
                        {analysis.auto_reply_eligible ? (
                          <div className="flex items-center gap-1 text-ui-fg-success">
                            <CheckCircleSolid className="h-4 w-4" />
                            <Text size="xsmall" weight="plus">Eligible</Text>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-ui-fg-muted">
                            <XCircleSolid className="h-4 w-4" />
                            <Text size="xsmall">Manual</Text>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <Text size="small" className="text-ui-fg-subtle">Status</Text>
                        <Badge size="small" color={analysis.auto_replied ? 'green' : 'grey'}>
                          {analysis.auto_replied ? 'Processed' : 'Awaiting'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
                  {/* Mobile back button */}
                  <div className="lg:hidden flex justify-center pt-4">
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setMobileView('list')}
                      className="w-full"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back to Ticket List
                    </Button>
                  </div>
        </div>
      </div>
    </Container>
  )
}

export const config = defineRouteConfig({
  label: 'AI Support',
  icon: Sparkles,
})
