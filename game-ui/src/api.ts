const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export async function createGame(playerName: string) {
  return request<{ sessionId: string }>('/api/games', {
    method: 'POST',
    body: JSON.stringify({ playerName }),
  })
}

export async function sendDialogue(sessionId: string, npcId: string, message: string, live: boolean) {
  return request<{ reply: string; source: string; model: string }>(`/api/games/${sessionId}/dialogue`, {
    method: 'POST',
    body: JSON.stringify({ npcId, message, live }),
  })
}

export async function saveSnapshot(sessionId: string, snapshot: unknown) {
  return request<unknown>(`/api/games/${sessionId}/snapshot`, {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  })
}
