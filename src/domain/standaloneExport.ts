import { exportProject } from './serialization'
import type { Project } from './types'

export const EMBEDDED_PROJECT_SCRIPT_ID = 'embedded-project'

export interface BuildStandaloneOptions {
  /** Override the source document (used by tests). Defaults to `document`. */
  sourceDocument?: Document
}

export class StandaloneExportUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StandaloneExportUnavailableError'
  }
}

/**
 * Self-clones the running app into a single HTML string with `project` baked
 * into a `<script type="application/json" id="embedded-project">` tag. On
 * load, the cloned page reads that tag and boots with the embedded plan.
 *
 * Throws if the source document references external scripts (i.e. dev mode):
 * the resulting file would reference dev URLs that don't resolve outside of
 * `npm run dev`. The production build inlines every chunk, so this guard only
 * fires in development.
 */
export function buildStandaloneHTML(project: Project, options: BuildStandaloneOptions = {}): string {
  const sourceDoc = options.sourceDocument ?? document
  assertAllScriptsInlined(sourceDoc)

  const clone = sourceDoc.cloneNode(true) as Document
  resetRoot(clone)
  upsertEmbeddedProject(clone, project)

  const doctype = '<!doctype html>\n'
  return doctype + clone.documentElement.outerHTML
}

function assertAllScriptsInlined(doc: Document): void {
  const external = Array.from(doc.querySelectorAll('script[src]'))
  if (external.length > 0) {
    throw new StandaloneExportUnavailableError(
      'Standalone export requires the production build (run `npm run build`). ' +
        'The current page references external scripts that would not resolve in the exported file.',
    )
  }
}

function resetRoot(doc: Document): void {
  const root = doc.getElementById('root')
  if (root) root.innerHTML = ''
}

function upsertEmbeddedProject(doc: Document, project: Project): void {
  const existing = doc.getElementById(EMBEDDED_PROJECT_SCRIPT_ID)
  if (existing) existing.remove()

  const script = doc.createElement('script')
  script.id = EMBEDDED_PROJECT_SCRIPT_ID
  script.type = 'application/json'
  script.textContent = encodeForScript(exportProject(project))
  doc.head.appendChild(script)
}

/**
 * Standard mitigation: a literal `</script>` inside JSON would prematurely
 * close the embedded script tag. Escape the slash so the parser ignores it,
 * while keeping the JSON itself valid (the consumer reverses the escape).
 */
function encodeForScript(json: string): string {
  return json.replace(/<\//g, '<\\/')
}
