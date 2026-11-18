import { Button, Text } from '@medusajs/ui'

/**
 * S6. Forms save through this sticky bar: "Unsaved changes · Discard · Save". It renders only
 * while there are unsaved edits; pair it with `useUnsavedGuard(dirty)`. Switches do not use
 * it: they save at once and show `<SavedAutomatically />`. Never mix both on one row.
 */
export function SaveBar({
  dirty,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = 'Save',
  message = 'Unsaved changes',
  disabled = false,
}: {
  dirty: boolean
  saving?: boolean
  onSave: () => unknown
  onDiscard: () => unknown
  saveLabel?: string
  message?: string
  /** For example while the form is invalid; say why next to the field. */
  disabled?: boolean
}) {
  if (!dirty) return null
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="bg-ui-bg-base border-ui-border-base shadow-elevation-card-rest sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
    >
      <Text size="small" weight="plus">
        {message}
      </Text>
      <div className="flex items-center gap-2">
        <Button size="small" variant="secondary" onClick={() => void onDiscard()} disabled={saving}>
          Discard
        </Button>
        <Button
          size="small"
          variant="primary"
          onClick={() => void onSave()}
          isLoading={saving}
          disabled={disabled}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}

/** The note next to switches and other controls that save on change. */
export function SavedAutomatically({ className = '' }: { className?: string }) {
  return (
    <Text size="xsmall" className={`text-ui-fg-muted ${className}`}>
      Saved automatically
    </Text>
  )
}
