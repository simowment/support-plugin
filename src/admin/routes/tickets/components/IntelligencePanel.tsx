import { Badge, Text } from '@medusajs/ui'
import { CheckCircleSolid, Spinner, XCircleSolid } from '@medusajs/icons'
import type { AIAnalysis } from '../lib/ai'
import { formatLabel } from '../lib/format'

type Props = {
  analysis: AIAnalysis | null
  loading: boolean
  onConfigure?: () => void
}

export const IntelligencePanel = ({ analysis, loading, onConfigure }: Props) => {
  return (
    <div className="space-y-6">
      <div>
        <Text
          size="xsmall"
          weight="plus"
          className="text-ui-fg-subtle uppercase tracking-widest font-bold mb-4 block"
        >
          Intelligence
        </Text>
        {loading ? (
          <div className="flex items-center gap-2">
            <Spinner className="animate-spin h-3 w-3" />
            <Text size="xsmall">Analyzing...</Text>
          </div>
        ) : analysis ? (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl border bg-ui-bg-subtle/30 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Category
                  </Text>
                  <Badge size="small" color="blue">
                    {formatLabel(analysis.category || 'Unknown')}
                  </Badge>
                </div>
                <div className="w-full bg-ui-bg-subtle h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ui-fg-interactive transition-all duration-1000"
                    style={{ width: `${(analysis.category_confidence || 0) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Text size="xsmall" className="text-ui-fg-subtle">
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
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between ${
                analysis.auto_reply_eligible
                  ? 'bg-green-50/30 border-green-100'
                  : 'bg-ui-bg-subtle/10 border-ui-border-base'
              }`}
            >
              <Text size="xsmall" className="text-ui-fg-subtle">
                Automation
              </Text>
              {analysis.auto_reply_eligible ? (
                <div className="flex items-center gap-1.5 text-ui-fg-success">
                  <CheckCircleSolid className="h-4 w-4" />
                  <Text size="xsmall" weight="plus">
                    Eligible
                  </Text>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-ui-fg-muted">
                  <XCircleSolid className="h-4 w-4" />
                  <Text size="xsmall">Manual Only</Text>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Text size="xsmall" className="text-ui-fg-subtle italic">
            No AI insights available for this ticket.
          </Text>
        )}
      </div>

      {onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="w-full text-left text-ui-fg-subtle hover:text-ui-fg-base transition-colors text-xs underline underline-offset-4"
        >
          Configure AI assistant
        </button>
      )}
    </div>
  )
}
