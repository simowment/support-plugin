import { Badge, Input, Text } from '@medusajs/ui'
import type { AIAnalysis } from '../lib/ai'
import { formatLabel } from '../lib/format'
import { IntelligencePanel } from './IntelligencePanel'
import type { Ticket } from '../lib/ticket-page'

const MAX_HISTORY = 5

type ContextPanelProps = {
  selectedTicket: Ticket
  customerName: string | null
  customerEmail: string | null
  customerTickets: Ticket[]
  assignedToInput: string
  setAssignedToInput: (value: string) => void
  updateTicket: (patch: Partial<Ticket>) => void
  analysis: AIAnalysis | null
  loadingAnalysis: boolean
  activeTab: 'conversation' | 'notes' | 'events' | 'ai'
  onConfigureAi: () => void
  onSelectTicket: (id: string) => void
  onAfterSelect?: () => void
  statusColor: (status: string) => 'blue' | 'orange' | 'green' | 'red' | 'grey'
}

export const ContextPanel = ({
  selectedTicket,
  customerName,
  customerEmail,
  customerTickets,
  assignedToInput,
  setAssignedToInput,
  updateTicket,
  analysis,
  loadingAnalysis,
  activeTab,
  onConfigureAi,
  onSelectTicket,
  onAfterSelect,
  statusColor,
}: ContextPanelProps) => (
  <>
    {activeTab !== 'ai' && (
      <IntelligencePanel
        analysis={analysis}
        loading={loadingAnalysis}
        onConfigure={onConfigureAi}
      />
    )}

    <div className={activeTab === 'ai' ? '' : 'border-t pt-8'}>
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
              onBlur={() =>
                assignedToInput !== (selectedTicket.assigned_to ?? '') &&
                updateTicket({ assigned_to: assignedToInput.trim() || null })
              }
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
        {customerTickets
          .filter(t => t.id !== selectedTicket.id)
          .slice(0, MAX_HISTORY)
          .map(t => (
            <button
              key={t.id}
              onClick={() => {
                onSelectTicket(t.id)
                onAfterSelect?.()
              }}
              className="w-full text-left p-3 rounded-xl border bg-ui-bg-subtle/20 hover:bg-ui-bg-subtle transition-all group"
            >
              <Text size="xsmall" weight="plus" className="line-clamp-1 group-hover:text-ui-fg-base">{t.subject}</Text>
              <div className="flex items-center gap-2 mt-1 opacity-60">
                <Badge size="2xsmall" color={statusColor(t.status)}>{t.status}</Badge>
                <Text size="xsmall">{new Date(t.created_at).toLocaleDateString()}</Text>
              </div>
            </button>
          ))}
      </div>
    </div>
  </>
)
