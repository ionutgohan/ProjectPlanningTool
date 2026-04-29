import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEmbeddedProject } from '@/domain/embeddedProject'
import { buildStandaloneHTML, EMBEDDED_PROJECT_SCRIPT_ID } from '@/domain/standaloneExport'
import { emptyProject } from '@/domain/serialization'
import type { Project } from '@/domain/types'

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const inlinedShell = `<!doctype html>
<html><head><title>Planning Tool</title>
<script>/* inlined */</script>
</head><body><div id="root"></div></body></html>`

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readEmbeddedProject', () => {
  it('returns null when the script tag is missing', () => {
    const doc = makeDoc(inlinedShell)
    expect(readEmbeddedProject(doc)).toBeNull()
  })

  it('returns null and warns when the script contents fail validation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = makeDoc(
      `<!doctype html><html><head><script id="${EMBEDDED_PROJECT_SCRIPT_ID}" type="application/json">not json</script></head><body></body></html>`,
    )
    expect(readEmbeddedProject(doc)).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('round-trips a project through buildStandaloneHTML + readEmbeddedProject', () => {
    const original: Project = { ...emptyProject('Round trip'), name: 'Round trip' }
    const sourceDoc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(original, { sourceDocument: sourceDoc })

    const reopened = makeDoc(html)
    const recovered = readEmbeddedProject(reopened)
    expect(recovered).not.toBeNull()
    expect(recovered!.name).toBe('Round trip')
    expect(recovered!.schemaVersion).toBe(original.schemaVersion)
  })

  it('round-trips a project whose name contains </script>', () => {
    const original: Project = { ...emptyProject(), name: 'Evil </script>' }
    const sourceDoc = makeDoc(inlinedShell)
    const html = buildStandaloneHTML(original, { sourceDocument: sourceDoc })

    const reopened = makeDoc(html)
    const recovered = readEmbeddedProject(reopened)
    expect(recovered).not.toBeNull()
    expect(recovered!.name).toBe('Evil </script>')
  })
})
