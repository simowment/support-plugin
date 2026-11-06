import { ChevronDown, ChatBubbleLeftRight, Sparkles, Spinner } from '@medusajs/icons'
import { Badge, Button, Heading, Text, Textarea, toast } from '@medusajs/ui'
import { useEffect, useRef, useState } from 'react'
import { generateSuggestion, type AIAnalysis } from '../lib/ai'
import { formatLabel } from '../lib/format'
import type { TicketsConfig } from '../lib/ticket-page'
import { aiUnavailableReason } from './IntelligencePanel'

type Message = {
  id: string
  sender_type: string
  message: string
  created_at: string
}

type Props = {
  ticketId: string
  analysis: AIAnalysis | null
  loadingAnalysis: boolean
  messages: Message[]
  onOpenSettings: () => void
  onApplySuggestion: (text: string) => void
  onSuggestionGenerated: (suggested: string, confidence: number) => void
  config: TicketsConfig | null
  onAnalyzeNow: () => void
  analyzing: boolean
}

export const AiAssistantTab = ({
  ticketId,
  analysis,
  loadingAnalysis,
  messages,
  onOpenSettings,
  onApplySuggestion,
  onSuggestionGenerated,
  config,
  onAnalyzeNow,
  analyzing,
}: Props) => {
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    setDraft('')
    cancelledRef.current = false
  }, [ticketId])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const handleRegenerate = async () => {
    cancelledRef.current = false
    setGenerating(true)
    try {
      const result = await generateSuggestion(ticketId)
      if (cancelledRef.current) return
      setDraft(result.suggested_response)
      onSuggestionGenerated(result.suggested_response, result.confidence)
      toast.success('New suggestion ready')
    } catch (error) {
      if (cancelledRef.current) return
      console.error('[ai-assistant-tab] regenerate failed', error)
      toast.error('Could not get a suggestion', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      if (!cancelledRef.current) setGenerating(false)
    }
  }

  const handleCopy = async () => {
    const text = draft || analysis?.suggested_response || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch (error) {
      console.error('[ai-assistant-tab] clipboard write failed', error)
      toast.error('Copy failed')
    }
  }

  const handleApply = () => {
    const text = draft || analysis?.suggested_response || ''
    if (!text) return
    onApplySuggestion(text)
    toast.success('Loaded into reply box')
  }

  if (loadingAnalysis && !analysis) {
    return (
      <div className="flex h-full items-center justify-center gap-2">
        <Spinner className="h-4 w-4 animate-spin" />
        <Text size="small" className="text-ui-fg-subtle">
          Loading the AI analysis…
        </Text>
      </div>
    )
  }

  if (!analysis) {
    const unavailable = aiUnavailableReason(config)
    return (
      <div className="bg-ui-bg-base mx-auto flex h-full max-w-md flex-col items-center justify-center rounded-2xl border p-8 text-center shadow-sm">
        <Sparkles className="text-ui-fg-subtle mb-4 h-10 w-10" />
        <Heading level="h3">
          {unavailable ? 'AI suggestions unavailable' : 'Not analyzed yet'}
        </Heading>
        <Text className="text-ui-fg-subtle mt-2">
          {unavailable ??
            'The AI reads the first customer message and suggests a category, a priority and a reply. Tickets are analyzed when they arrive; older tickets can be analyzed now.'}
        </Text>
        <div className="mt-6 flex gap-3">
          {!unavailable && (
            <Button variant="primary" onClick={onAnalyzeNow} isLoading={analyzing}>
              Analyze now
            </Button>
          )}
          <Button variant="secondary" onClick={onOpenSettings}>
            AI settings
          </Button>
        </div>
      </div>
    )
  }

  const confidence = Math.round((analysis.response_confidence || 0) * 100)
  const suggested = draft || analysis.suggested_response || ''

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px] lg:gap-8">
      <div className="space-y-6">
        {messages.length > 0 && (
          <div className="bg-ui-bg-base overflow-hidden rounded-2xl border shadow-sm">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-expanded={showTranscript}
              aria-controls={`transcript-${ticketId}`}
              className="hover:bg-ui-bg-subtle/30 focus:ring-ui-fg-interactive flex w-full items-center justify-between px-6 py-4 transition-colors focus:ring-2 focus:outline-none focus:ring-inset"
            >
              <div className="flex items-center gap-2">
                <ChatBubbleLeftRight className="text-ui-fg-subtle h-4 w-4" />
                <Text
                  size="xsmall"
                  weight="plus"
                  className="text-ui-fg-subtle font-bold tracking-widest uppercase"
                >
                  Conversation Transcript
                </Text>
                <Badge size="2xsmall" color="grey">
                  {messages.length}
                </Badge>
              </div>
              <ChevronDown
                className={`text-ui-fg-subtle h-4 w-4 transition-transform ${showTranscript ? 'rotate-180' : ''}`}
              />
            </button>
            {showTranscript && (
              <div
                id={`transcript-${ticketId}`}
                className="bg-ui-bg-subtle/5 custom-scrollbar max-h-[320px] space-y-4 overflow-y-auto border-t p-6"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender_type === 'customer' ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-sm ${
                        msg.sender_type === 'customer'
                          ? 'bg-ui-bg-base text-ui-fg-base rounded-tl-none border shadow-sm'
                          : msg.sender_type === 'system'
                            ? 'bg-ui-bg-subtle text-ui-fg-subtle border border-dashed text-xs italic'
                            : 'bg-ui-bg-interactive text-ui-fg-on-color rounded-tr-none'
                      }`}
                    >
                      <Text size="small" className="leading-relaxed whitespace-pre-wrap">
                        {msg.message}
                      </Text>
                    </div>
                    <Text size="xsmall" className="text-ui-fg-subtle mt-1 px-1">
                      {formatLabel(msg.sender_type)} •{' '}
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-ui-bg-base flex min-h-[420px] flex-col overflow-hidden rounded-2xl border shadow-xl">
          <div className="bg-ui-bg-base/50 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5 backdrop-blur-sm lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="bg-ui-bg-interactive/10 rounded-lg p-2">
                <Sparkles className="text-ui-fg-interactive h-6 w-6" />
              </div>
              <div>
                <Heading level="h3">Suggested reply</Heading>
                <div className="flex items-center gap-2">
                  <div className="bg-ui-fg-success h-2 w-2 animate-pulse rounded-full" />
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Confidence: {confidence}%
                  </Text>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="small"
                onClick={handleRegenerate}
                isLoading={generating}
                className="h-9"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                New suggestion
              </Button>
              {suggested && (
                <>
                  <Button variant="secondary" size="small" onClick={handleCopy} className="h-9">
                    Copy
                  </Button>
                  <Button variant="primary" size="small" onClick={handleApply} className="h-9">
                    Use in reply
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="bg-ui-bg-base flex-1 p-6 lg:p-8">
            <Textarea
              className="bg-ui-bg-subtle/30 border-ui-border-base focus:border-ui-fg-interactive min-h-[260px] w-full resize-none p-6 text-base leading-relaxed italic shadow-inner transition-all"
              value={suggested}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="No suggestion yet — regenerate to ask the AI for a draft."
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-ui-bg-base rounded-2xl border p-6 shadow-sm">
          <Text
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle mb-4 block font-bold tracking-widest uppercase"
          >
            AI classification
          </Text>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Text size="small" className="text-ui-fg-subtle">
                  Category
                </Text>
                <Badge size="small" color="blue">
                  {formatLabel(analysis.category || 'Unknown')}
                </Badge>
              </div>
              <div className="bg-ui-bg-subtle h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-ui-fg-interactive h-full"
                  style={{ width: `${(analysis.category_confidence || 0) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Priority
              </Text>
              <Badge size="small" color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}>
                {formatLabel(analysis.suggested_priority || 'Normal')}
              </Badge>
            </div>
          </div>
        </div>

        <div className="bg-ui-bg-base rounded-2xl border p-6 shadow-sm">
          <Text
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle mb-4 block font-bold tracking-widest uppercase"
          >
            Auto-reply
          </Text>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Allowed for this ticket
              </Text>
              <Text size="xsmall" weight="plus">
                {analysis.auto_reply_eligible ? 'Yes' : 'No, needs a human'}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Sent automatically
              </Text>
              <Badge size="small" color={analysis.auto_replied ? 'green' : 'grey'}>
                {analysis.auto_replied ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>
        </div>

        <Button variant="secondary" className="w-full" onClick={onOpenSettings}>
          AI settings
        </Button>
      </div>
    </div>
  )
}
