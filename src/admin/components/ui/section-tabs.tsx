import { Tabs } from '@medusajs/ui'
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
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * S13. Tabs instead of one long scroll (docs/admin-ux-rules.md).
 *
 * A page whose content falls into clear topics shows one tab per topic. Wrap the page body in
 * `SectionTabs`; every `TabSection` (or `SettingsSection`) inside it, at any depth, in
 * fragments, conditionals or child components, registers itself as a tab:
 *
 *   <SectionTabs>
 *     {alert}                                   // not a section: shown on every tab
 *     <TabSection id="pause" title="Pause shop">…cards…</TabSection>
 *     <TabSection id="access" title="Who can see the store">…</TabSection>
 *   </SectionTabs>
 *
 * - With fewer than two sections nothing changes: no tab bar, everything visible.
 * - Tabs follow the order of the sections on the page. The label is `tab` or the title.
 * - The URL hash selects the tab (`/store-health/status#access`), so existing #section links
 *   keep working and a tab can be linked to. Switching tabs replaces the hash (no history
 *   entry per click).
 * - Hidden tabs stay mounted: unsaved values survive a switch and one SaveBar covers all tabs.
 * - Content that is not in a section (page alerts, loading text, the SaveBar) shows on every
 *   tab, so put page-wide warnings outside the sections.
 * - Sections inside a `TabSection` do not register on their own, so a tab can hold several
 *   cards.
 */

type SectionEntry = { id: string; label: string; node: HTMLElement | null }

type TabsContextValue = {
  register: (entry: SectionEntry) => () => void
  active: string | null
}

const TabsContext = createContext<TabsContextValue | null>(null)

export const sectionSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Sections in the order they appear on the page. */
const byPosition = (a: SectionEntry, b: SectionEntry) => {
  if (!a.node || !b.node) return 0
  return a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

/** Provides the tabs to the sections below it and draws the tab bar where it sits. */
export function SectionTabs({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [sections, setSections] = useState<SectionEntry[]>([])

  const register = useCallback((entry: SectionEntry) => {
    setSections((current) =>
      [...current.filter((item) => item.id !== entry.id), entry].sort(byPosition),
    )
    return () => setSections((current) => current.filter((item) => item.id !== entry.id))
  }, [])

  const tabbed = sections.length >= 2
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''))
  const active = tabbed ? (sections.find((item) => item.id === hash)?.id ?? sections[0].id) : null
  const value = useMemo(() => ({ register, active }), [register, active])

  // A #section link makes the browser scroll to that section, past the tab bar. Bring the tab
  // bar back into view whenever the tab changes (no scroll when it is already visible).
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => bar.current?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [active])

  return (
    <TabsContext.Provider value={value}>
      {tabbed && active ? (
        <div ref={bar} className="scroll-mt-4">
          <Tabs
            value={active}
            onValueChange={(id) =>
              navigate({ hash: id, search: location.search }, { replace: true })
            }
          >
            <Tabs.List className="flex-wrap">
              {sections.map((item) => (
                <Tabs.Trigger key={item.id} value={item.id}>
                  {item.label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        </div>
      ) : null}
      {children}
    </TabsContext.Provider>
  )
}

/**
 * Registers one section with the surrounding SectionTabs (if any) and says whether it is
 * hidden. Used by TabSection and SettingsSection; returns the DOM id to put on the element.
 */
export function useTabSection(title: string, id?: string, tab?: string) {
  const tabs = useContext(TabsContext)
  const key = id ?? sectionSlug(title)
  const label = tab ?? title
  const ref = useRef<HTMLDivElement>(null)
  const register = tabs?.register
  useEffect(() => register?.({ id: key, label, node: ref.current }), [register, key, label])
  const hidden = Boolean(tabs?.active && tabs.active !== key)
  return { key, ref, hidden }
}

/**
 * One tab's content: any number of cards about one topic. Has no styling of its own (a
 * vertical stack with the page's gap).
 */
export function TabSection({
  title,
  id,
  tab,
  children,
}: {
  /** The topic; the tab label unless `tab` is given. */
  title: string
  /** Anchor and tab key (#id). Defaults to the title in kebab case. Keep it stable. */
  id?: string
  /** Short tab label when the title is long. */
  tab?: string
  children: ReactNode
}) {
  const { key, ref, hidden } = useTabSection(title, id, tab)
  return (
    <div ref={ref} id={key} hidden={hidden} className={hidden ? 'hidden' : 'flex flex-col gap-4'}>
      {/* Sections inside one tab belong to it and do not become tabs themselves. */}
      <TabsContext.Provider value={null}>{children}</TabsContext.Provider>
    </div>
  )
}
