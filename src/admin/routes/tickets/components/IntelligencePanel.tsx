import { Badge, Button, Text } from '@medusajs/ui'
import { Spinner } from '@medusajs/icons'
import type { AIAnalysis } from '../lib/ai'
import { formatLabel } from '../lib/format'
import type { TicketsConfig } from '../lib/ticket-page'

type Props = {
  analysis: AIAnalysis | null
  loading: boolean
  config: TicketsConfig | null
  onConfigure?: () => void
  onAnalyzeNow?: () => void
  analyzing?: boolean
}

/** Why there is no analysis, in plain words; null when "Analyze now" can help. */
export function aiUnavailableReason(config: TicketsConfig | null): string | null {
  if (!config) return null
  if (!config.ai.configured)
    return 'AI is not set up for this shop: no AI provider key is configured.'
  if (!config.ai.enabled) return 'AI suggestions are turned off in AI settings.'
  return null
}

export const IntelligencePanel = ({
  analysis,
  loading,
  config,
  onConfigure,
  onAnalyzeNow,
  analyzing,
}: Props) => {
  const unavailable = aiUnavailableReason(config)

  return (
    <div className="space-y-4">
      <Text size="xsmall" weight="plus" className="text-ui-fg-subtle block">
        AI suggestions
      </Text>
      {loading && !analysis ? (
        <div className="flex items-center gap-2">
          <Spinner className="h-3 w-3 animate-spin" />
          <Text size="xsmall">Loading…</Text>
        </div>
      ) : analysis ? (
        <div className="bg-ui-bg-subtle/30 space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Category
            </Text>
            <Badge size="small" color="blue">
              {formatLabel(analysis.category || 'unknown')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Priority
            </Text>
            <Badge size="small" color={analysis.suggested_priority === 'high' ? 'red' : 'orange'}>
              {formatLabel(analysis.suggested_priority || 'normal')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <Text size="xsmall" className="text-ui-fg-subtle">
              Auto-reply
            </Text>
            <Text size="xsmall">
              {analysis.auto_replied
                ? 'Sent automatically'
                : analysis.auto_reply_eligible
                  ? 'Allowed'
                  : 'Needs a human'}
            </Text>
          </div>
        </div>
      ) : unavailable ? (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {unavailable}
        </Text>
      ) : (
        <div className="space-y-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            This ticket has not been analyzed yet.
          </Text>
          {onAnalyzeNow && (
            <Button size="small" variant="secondary" onClick={onAnalyzeNow} isLoading={analyzing}>
              Analyze now
            </Button>
          )}
        </div>
      )}

      {onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="text-ui-fg-subtle hover:text-ui-fg-base w-full text-left text-xs underline underline-offset-4 transition-colors"
        >
          AI settings
        </button>
      )}
    </div>
  )
}
