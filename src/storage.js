const DB_NAME = 'reviewable-md'
const DB_VERSION = 1
const DOC_STORE = 'documents'
const META_KEY = 'lastDocumentKey'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function runStore(mode, callback) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DOC_STORE, mode)
    const store = tx.objectStore(DOC_STORE)
    const req = callback(store)

    if (req) {
      req.onerror = () => reject(req.error)
    }
    tx.oncomplete = () => {
      db.close()
      resolve(req?.result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
  }))
}

export function documentKeyForPath(filePath) {
  return filePath
}

export async function fetchServerDocument(filePath) {
  const res = await fetch(`/api/document?path=${encodeURIComponent(filePath)}`)
  if (!res.ok) {
    let message = `Failed to load document: ${res.status}`
    try {
      const body = await res.json()
      if (body.error) message = body.error
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message)
  }
  const doc = await res.json()
  return {
    key: documentKeyForPath(doc.path),
    path: doc.path,
    markdown: doc.markdown,
    fileMeta: {
      name: doc.name,
      source: 'server',
    },
  }
}

export async function loadLastDocument() {
  const meta = await runStore('readonly', (store) => store.get(META_KEY))
  if (!meta?.lastDocumentKey) return null
  return await loadDocument(meta.lastDocumentKey)
}

export async function loadDocument(key) {
  const record = await runStore('readonly', (store) => store.get(key))
  if (!record || record.key === META_KEY) return null
  return {
    key: record.key,
    path: record.path,
    markdown: record.markdown,
    fileMeta: record.fileMeta,
    comments: Array.isArray(record.comments) ? record.comments : [],
    layout: record.layout || null,
  }
}

export async function saveDocument(doc, comments = []) {
  const record = {
    key: doc.key,
    path: doc.path,
    markdown: doc.markdown,
    fileMeta: doc.fileMeta || null,
    comments,
    layout: doc.layout || null,
    updatedAt: new Date().toISOString(),
  }
  await runStore('readwrite', (store) => {
    store.put(record)
    store.put({ key: META_KEY, lastDocumentKey: doc.key })
  })
  return record
}

export async function saveComments(docKey, comments) {
  const existing = await loadDocument(docKey)
  if (!existing) throw new Error('No document is loaded')
  await saveDocument(existing, comments)
  return { ok: true }
}

export async function saveLayout(docKey, layout) {
  const existing = await loadDocument(docKey)
  if (!existing) throw new Error('No document is loaded')
  return await saveDocument({ ...existing, layout }, existing.comments || [])
}
