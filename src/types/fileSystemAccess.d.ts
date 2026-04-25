// Ambient declarations for the File System Access API.
// TypeScript's built-in lib.dom.d.ts does not yet include these APIs, even
// though they have shipped in Chrome/Edge since 2020. We only declare the
// subset we actually use.

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

type PermissionState = 'granted' | 'denied' | 'prompt'

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean
}

interface FileSystemFileHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>
}

interface OpenFilePickerOptions {
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  excludeAcceptAllOption?: boolean
  multiple?: boolean
}

interface Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
}
