export type Tone = 'amber' | 'blue' | 'green'
export type LocationId = 'home' | 'plaza' | 'cafe' | 'garden'
export type EventStatus = 'active' | 'responding' | 'resolved'
export type InterventionAction = 'join' | 'help' | 'mediate' | 'leave'
export type Attitude = 'gentle' | 'direct' | 'humorous'

export type MemoryRecord = {
  id: string
  minute: number
  text: string
  importance: number
  tags: string[]
}

export type ScheduleItem = {
  minute: number
  location: LocationId
  action: string
}

export type Npc = {
  id: string
  name: string
  role: string
  mood: number
  energy: number
  tag: string
  goal: string
  relation: number
  threshold: number
  location: LocationId
  action: string
  memories: MemoryRecord[]
  impressions: string[]
  schedule: ScheduleItem[]
}

export type Log = { time: string; text: string; tone: Tone }

export type MainEvent = {
  id: 'tea-prep' | 'creative-difference' | 'sunset-gathering'
  title: string
  location: LocationId
  locationName: string
  participants: string[]
  triggerMinute: number
  deadlineMinute: number
  status: EventStatus
  notification: string
  opening: string[]
  replies: Record<string, string>
  action?: InterventionAction
  attitude?: Attitude
  playerLine?: string
  outcome?: string
}

export type SaveData = {
  version: 3
  sessionId?: string
  playerName: string
  started: boolean
  minute: number
  announced: boolean
  dialogueCount: number
  gifts: { coffee: boolean; umbrella: boolean }
  npcs: Npc[]
  logs: Log[]
  liveAi: boolean
  muted: boolean
  aiSource: 'LIVE' | 'MOCK' | 'OFFLINE'
  npcRelations: Record<string, number>
  activeEvent?: MainEvent
  completedEventIds: string[]
  checkedEventIds: string[]
  teaPreparation: number
  eventNotice?: string
}

export const formatTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const memory = (minute: number, text: string, importance = 4, tags: string[] = []): MemoryRecord => ({
  id: `${minute}-${Math.random().toString(36).slice(2, 8)}`, minute, text, importance, tags,
})

const schedules: Record<string, ScheduleItem[]> = {
  alan: [
    { minute: 940, location: 'plaza', action: '查看雨后广场的布置条件' },
    { minute: 975, location: 'garden', action: '寻找适合茶会的花枝' },
    { minute: 1020, location: 'plaza', action: '检查茶会准备进度' },
    { minute: 1060, location: 'plaza', action: '等待黄昏聚会开始' },
  ],
  weining: [
    { minute: 940, location: 'cafe', action: '在窗边画雨后街景' },
    { minute: 980, location: 'garden', action: '散步寻找新的配色' },
    { minute: 1020, location: 'plaza', action: '带着速写本观察布置' },
    { minute: 1060, location: 'cafe', action: '整理今天的草稿' },
  ],
  suhe: [
    { minute: 940, location: 'cafe', action: '整理咖啡馆并烧热水' },
    { minute: 985, location: 'plaza', action: '确认茶会需要的杯具' },
    { minute: 1030, location: 'cafe', action: '准备黄昏前的最后一壶茶' },
    { minute: 1060, location: 'plaza', action: '带着茶点前往广场' },
  ],
}

export const initialNpcs = (): Npc[] => [
  {
    id: 'alan', name: '阿岚', role: '活动策划人', mood: 82, energy: 76,
    tag: '热情 · 外向', goal: '筹备一场让大家放松的茶会', relation: 0, threshold: 2,
    location: 'plaza', action: schedules.alan[0].action, schedule: schedules.alan,
    memories: [memory(930, '听说有一位新居民今天搬进了小镇。', 5, ['玩家', '搬家'])], impressions: [],
  },
  {
    id: 'weining', name: '魏宁', role: '自由插画师', mood: 64, energy: 48,
    tag: '安静 · 谨慎', goal: '完成雨后街景的插画草稿', relation: 0, threshold: 3,
    location: 'cafe', action: schedules.weining[0].action, schedule: schedules.weining,
    memories: [memory(930, '苏禾为我保留了靠窗的安静位置。', 5, ['苏禾', '咖啡馆'])], impressions: [],
  },
  {
    id: 'suhe', name: '苏禾', role: '咖啡馆店主', mood: 74, energy: 69,
    tag: '沉稳 · 务实', goal: '照看咖啡馆并留意居民需求', relation: 0, threshold: 2,
    location: 'cafe', action: schedules.suhe[0].action, schedule: schedules.suhe,
    memories: [memory(930, '魏宁今天看起来有些疲惫。', 5, ['魏宁', '关心'])], impressions: [],
  },
]

export const freshGame = (): SaveData => ({
  version: 3,
  playerName: '', started: false, minute: 15 * 60 + 40, announced: false, dialogueCount: 0,
  gifts: { coffee: false, umbrella: false }, npcs: initialNpcs(), liveAi: false, muted: false, aiSource: 'MOCK',
  npcRelations: { 'weining:suhe': 24, 'alan:weining': 18, 'alan:suhe': 32 },
  completedEventIds: [], checkedEventIds: [], teaPreparation: 15,
  logs: [
    { time: '15:35', text: '阿岚前往中央广场，因为她想筹备茶会。', tone: 'amber' },
    { time: '15:28', text: '魏宁留在咖啡馆，因为他需要恢复灵感。', tone: 'blue' },
  ],
})

export function migrateSave(raw: unknown): SaveData {
  const base = freshGame()
  if (!raw || typeof raw !== 'object') return base
  const old = raw as Partial<SaveData> & { npcs?: Array<Partial<Npc> & { memories?: Array<MemoryRecord | string> }> }
  const npcs = initialNpcs().map((fallback) => {
    const saved = old.npcs?.find((item) => item.id === fallback.id)
    if (!saved) return fallback
    const memories = (saved.memories ?? fallback.memories).map((item, index) => typeof item === 'string'
      ? memory((old.minute ?? base.minute) - index, item, 4, []) : item).slice(-10)
    return { ...fallback, ...saved, memories, impressions: saved.impressions ?? [], schedule: fallback.schedule }
  })
  return {
    ...base, ...old, version: 3, npcs,
    npcRelations: old.npcRelations ?? base.npcRelations,
    completedEventIds: old.completedEventIds ?? [],
    checkedEventIds: old.checkedEventIds ?? [],
    teaPreparation: old.teaPreparation ?? 15,
  }
}

export function addMemory(npc: Npc, minute: number, text: string, importance = 5, tags: string[] = []): Npc {
  return { ...npc, memories: [...npc.memories, memory(minute, text, importance, tags)].slice(-10) }
}

export function relationLabel(value: number) {
  if (value >= 60) return '信任'
  if (value >= 35) return '友好'
  if (value >= 15) return '熟悉'
  if (value >= 0) return '留意'
  return '疏远'
}

const eventDefinitions: Omit<MainEvent, 'status' | 'deadlineMinute' | 'replies'>[] = [
  {
    id: 'tea-prep', title: '雨后茶会筹备', location: 'plaza', locationName: '中央广场',
    participants: ['alan'], triggerMinute: 960,
    notification: '中央广场传来响动，阿岚似乎需要帮助。',
    opening: ['装饰用的花枝被雨打湿了，我一个人可能来不及重新布置。'],
  },
  {
    id: 'creative-difference', title: '创意分歧', location: 'plaza', locationName: '中央广场',
    participants: ['weining', 'suhe'], triggerMinute: 1005,
    notification: '中央广场出现了不同意见，魏宁和苏禾正在商量茶会布置。',
    opening: ['我觉得保留雨后的冷色调会更安静。', '可茶会需要暖一点，来的人才不会觉得拘谨。'],
  },
  {
    id: 'sunset-gathering', title: '黄昏小镇聚会', location: 'plaza', locationName: '中央广场',
    participants: ['alan', 'weining', 'suhe'], triggerMinute: 1050,
    notification: '天色渐暗，居民们开始在中央广场聚集。',
    opening: ['雨变小了，我们也该决定今晚怎样开始。'],
  },
]

function scheduleAt(npc: Npc, minute: number) {
  return [...npc.schedule].reverse().find((item) => item.minute <= minute) ?? npc.schedule[0]
}

export function advanceWorld(state: SaveData, minutes: number, log?: Omit<Log, 'time'>): SaveData {
  const minute = Math.min(1080, state.minute + minutes)
  let next: SaveData = { ...state, minute, eventNotice: undefined }
  let logs = [...state.logs]
  if (log) logs.push({ ...log, time: formatTime(minute) })

  if (next.activeEvent?.status === 'active' && minute >= next.activeEvent.deadlineMinute) {
    next = resolveEventLocally(next, next.activeEvent, 'leave', 'gentle', '')
    logs = next.logs
  }

  if (!next.activeEvent) {
    const definition = eventDefinitions.find((item) =>
      item.triggerMinute <= minute && minute <= item.triggerMinute + 10 && !next.checkedEventIds.includes(item.id))
    if (definition) {
      next = { ...next, checkedEventIds: [...next.checkedEventIds, definition.id] }
      if (next.announced || Math.random() < 0.3) {
        const activeEvent: MainEvent = {
          ...definition, status: 'active', deadlineMinute: minute + 20, replies: {},
        }
        next = { ...next, activeEvent, eventNotice: activeEvent.notification }
        logs.push({ time: formatTime(minute), text: `${activeEvent.title}在${activeEvent.locationName}发生了。`, tone: 'amber' })
      }
    }
  }

  const participants = new Set(next.activeEvent?.participants ?? [])
  const npcs = next.npcs.map((npc) => {
    if (participants.has(npc.id)) {
      return { ...npc, location: next.activeEvent!.location, action: `正在参与：${next.activeEvent!.title}` }
    }
    const schedule = scheduleAt(npc, minute)
    return { ...npc, location: schedule.location, action: schedule.action, energy: Math.max(0, npc.energy - (minutes >= 10 ? 1 : 0)) }
  })
  return { ...next, npcs, logs: logs.slice(-12) }
}

const actionNames: Record<InterventionAction, string> = { join: '加入交谈', help: '主动帮忙', mediate: '进行调解', leave: '暂不介入' }
const attitudeNames: Record<Attitude, string> = { gentle: '温和', direct: '直接', humorous: '幽默' }

export function fallbackReply(npcId: string, event: MainEvent, attitude: Attitude) {
  const lines: Record<string, Record<Attitude, string>> = {
    alan: {
      gentle: event.id === 'sunset-gathering' ? '谢谢你一直记得大家的感受，今晚一定会很温暖。' : '你愿意搭把手，我一下就安心多了。',
      direct: '好，那就照这个办法分工，我们应该赶得上。',
      humorous: '好主意，至少不能让雨滴成为今天最会布置的那一位。',
    },
    weining: {
      gentle: '我明白了，也许安静和温暖不一定互相冲突。',
      direct: '这个方案很清楚，我愿意先试着调整一部分。',
      humorous: '那我保留一点蓝色，免得这场雨觉得自己完全没被邀请。',
    },
    suhe: {
      gentle: '你说得有道理，先听完彼此的想法会更稳妥。',
      direct: '可以，只要不耽误时间，我会配合这个安排。',
      humorous: '行，那我负责热茶，也负责不让大家冷着脸。',
    },
  }
  return lines[npcId]?.[attitude] ?? '我听见了，我们一起把这件事处理好吧。'
}

export function resolveEventLocally(
  state: SaveData,
  event: MainEvent,
  action: InterventionAction,
  attitude: Attitude,
  playerLine: string,
  replies: Record<string, string> = {},
): SaveData {
  const participated = action !== 'leave'
  const base = action === 'help' ? 7 : action === 'mediate' ? 6 : action === 'join' ? 4 : 0
  const attitudeBonus = attitude === 'gentle' ? 2 : attitude === 'humorous' ? 1 : 0
  const relationDelta = participated ? base + attitudeBonus : 0
  const memoryText = participated
    ? `${state.playerName}以${attitudeNames[attitude]}的态度${actionNames[action]}：“${playerLine || '我们一起想办法吧'}”`
    : `${state.playerName}没有介入${event.title}，大家自行处理了这件事。`
  const finalReplies = Object.fromEntries(event.participants.map((id) => [id, replies[id] || fallbackReply(id, event, attitude)]))
  const npcs = state.npcs.map((npc) => {
    if (!event.participants.includes(npc.id)) return npc
    let updated = addMemory({
      ...npc,
      action: '正在重新安排接下来的日程',
      relation: Math.min(100, npc.relation + relationDelta),
      mood: Math.max(0, Math.min(100, npc.mood + (participated ? 4 : -1))),
    }, state.minute, memoryText, event.id === 'sunset-gathering' ? 9 : 7, [state.playerName, event.id])
    if (event.id === 'sunset-gathering' && participated) {
      const impression = attitude === 'gentle' ? '玩家重视每个人的感受。' : attitude === 'direct' ? '玩家遇事会主动推动解决。' : '玩家擅长用轻松方式缓和气氛。'
      updated = { ...updated, impressions: [...updated.impressions.filter((item) => item !== impression), impression].slice(-3) }
    }
    return updated
  })
  const relationKey = 'weining:suhe'
  const npcRelations = event.id === 'creative-difference'
    ? { ...state.npcRelations, [relationKey]: Math.min(100, (state.npcRelations[relationKey] ?? 0) + (participated ? 8 : -2)) }
    : state.npcRelations
  const teaPreparation = Math.min(100, state.teaPreparation + (event.id === 'tea-prep' && participated ? 30 : event.id === 'creative-difference' && participated ? 15 : 0))
  const outcome = participated
    ? `${event.title}顺利推进，${Object.keys(finalReplies).length}位居民回应了你的${attitudeNames[attitude]}态度。`
    : `${event.title}由居民们自行处理，结果平稳但没有产生新的信任。`
  const logs = [...state.logs, { time: formatTime(state.minute), text: outcome, tone: participated ? 'green' as Tone : 'blue' as Tone }].slice(-12)
  return {
    ...state, npcs, npcRelations, teaPreparation, logs,
    activeEvent: undefined,
    completedEventIds: [...state.completedEventIds, event.id],
  }
}

export const interventionLabels = { actions: actionNames, attitudes: attitudeNames }
