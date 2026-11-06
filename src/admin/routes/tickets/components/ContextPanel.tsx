import { Badge, Button, Select, Text } from '@medusajs/ui'
import type { AIAnalysis } from '../lib/ai'
import { IntelligencePanel } from './IntelligencePanel'
import {
  STATUS_OPTIONS,
  customerLabel,
  statusName,
  userLabel,
  type AdminUser,
  type Ticket,
  type TicketsConfig,
} from '../lib/ticket-page'

const MAX_HISTORY = 5
const UNASSIGNED = '__unassigned__'

type ContextPanelProps = {
  selectedTicket: Ticket
  customerName: string | null
  customerEmail: string | null
  customerMissing: boolean
  customerTickets: Ticket[]
  adminUsers: AdminUser[]
  currentUserId: string | null
  saving: boolean
  updateTicket: (patch: { status?: string; assigned_to?: string | null }) => void
  analysis: AIAnalysis | null
  loadingAnalysis: boolean
  config: TicketsConfig | null
  activeTab: 'conversation' | 'notes' | 'events' | 'ai'
  onConfigureAi: () => void
  onAnalyzeNow: () => void
  analyzing: boolean
  onSelectTicket: (id: string) => void
  onMergeFromHistory: () => void
  onAfterSelect?: () => void
  statusColor: (status: string) => 'blue' | 'orange' | 'green' | 'red' | 'grey'
}

export const ContextPanel = ({
  selectedTicket,
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
  onConfigureAi,
  onAnalyzeNow,
  analyzing,
  onSelectTicket,
  onMergeFromHistory,
  onAfterSelect,
  statusColor,
}: ContextPanelProps) => {
  const otherTickets = customerTickets.filter((t) => t.id !== selectedTicket.id)
  const assignedId = selectedTicket.assigned_to ?? UNASSIGNED
  const assigneeKnown =
    assignedId === UNASSIGNED || adminUsers.some((user) => user.id === assignedId)

  const displayName = customerMissing
    ? 'Deleted customer'
    : (customerName ?? (selectedTicket.customer_id ? 'Loading…' : customerLabel(selectedTicket)))

  return (
    <>
      {activeTab !== 'ai' && (
        <IntelligencePanel
          analysis={analysis}
          loading={loadingAnalysis}
          config={config}
          onConfigure={onConfigureAi}
          onAnalyzeNow={onAnalyzeNow}
          analyzing={analyzing}
        />
      )}

      <div className={activeTab === 'ai' ? '' : 'border-t pt-8'}>
        <Text size="xsmall" weight="plus" className="text-ui-fg-subtle mb-4 block">
          Customer
        </Text>
        <div className="space-y-4">
          <div className="flex flex-col">
            <Text size="small" weight="plus" className="truncate">
              {displayName}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle truncate">
              {customerMissing
                ? 'This customer account was deleted.'
                : selectedTicket.customer_id
                  ? (customerEmail ?? '')
                  : `${customerEmail ?? 'No email'} · email contact, no account`}
            </Text>
          </div>

          <div>
            <Text size="xsmall" className="text-ui-fg-subtle mb-1">
              Status
            </Text>
            <Select
              value={selectedTicket.status === 'resolved' ? 'closed' : selectedTicket.status}
              onValueChange={(status) => updateTicket({ status })}
              disabled={saving}
            >
              <Select.Trigger aria-label="Ticket status">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {STATUS_OPTIONS.map((status) => (
                  <Select.Item key={status} value={status}>
                    {statusName(status)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Text size="xsmall" className="text-ui-fg-subtle mt-1">
              Changes right away. Sending a reply sets it to Waiting for customer.
            </Text>
          </div>

          <div>
            <Text size="xsmall" className="text-ui-fg-subtle mb-1">
              Assigned to
            </Text>
            <Select
              value={assignedId}
              onValueChange={(value) =>
                updateTicket({ assigned_to: value === UNASSIGNED ? null : value })
              }
              disabled={saving}
            >
              <Select.Trigger aria-label="Assigned admin">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={UNASSIGNED}>Nobody</Select.Item>
                {adminUsers.map((user) => (
                  <Select.Item key={user.id} value={user.id}>
                    {user.id === currentUserId ? `Me (${userLabel(user)})` : userLabel(user)}
                  </Select.Item>
                ))}
                {!assigneeKnown && (
                  <Select.Item value={assignedId}>Unknown admin ({assignedId})</Select.Item>
                )}
              </Select.Content>
            </Select>
          </div>
        </div>
      </div>

      {selectedTicket.customer_id && !customerMissing && (
        <div className="border-t pt-8">
          <div className="mb-4 flex items-center justify-between">
            <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
              Other tickets from this customer
            </Text>
            <Badge size="2xsmall">{otherTickets.length}</Badge>
          </div>
          {otherTickets.length === 0 ? (
            <Text size="xsmall" className="text-ui-fg-subtle">
              None.
            </Text>
          ) : (
            <div className="space-y-3">
              {otherTickets.slice(0, MAX_HISTORY).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectTicket(t.id)
                    onAfterSelect?.()
                  }}
                  className="bg-ui-bg-subtle/20 hover:bg-ui-bg-subtle group w-full rounded-xl border p-3 text-left transition-all"
                >
                  <Text size="xsmall" weight="plus" className="line-clamp-1">
                    {t.subject}
                  </Text>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge size="2xsmall" color={statusColor(t.status)}>
                      {statusName(t.status)}
                    </Badge>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {new Date(t.created_at).toLocaleDateString()}
                    </Text>
                  </div>
                </button>
              ))}
              <Button
                variant="secondary"
                size="small"
                className="w-full"
                onClick={onMergeFromHistory}
              >
                Merge one into this ticket…
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
