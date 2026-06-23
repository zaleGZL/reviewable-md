// Thin client for the local review server (server/cli.js).

export async function fetchDocument() {
  const res = await fetch('/api/document')
  if (!res.ok) throw new Error(`Failed to load document: ${res.status}`)
  return res.json() // { path, markdown }
}

export async function fetchComments() {
  const res = await fetch('/api/comments')
  if (!res.ok) throw new Error(`Failed to load comments: ${res.status}`)
  return res.json() // { comments: [...] }
}

export async function saveComments(comments) {
  const res = await fetch('/api/comments', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comments }),
  })
  if (!res.ok) throw new Error(`Failed to save comments: ${res.status}`)
  return res.json()
}
