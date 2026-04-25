import { usePlanningStore } from '@/store/planningStore'

export function ImportErrorBanner() {
  const error = usePlanningStore((s) => s.importError)
  if (!error) return null
  return (
    <div className="bg-red-100 border-b border-red-300 text-red-800 px-4 py-2 text-sm flex items-center justify-between">
      <span><strong>Import failed:</strong> {error}</span>
      <button
        className="text-red-800 hover:text-red-900 ml-2 font-bold"
        onClick={() => usePlanningStore.setState({ importError: null })}
      >
        ×
      </button>
    </div>
  )
}
