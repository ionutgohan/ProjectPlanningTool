import { useEffect } from 'react'
import { usePlanningStore } from '@/store/planningStore'
import { clearLastHandle, loadLastHandle, readFromHandle } from '@/store/lastProjectHandle'
import { ImportErrorBanner } from '@/ui/common/ImportErrorBanner'
import { TopNav } from '@/ui/common/TopNav'
import { HolidaysView } from '@/ui/holidays/HolidaysView'
import { PlanningView } from '@/ui/planning/PlanningView'
import { ResourcesView } from '@/ui/resources/ResourcesView'

export default function App() {
  const view = usePlanningStore((s) => s.view)
  const importJSON = usePlanningStore((s) => s.importJSON)
  const setResumeFileName = usePlanningStore((s) => s.setResumeFileName)
  const setCurrentFileHandle = usePlanningStore((s) => s.setCurrentFileHandle)

  // On first mount, try to auto-restore the last opened project.
  // - Permission already granted → import silently and wire the handle so Save works.
  // - Permission lapsed → remember the filename so TopNav can offer a Reopen button.
  // - File missing/renamed → clear the stored handle, stay on the blank project.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await loadLastHandle()
      if (cancelled || !stored) return
      const text = await readFromHandle(stored.handle, 'query')
      if (cancelled) return
      if (text !== null) {
        const ok = importJSON(text)
        if (!ok) {
          // Saved handle still resolves, but contents no longer parse — forget it.
          await clearLastHandle()
          setResumeFileName(null)
        } else {
          setResumeFileName(null)
          setCurrentFileHandle(stored.handle)
        }
      } else {
        // Permission needed: surface a one-click Reopen affordance.
        setResumeFileName(stored.name)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [importJSON, setResumeFileName, setCurrentFileHandle])

  return (
    <div className="h-screen flex flex-col">
      <TopNav />
      <ImportErrorBanner />
      {view === 'planning' ? <PlanningView /> : view === 'resources' ? <ResourcesView /> : <HolidaysView />}
    </div>
  )
}
