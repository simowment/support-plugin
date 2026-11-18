import { CogSixTooth } from '@medusajs/icons'
import { Badge, Button, Container, Heading, Tabs, Text } from '@medusajs/ui'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
 *
 * With two or more sections the page shows one tab per section instead of one long scroll.
 * Each SettingsSection registers itself with the page (so sections inside fragments,
 * conditionals or child components count too); the tab is the section's `tab` label or title,
 * and the URL hash (#id) selects it, so /tickets/settings#ai opens the AI tab. Hidden tabs
 * stay mounted, so unsaved values survive a tab switch and the SaveBar covers every tab.
 * Anything that is not a section (alerts, loading text, the SaveBar) shows on every tab.
 */

type SectionEntry = { id: string; label: string; node: HTMLElement | null }

type TabsContext = {
  register: (entry: SectionEntry) => () => void
  active: string | null
}

const SettingsTabsContext = createContext<TabsContext | null>(null)

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Sections in the order they appear on the page. */
const byPosition = (a: SectionEntry, b: SectionEntry) => {
  if (!a.node || !b.node) return 0
  return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

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
  const location = useLocation()
  const navigate = useNavigate()
  const [sections, setSections] = useState<SectionEntry[]>([])

  const register = useCallback((entry: SectionEntry) => {
    setSections((current) => [...current.filter((item) => item.id !== entry.id), entry].sort(byPosition))
    return () => setSections((current) => current.filter((item) => item.id !== entry.id))
  }, [])

  const tabbed = sections.length >= 2
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''))
  const active = tabbed ? (sections.find((item) => item.id === hash)?.id ?? sections[0].id) : null
  const context = useMemo(() => ({ register, active }), [register, active])

  // A #section link makes the browser scroll to that section, past the tab bar. Keep the
  // header and tabs in view whenever the tab changes.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [active])

  return (
    <SettingsTabsContext.Provider value={context}>
      <div ref={top} className="flex flex-col gap-4">
        <PageHeader title={title} subtitle={subtitle} back={back} />
        {tabbed && active ? (
          <Tabs
            value={active}
            onValueChange={(id) => navigate({ hash: id, search: location.search }, { replace: true })}
          >
            <Tabs.List className="flex-wrap">
              {sections.map((item) => (
                <Tabs.Trigger key={item.id} value={item.id}>
                  {item.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        ) : null}
        {children}
      </div>
    </SettingsTabsContext.Provider>
  )
}

/** One group of settings in a card: a heading, one line on what it is for, the rows. */
export function SettingsSection({
  title,
  description,
  children,
  id,
  tab,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  /** Anchor and tab key, so other pages can link straight to a section (/tickets/settings#ai).
   * Defaults to the title in kebab case. */
  id?: string
  /** Short tab label when the title is long ("AI" for "AI reply suggestions"). */
  tab?: string
}) {
  const tabs = useContext(SettingsTabsContext)
  const key = id ?? slug(title)
  const ref = useRef<HTMLDivElement>(null)
  const label = tab ?? title
  useEffect(() => tabs?.register({ id: key, label, node: ref.current }), [tabs?.register, key, label])
  const hidden = Boolean(tabs?.active && tabs.active !== key)
  return (
    <Container ref={ref} className={hidden ? 'hidden' : 'divide-y p-0'} id={key} hidden={hidden}>
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

/**
 * The direct way from an app to its settings: a "Settings" button with the gear icon, in the
 * header of the app's main page (PageHeader `links`, or next to the existing header actions).
 * Every app has one, so its settings are always one click away (S12).
 */
export function SettingsLink({ to, label = 'Settings' }: { to: string; label?: string }) {
  return (
    <Button size="small" variant="secondary" asChild>
      <Link to={to} className="gap-x-1.5">
        <CogSixTooth />
        {label}
      </Link>
    </Button>
  )
}
