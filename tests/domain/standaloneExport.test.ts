import { describe, expect, it } from 'vitest'
import {
  EMBEDDED_PROJECT_SCRIPT_ID,
  StandaloneExportUnavailableError,
  buildStandaloneHTML,
} from '@/domain/standaloneExport'
import { emptyProject } from '@/domain/serialization'
import type { Project } from '@/domain/types'

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const inlinedShell = `<!doctype html>
<html><head><title>Planning Tool</title>
<script>/* inlined bundle */</script>
</head><body><div id="root"><div>old render</div></div></body></html>`

const externalScriptShell = `<!doctype html>
<html><head><title>Planning Tool</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`

describe('buildStandaloneHTML', () => {
  it('throws when the source document has external scripts (dev-mode guard)', () => {
    const doc = makeDoc(externalScriptShell)
    expect(() => buildStandaloneHTML(emptyProject('Dev'), { sourceDocument: doc })).toThrow(
      StandaloneExportUnavailableError,
    )
  })

  it('embeds the project as a JSON script tag in <head>', () => {
    const doc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(emptyProject('Hello'), { sourceDocument: doc })
    expect(html).toContain(`id="${EMBEDDED_PROJECT_SCRIPT_ID}"`)
    expect(html).toContain('type="application/json"')
    expect(html).toContain('"name": "Hello"')
  })

  it('clears the #root contents so React can mount fresh', () => {
    const doc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(emptyProject('X'), { sourceDocument: doc })
    expect(html).not.toContain('old render')
    expect(html).toMatch(/<div id="root"><\/div>/)
  })

  it('replaces (not duplicates) an existing embedded-project tag on re-export', () => {
    const doc = makeDoc(inlinedShell)
    const first = buildStandaloneHTML(emptyProject('First'), { sourceDocument: doc })
    const reopened = makeDoc(first)
    const second = buildStandaloneHTML(emptyProject('Second'), { sourceDocument: reopened })

    const matches = second.match(new RegExp(`id="${EMBEDDED_PROJECT_SCRIPT_ID}"`, 'g')) ?? []
    expect(matches.length).toBe(1)
    expect(second).toContain('"name": "Second"')
    expect(second).not.toContain('"name": "First"')
  })

  it('escapes </script> sequences inside the embedded JSON', () => {
    const project: Project = { ...emptyProject(), name: 'Evil </script><img src=x>' }
    const doc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(project, { sourceDocument: doc })

    // The literal "</script>" must NOT appear inside the embedded payload —
    // the slash must be escaped so the HTML parser doesn't close the tag early.
    const start = html.indexOf(`id="${EMBEDDED_PROJECT_SCRIPT_ID}"`)
    const end = html.indexOf('</script>', start)
    const payload = html.slice(start, end)
    expect(payload).not.toContain('</script>')
    expect(payload).toContain('<\\/script>')
  })

  it('begins with the HTML5 doctype', () => {
    const doc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(emptyProject(), { sourceDocument: doc })
    expect(html.toLowerCase().startsWith('<!doctype html>')).toBe(true)
  })

  it('preserves inlined <script> tags from the source document', () => {
    const doc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(emptyProject(), { sourceDocument: doc })
    expect(html).toContain('/* inlined bundle */')
  })
})
