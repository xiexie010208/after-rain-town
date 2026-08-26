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

type DialogueResult = { reply: string; source: string; model: string }
type DialogueStreamEvent = { type: 'delta' | 'done'; text?: string; result?: DialogueResult }

export async function sendDialogueStream(
  sessionId: string,
  npcId: string,
  message: string,
  live: boolean,
  onDelta: (text: string) => void,
) {
  const response = await fetch(`${API_URL}/api/games/${sessionId}/dialogue/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ npcId, message, live }),
  })
  if (!response.ok || !response.body) throw new Error(`API ${response.status}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: DialogueResult | undefined

  const consumeLine = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as DialogueStreamEvent
    if (event.type === 'delta' && event.text) onDelta(event.text)
    if (event.type === 'done' && event.result) result = event.result
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    lines.forEach(consumeLine)
    if (done) break
  }
  consumeLine(buffer)
  if (!result) throw new Error('流式对话未正常结束')
  return result
}

export type EventDialogueRequest = {
  eventId: string
  eventTitle: string
  participantIds: string[]
  action: string
  attitude: string
  playerLine: string
  live: boolean
}

type EventDialogueResult = { replies: Record<string, string>; source: string; model: string }
type EventStreamEvent = {
  type: 'delta' | 'done'
  npcId?: string
  text?: string
  result?: EventDialogueResult
}

export async function sendEventDialogueStream(
  sessionId: string,
  payload: EventDialogueRequest,
  onDelta: (npcId: string, text: string) => void,
) {
  const controller = new AbortController()
  // 后端会在约 5 秒时将超时的单个 NPC 无感降级，这里留出网络传输余量。
  const timeout = window.setTimeout(() => controller.abort(), 6500)
  try {
    const response = await fetch(`${API_URL}/api/games/${sessionId}/events/dialogue/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok || !response.body) throw new Error(`API ${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: EventDialogueResult | undefined
    const consumeLine = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as EventStreamEvent
      if (event.type === 'delta' && event.npcId && event.text) onDelta(event.npcId, event.text)
      if (event.type === 'done' && event.result) result = event.result
    }
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(consumeLine)
      if (done) break
    }
    consumeLine(buffer)
    if (!result) throw new Error('事件台词未正常结束')
    return result
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function saveSnapshot(sessionId: string, snapshot: unknown) {
  return request<unknown>(`/api/games/${sessionId}/snapshot`, {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  })
}
