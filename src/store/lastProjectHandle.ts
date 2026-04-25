/**
 * Persists the last-opened file handle so we can restore the project on the next launch.
 *
 * The File System Access API is Chromium-only. On other browsers the helpers
 * here become no-ops and `isFileSystemAccessSupported()` returns false — the
 * UI should fall back to the classic `<input type="file">` flow.
 *
 * Note on permissions: handles survive reloads, but the permission grant
 * typically resets to `'prompt'` on a new session. We silently auto-restore
 * only when permission is already `'granted'`; otherwise the TopNav shows a
 * one-click "Reopen" button that re-requests permission via a user gesture.
 */

const DB_NAME = 'planning-tool'
const DB_VERSION = 1
const STORE_NAME = 'handles'
const KEY = 'last-project'

export interface StoredHandle {
  handle: FileSystemFileHandle
  name: string
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function runInStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      const req = fn(store)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function saveLastHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const entry: StoredHandle = { handle, name: handle.name }
    await runInStore('readwrite', (s) => s.put(entry, KEY))
  } catch {
    // IDB may be unavailable (private mode, quota, etc.) — silently give up.
  }
}

export async function loadLastHandle(): Promise<StoredHandle | null> {
  try {
    const result = await runInStore<StoredHandle | undefined>('readonly', (s) => s.get(KEY))
    return result ?? null
  } catch {
    return null
  }
}

export async function clearLastHandle(): Promise<void> {
  try {
    await runInStore('readwrite', (s) => s.delete(KEY))
  } catch {
    // ignore
  }
}

/**
 * Attempt to read the file the handle points at. Resolves to the text contents,
 * or `null` if the file is missing, renamed, or permission was refused.
 * On missing/renamed we also clear the stored handle so startup doesn't keep
 * trying on every reload.
 */
export async function readFromHandle(
  handle: FileSystemFileHandle,
  mode: 'query' | 'request',
): Promise<string | null> {
  try {
    const current =
      mode === 'query'
        ? await handle.queryPermission({ mode: 'read' })
        : await handle.requestPermission({ mode: 'read' })
    if (current !== 'granted') return null
    const file = await handle.getFile()
    return await file.text()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await clearLastHandle()
    }
    return null
  }
}

/**
 * Write `text` to the file the handle points at. Returns true on success.
 *
 * Requests `readwrite` permission up front — Chrome/Edge prompt on the first
 * save per session, so callers must invoke this from a user-gesture handler
 * (e.g. a button click). On a missing/renamed file we clear the stored handle
 * so future saves don't keep failing silently.
 */
export async function writeToHandle(
  handle: FileSystemFileHandle,
  text: string,
): Promise<boolean> {
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') return false
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      await clearLastHandle()
    }
    return false
  }
}
