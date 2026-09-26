/*
 * The browser's own storage, wrapped thinly: one IndexedDB store for the records a person makes,
 * because a song is an audio Blob and localStorage only holds strings.
 *
 * TODO(backend): when accounts exist, this file stays as the offline cache and `data/records.ts`
 * decides between it and the server. Nothing outside data/ touches IndexedDB.
 */

const DATABASE = 'ecko'
const VERSION = 2
export const RECORDS = 'records'
/** Records shared to the community feed (data/community.ts), each with its own copy of the audio. */
export const POSTS = 'posts'

let opening: Promise<IDBDatabase> | null = null

/** The database, opened once and shared. Rejects where IndexedDB is missing or blocked. */
function open(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser has no IndexedDB, so records cannot be kept.'))
      return
    }
    const request = window.indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(RECORDS)) {
        database.createObjectStore(RECORDS, { keyPath: 'id' }).createIndex('madeAt', 'madeAt')
      }
      if (!database.objectStoreNames.contains(POSTS)) {
        database.createObjectStore(POSTS, { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB would not open.'))
  })
  // a failed open shouldn't poison every later try (a private window that later gets permission)
  opening.catch(() => {
    opening = null
  })
  return opening
}

/** Runs one transaction and resolves with whatever the request returns. */
async function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const database = await open()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(store, mode)
    const request = work(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error ?? new Error('The record store refused that.'))
  })
}

export function put<T>(store: string, value: T): Promise<unknown> {
  return run(store, 'readwrite', (objects) => objects.put(value))
}

export function getAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', (objects) => objects.getAll())
}

export function remove(store: string, id: string): Promise<unknown> {
  return run(store, 'readwrite', (objects) => objects.delete(id))
}
