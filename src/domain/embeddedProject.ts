import { importProject } from './serialization'
import { EMBEDDED_PROJECT_SCRIPT_ID } from './standaloneExport'
import type { Project } from './types'

/**
 * Reads the project baked into the page by `buildStandaloneHTML`, if any.
 * Returns `null` when the tag is missing or its contents fail validation.
 */
export function readEmbeddedProject(doc: Document = document): Project | null {
  const script = doc.getElementById(EMBEDDED_PROJECT_SCRIPT_ID)
  if (!script) return null

  const text = script.textContent ?? ''
  if (text.trim() === '') return null

  // The `<\/` escape in the embedded payload (added by buildStandaloneHTML to
  // avoid prematurely closing the script tag) is valid JSON — `\/` decodes to
  // `/` — so importProject handles it without any manual unescape.
  const result = importProject(text)
  if (!result.ok) {
    console.warn(`Embedded project failed validation: ${result.error}`)
    return null
  }
  return result.project
}
