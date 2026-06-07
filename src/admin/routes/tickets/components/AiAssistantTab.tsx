import { ChevronDown, ChatBubbleLeftRight, Sparkles, Spinner } from '@medusajs/icons'
import { Badge, Button, Heading, Text, Textarea, toast } from '@medusajs/ui'
import { useEffect, useRef, useState } from 'react'
import { generateSuggestion, type AIAnalysis } from '../lib/ai'
import { formatLabel } from '../lib/format'

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
  onRetryAnalysis: () => void
}

export const AiAssistantTab = ({
  ticketId,
  analysis,
  loadingAnalysis,
  messages,
  onOpenSettings,
  onApplySuggestion,
  onSuggestionGenerated,
  onRetryAnalysis,
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
      toast.success('AI suggestion regenerated')
    } catch (error) {
      if (cancelledRef.current) return
      console.error('[ai-assistant-tab] regenerate failed', error)
      toast.error('Failed to generate suggestion')
    } finally {
      if (!cancelledRef.current) setGenerating(false)
    }
  }

  const handleCopy = async () => {
    const text = draft || analysis?.suggested_response || ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Ready to paste in ticket!')
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

  if (loadingAnalysis) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <Spinner className="animate-spin h-12 w-12 text-ui-fg-interactive" />
            <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-ui-fg-interactive animate-pulse" />
          </div>
          <div className="text-center">
            <Text weight="plus" className="text-lg tracking-tight">
              AI is Thinking...
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              Processing ticket context and history
            </Text>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="max-w-md mx-auto h-full flex flex-col items-center justify-center text-center p-8 bg-ui-bg-base rounded-2xl border shadow-sm">
        <Sparkles className="h-12 w-12 text-ui-fg-error mb-4" />
        <Heading level="h3">No AI Analysis</Heading>
        <Text className="text-ui-fg-subtle mt-2">
          This ticket has not been analyzed yet. The AI engine may be disabled or the analysis
          pipeline is still warming up.
        </Text>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={onRetryAnalysis}>
            Try Again
          </Button>
          <Button variant="primary" onClick={onOpenSettings}>
            Configure AI
          </Button>
        </div>
      </div>
    )
  }

  const confidence = Math.round((analysis.response_confidence || 0) * 100)
  const suggested = draft || analysis.suggested_response || ''

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
      <div className="space-y-6">
        {messages.length > 0 && (
          <div className="rounded-2xl border bg-ui-bg-base shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTranscript((v) => !v)}
              aria-expanded={showTranscript}
              aria-controls={`transcript-${ticketId}`}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-ui-bg-subtle/30 focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive focus:ring-inset transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChatBubbleLeftRight className="h-4 w-4 text-ui-fg-subtle" />
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle uppercase tracking-widest font-bold">
                  Conversation Transcript
                </Text>
                <Badge size="2xsmall" color="grey">{messages.length}</Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-ui-fg-subtle transition-transform ${showTranscript ? 'rotate-180' : ''}`}
              />
            </button>
            {showTranscript && (
              <div
                id={`transcript-${ticketId}`}
                className="border-t bg-ui-bg-subtle/5 p-6 space-y-4 max-h-[320px] overflow-y-auto custom-scrollbar"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender_type === 'customer' ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl p-3 text-sm ${
                        msg.sender_type === 'customer'
                          ? 'bg-ui-bg-base border shadow-sm rounded-tl-none text-ui-fg-base'
                          : msg.sender_type === 'system'
                            ? 'bg-ui-bg-subtle border-dashed border text-ui-fg-subtle text-xs italic'
                            : 'bg-ui-bg-interactive text-ui-fg-on-color rounded-tr-none'
                      }`}
                    >
                      <Text size="small" className="whitespace-pre-wrap leading-relaxed">
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

        <div className="rounded-2xl border bg-ui-bg-base shadow-xl overflow-hidden flex flex-col min-h-[420px]">
          <div className="px-6 lg:px-8 py-5 border-b bg-ui-bg-base/50 backdrop-blur-sm flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-ui-bg-interactive/10">
                <Sparkles className="text-ui-fg-interactive h-6 w-6" />
              </div>
              <div>
                <Heading level="h3">AI Suggested Response</Heading>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-ui-fg-success animate-pulse" />
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
                <Sparkles className="h-4 w-4 mr-1.5" />
                Regenerate
              </Button>
              {suggested && (
                <>
                  <Button variant="secondary" size="small" onClick={handleCopy} className="h-9">
                    Copy Solution
                  </Button>
                  <Button
                    variant="primary"
                    size="small"
                    onClick={handleApply}
                    className="h-9"
                  >
                    Use in reply
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 bg-ui-bg-base p-6 lg:p-8">
            <Textarea
              className="w-full min-h-[260px] p-6 text-base leading-relaxed bg-ui-bg-subtle/30 border-ui-border-base focus:border-ui-fg-interactive transition-all resize-none shadow-inner italic"
              value={suggested}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="No suggestion yet — regenerate to ask the AI for a draft."
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border bg-ui-bg-base p-6 shadow-sm">
          <Text
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle mb-4 uppercase tracking-widest font-bold block"
          >
            Classification
          </Text>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Category
                </Text>
                <Badge size="small" color="blue">
                  {formatLabel(analysis.category || 'Unknown')}
                </Badge>
              </div>
              <div className="w-full bg-ui-bg-subtle h-1 rounded-full overflow-hidden">
                <div
                  className="h-full bg-ui-fg-interactive"
                  style={{ width: `${(analysis.category_confidence || 0) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Priority
              </Text>
              <Badge
                size="small"
                color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}
              >
                {formatLabel(analysis.suggested_priority || 'Normal')}
              </Badge>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-ui-bg-base p-6 shadow-sm">
          <Text
            size="xsmall"
            weight="plus"
            className="text-ui-fg-subtle mb-4 uppercase tracking-widest font-bold block"
          >
            Automation
          </Text>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Eligibility
              </Text>
              {analysis.auto_reply_eligible ? (
                <div className="flex items-center gap-1 text-ui-fg-success">
                  <span className="h-2 w-2 rounded-full bg-ui-fg-success" />
                  <Text size="xsmall" weight="plus">
                    Eligible
                  </Text>
                </div>
              ) : (
                <Text size="xsmall" className="text-ui-fg-muted">
                  Manual
                </Text>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Text size="small" className="text-ui-fg-subtle">
                Status
              </Text>
              <Badge size="small" color={analysis.auto_replied ? 'green' : 'grey'}>
                {analysis.auto_replied ? 'Processed' : 'Awaiting'}
              </Badge>
            </div>
          </div>
        </div>

        <Button variant="secondary" className="w-full" onClick={onOpenSettings}>
          Configure AI
        </Button>
      </div>
    </div>
  )
}
