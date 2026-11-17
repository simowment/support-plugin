import { usePrompt } from '@medusajs/ui'
import { useCallback, useEffect, useRef } from 'react'
import { useBlocker, useNavigate, type NavigateOptions } from 'react-router-dom'

/**
 * S6. Warns before losing unsaved edits: the browser's beforeunload dialog for tab
 * close/reload, and a confirmation prompt for any in-app navigation (sidebar
 * links, browser Back/Forward, the editor's own Back button).
 *
 * `includeSearch`: also guard query-string changes (such as ?section=).
 *
 * Copied from medusa-plugin-cms/src/admin/lib/use-unsaved-guard.ts. Pair it with SaveBar.
 */
export function useUnsavedGuard(dirty: boolean, includeSearch = false) {
  const prompt = usePrompt()
  const navigate = useNavigate()
  // Set for one navigation the editor triggers itself after a save or delete.
  const skipNext = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string; search: string }
        nextLocation: { pathname: string; search: string }
      }) => {
        if (skipNext.current) {
          skipNext.current = false
          return false
        }
        return (
          dirty &&
          (currentLocation.pathname !== nextLocation.pathname ||
            (includeSearch && currentLocation.search !== nextLocation.search))
        )
      },
      [dirty, includeSearch],
    ),
  )
  const blockerRef = useRef(blocker)
  blockerRef.current = blocker

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void prompt({
      title: 'Discard unsaved changes?',
      description: 'Your changes have not been saved and will be lost.',
      confirmText: 'Discard',
      cancelText: 'Keep editing',
      variant: 'danger',
    }).then((confirmed) => {
      const current = blockerRef.current
      if (current.state !== 'blocked') return
      if (confirmed) current.proceed()
      else current.reset()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state])

  /** Navigate with the guard applied (prompts when there are unsaved edits). */
  const leaveTo = useCallback((to: string) => navigate(to), [navigate])

  /** Navigate without prompting, e.g. after the edits were saved or the record deleted. */
  const leaveWithoutPrompt = useCallback(
    (to: string, options?: NavigateOptions) => {
      skipNext.current = true
      navigate(to, options)
    },
    [navigate],
  )

  return { leaveTo, leaveWithoutPrompt }
}
