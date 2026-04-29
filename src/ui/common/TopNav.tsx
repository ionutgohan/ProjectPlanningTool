import clsx from 'clsx'
import { useRef } from 'react'
import { StandaloneExportUnavailableError } from '@/domain/standaloneExport'
import { usePlanningStore } from '@/store/planningStore'
import {
  clearLastHandle,
  isFileSystemAccessSupported,
  loadLastHandle,
  readFromHandle,
  saveLastHandle,
  writeToHandle,
} from '@/store/lastProjectHandle'
import { Button } from './Button'

export function TopNav() {
  const view = usePlanningStore((s) => s.view)
  const setView = usePlanningStore((s) => s.setView)
  const projectName = usePlanningStore((s) => s.project.name)
  const setProjectName = usePlanningStore((s) => s.setProjectName)
  const exportJSON = usePlanningStore((s) => s.exportJSON)
  const exportStandaloneHTML = usePlanningStore((s) => s.exportStandaloneHTML)
  const importJSON = usePlanningStore((s) => s.importJSON)
  const resetProject = usePlanningStore((s) => s.resetProject)
  const resumeFileName = usePlanningStore((s) => s.resumeFileName)
  const setResumeFileName = usePlanningStore((s) => s.setResumeFileName)
  const currentFileHandle = usePlanningStore((s) => s.currentFileHandle)
  const setCurrentFileHandle = usePlanningStore((s) => s.setCurrentFileHandle)

  const fileRef = useRef<HTMLInputElement>(null)

  const triggerDownload = (text: string, mime: string, extension: string) => {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName.replace(/[^a-z0-9-_]+/gi, '_') || 'project'}.${extension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => triggerDownload(exportJSON(), 'application/json', 'json')
  const handleExportHTML = () => {
    try {
      triggerDownload(exportStandaloneHTML(), 'text/html', 'html')
    } catch (err) {
      if (err instanceof StandaloneExportUnavailableError) {
        window.alert(err.message)
        return
      }
      throw err
    }
  }

  const handleImportClick = async () => {
    // Use the File System Access API so we can remember the file for next launch.
    // Fall back to a classic <input type="file"> on browsers that don't support it.
    if (isFileSystemAccessSupported() && window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Planning project', accept: { 'application/json': ['.json'] } }],
          excludeAcceptAllOption: false,
          multiple: false,
        })
        if (!handle) return
        const file = await handle.getFile()
        const text = await file.text()
        const ok = importJSON(text)
        if (ok) {
          await saveLastHandle(handle)
          setResumeFileName(null)
          setCurrentFileHandle(handle)
        }
      } catch (err) {
        // AbortError = user cancelled the picker; any other error is best-effort logged.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Import failed', err)
        }
      }
      return
    }
    fileRef.current?.click()
  }

  const handleResume = async () => {
    const stored = await loadLastHandle()
    if (!stored) {
      setResumeFileName(null)
      return
    }
    const text = await readFromHandle(stored.handle, 'request')
    if (text === null) {
      // Permission denied or file missing — readFromHandle already clears on NotFound.
      setResumeFileName(null)
      await clearLastHandle()
      return
    }
    const ok = importJSON(text)
    if (ok) {
      setResumeFileName(null)
      setCurrentFileHandle(stored.handle)
    }
  }

  const handleNew = async () => {
    const confirmed = window.confirm(
      'Start a new blank project? Any unsaved changes to the current project will be lost.',
    )
    if (!confirmed) return
    resetProject()
    setCurrentFileHandle(null)
    setResumeFileName(null)
    await clearLastHandle()
  }

  const handleSave = async () => {
    if (!currentFileHandle) return
    const ok = await writeToHandle(currentFileHandle, exportJSON())
    if (!ok) {
      // Permission refused or file gone — drop the handle so the button hides
      // and the user falls back to Export/Import.
      setCurrentFileHandle(null)
    }
  }

  const tab = (id: 'planning' | 'resources' | 'holidays', label: string) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className={clsx(
        'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
        view === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="border-b bg-white flex items-center px-4 h-14 gap-4">
      <div className="font-semibold text-gray-800">PlanningTool</div>
      <div className="flex">
        {tab('planning', 'Planning')}
        {tab('resources', 'Resources')}
        {tab('holidays', 'Holidays')}
      </div>
      <input
        className="border border-transparent hover:border-gray-300 rounded px-2 py-1 text-sm font-medium flex-1 max-w-md"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Project name"
      />
      <div className="flex items-center gap-2 ml-auto">
        {resumeFileName && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResume}
            title="Your browser needs a click to re-grant access to the remembered file."
          >
            Reopen {resumeFileName}
          </Button>
        )}
        {currentFileHandle && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            title={`Save changes to the file you opened (no prompt).`}
          >
            Save
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={handleNew} title="Start a blank new project">New project</Button>
        <Button variant="secondary" size="sm" onClick={handleImportClick}>Import project</Button>
        <Button variant="secondary" size="sm" onClick={handleExportHTML} title="Single self-contained HTML — full editable tool with this plan baked in">Export HTML</Button>
        <Button variant="primary" size="sm" onClick={handleExportJSON}>Export project</Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) {
              const text = await file.text()
              importJSON(text)
            }
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
