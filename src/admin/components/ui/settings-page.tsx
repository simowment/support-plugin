import { Badge, Container, Heading, Text } from '@medusajs/ui'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { InstallerCode, InstallerHint } from './installer-hint'
import { PageHeader } from './page-header'

/**
 * S12. The settings page every plugin has (docs/admin-ux-rules.md, "Settings pages").
 *
 * One page per plugin, reached three ways: the "Settings" sub-item under the plugin's sidebar
 * entry, the "Settings" link in the header of the plugin's main page (SettingsLink), and the
 * Settings > Apps index. Every option the plugin reads is on it, grouped in sections:
 *
 *   - editable here (stored by the plugin, used at once): a control and the SaveBar, or a
 *     switch that saves on change (SavedAutomatically);
 *   - set on the host (secrets, addresses, infrastructure): the current state in plain words
 *     ("Set", "Not set", the non-secret value) and, under Technical details, the variable
 *     name and the exact command that changes it. Never a secret value.
 *
 * Each row says where its current value comes from (SettingSource), so the owner never
 * wonders why a change "does not take".
 */

export type SettingSourceKind = 'admin' | 'host' | 'default'

const SOURCE_TEXT: Record<SettingSourceKind, { label: string; color: 'blue' | 'grey' | 'orange' }> = {
  admin: { label: 'Set here', color: 'blue' },
  host: { label: 'Set on the host', color: 'orange' },
  default: { label: 'Default', color: 'grey' },
}

/** Where a setting's current value comes from. */
export function SettingSource({ source }: { source: SettingSourceKind }) {
  const text = SOURCE_TEXT[source]
  return (
    <Badge size="2xsmall" color={text.color} className="flex-shrink-0">
      {text.label}
    </Badge>
  )
}

/** The whole page: header with a back link to the plugin, then the sections. */
export function SettingsPage({
  title,
  subtitle,
  back,
  children,
}: {
  /** "Support inbox settings". */
  title: string
  /** One sentence: what these settings change. */
  subtitle?: ReactNode
  /** The plugin's main page: { to: '/tickets', label: 'Support inbox' }. */
  back?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} subtitle={subtitle} back={back} />
      {children}
    </div>
  )
}

/** One group of settings in a card: a heading, one line on what it is for, the rows. */
export function SettingsSection({
  title,
  description,
  children,
  id,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  /** Anchor, so other pages can link straight to a section (/tickets/settings#ai). */
  id?: string
}) {
  return (
    <Container className="divide-y p-0" id={id}>
      <div className="px-6 py-4">
        <Heading level="h2">{title}</Heading>
        {description ? (
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {description}
          </Text>
        ) : null}
      </div>
      {children}
    </Container>
  )
}

/**
 * One setting: label and help on the left, the control (or the current state) on the right,
 * stacked on narrow screens. `technical` goes under a Technical details disclosure.
 */
export function SettingRow({
  label,
  help,
  source,
  control,
  technical,
  htmlFor,
}: {
  label: string
  help?: ReactNode
  source?: SettingSourceKind
  control: ReactNode
  technical?: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="small" weight="plus" asChild={Boolean(htmlFor)}>
            {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
          </Text>
          {source ? <SettingSource source={source} /> : null}
        </div>
        {help ? (
          <Text size="small" className="text-ui-fg-subtle mt-1">
            {help}
          </Text>
        ) : null}
        {technical ? <InstallerHint className="mt-2">{technical}</InstallerHint> : null}
      </div>
      <div className="min-w-0 md:pt-0.5">{control}</div>
    </div>
  )
}

/**
 * A setting that only the host can change (a secret, an address, infrastructure). Shows the
 * state in plain words and, under Technical details, the variable and the command.
 */
export function HostSettingRow({
  label,
  help,
  state,
  ok,
  variable,
  command,
}: {
  label: string
  help?: ReactNode
  /** "Set", "Not set", or the non-secret value. Never a secret. */
  state: ReactNode
  /** true: shown as fine; false: needs a look; undefined: neutral (optional, off). */
  ok?: boolean
  /** Environment variable or plugin option name(s). */
  variable: string
  /** The exact command that changes it on the host. */
  command?: string
}) {
  return (
    <SettingRow
      label={label}
      help={help}
      source="host"
      control={
        <Text
          size="small"
          className={ok === false ? 'text-ui-fg-error' : ok ? 'text-ui-fg-base' : 'text-ui-fg-subtle'}
        >
          {state}
        </Text>
      }
      technical={
        <div className="flex flex-col gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Variable: <code className="font-mono">{variable}</code>
          </Text>
          {command ? (
            <>
              <Text size="xsmall" className="text-ui-fg-subtle">
                Change it on the host:
              </Text>
              <InstallerCode>{command}</InstallerCode>
            </>
          ) : null}
        </div>
      }
    />
  )
}

/** The "Settings" text link for the header of a plugin's main page (PageHeader `links`). */
export function SettingsLink({ to, label = 'Settings' }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
    >
      {label}
    </Link>
  )
}
