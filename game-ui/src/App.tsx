import { useEffect, useMemo, useState } from 'react'
import { GameCanvas } from './game/GameCanvas'
import { createGame, saveSnapshot, sendDialogue } from './api'
import './App.css'

type Npc = {
  id: string
  name: string
  role: string
  mood: number
  energy: number
  tag: string
  goal: string
  relation: number
  threshold: number
  memories: string[]
}

type Log = { time: string; text: string; tone: 'amber' | 'blue' | 'green' }
type SaveData = {
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
}

const initialNpcs: Npc[] = [
  { id: 'alan', name: '阿岚', role: '活动策划人', mood: 82, energy: 76, tag: '热情 · 外向', goal: '筹备一场让大家放松的茶会', relation: 0, threshold: 2, memories: ['听说有一位新居民今天搬进了小镇。'] },
  { id: 'weining', name: '魏宁', role: '自由插画师', mood: 64, energy: 48, tag: '安静 · 谨慎', goal: '完成雨后街景的插画草稿', relation: 0, threshold: 3, memories: ['苏禾为我保留了靠窗的安静位置。'] },
  { id: 'suhe', name: '苏禾', role: '咖啡馆店主', mood: 74, energy: 69, tag: '沉稳 · 务实', goal: '照看咖啡馆并留意居民需求', relation: 0, threshold: 2, memories: ['魏宁今天看起来有些疲惫。'] },
]

const freshGame = (): SaveData => ({
  playerName: '', started: false, minute: 15 * 60, announced: false, dialogueCount: 0,
  gifts: { coffee: false, umbrella: false }, npcs: initialNpcs, liveAi: false, muted: false, aiSource: 'MOCK',
  logs: [
    { time: '15:00', text: '阿岚正在中央广场观察雨后的街道。', tone: 'amber' },
    { time: '15:00', text: '魏宁留在咖啡馆，想先恢复一些灵感。', tone: 'blue' },
  ],
})

const formatTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const capMemory = (memories: string[], memory: string) => [...memories, memory].slice(-10)

function App() {
  const [game, setGame] = useState<SaveData>(() => {
    try { return JSON.parse(localStorage.getItem('after-rain-town-save') ?? '') as SaveData }
    catch { return freshGame() }
  })
  const [selected, setSelected] = useState(0)
  const [draftName, setDraftName] = useState('')
  const [message, setMessage] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [endingOpen, setEndingOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('after-rain-town-save', JSON.stringify(game))
    if (!game.sessionId) return
    const timer = window.setTimeout(() => { void saveSnapshot(game.sessionId!, game).catch(() => undefined) }, 700)
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    const selectNpc = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      const index = game.npcs.findIndex((item) => item.id === id)
      if (index >= 0) setSelected(index)
    }
    window.addEventListener('rain-town:npc-select', selectNpc)
    return () => window.removeEventListener('rain-town:npc-select', selectNpc)
  }, [game.npcs])

  useEffect(() => {
    if (!game.started || game.muted) return
    const context = new AudioContext()
    const seconds = 2
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    source.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = 1100
    gain.gain.value = 0.018
    source.connect(filter).connect(gain).connect(context.destination)
    source.start()
    void context.resume()
    return () => { source.stop(); void context.close() }
  }, [game.started, game.muted])

  const npc = game.npcs[selected]
  const attendees = useMemo(
    () => game.announced ? game.npcs.filter((item) => item.relation >= item.threshold).length : 0,
    [game.announced, game.npcs],
  )
  const isOver = game.minute >= 18 * 60

  const advance = (state: SaveData, minutes: number, log: Omit<Log, 'time'>): SaveData => {
    const nextMinute = Math.min(18 * 60, state.minute + minutes)
    const nextLogs = [...state.logs, { ...log, time: formatTime(nextMinute) }]
    let nextNpcs = state.npcs
    if (nextMinute < 18 * 60 && nextMinute % 20 === 0) {
      const index = Math.floor((nextMinute - 15 * 60) / 20) % state.npcs.length
      const autonomous = [
        '阿岚绕着广场走了一圈，确认长椅上的雨水已经干了。',
        '魏宁换到窗边的位置，把刚才听到的话画进了速写本。',
        '苏禾擦净了露台桌面，并为傍晚多烧了一壶热水。',
      ][index]
      nextNpcs = state.npcs.map((item, npcIndex) => npcIndex === index ? { ...item, energy: Math.max(0, item.energy - 2), mood: Math.min(100, item.mood + 1) } : item)
      nextLogs.push({ time: formatTime(nextMinute), text: autonomous, tone: index === 0 ? 'amber' : 'blue' })
    }
    return { ...state, npcs: nextNpcs, minute: nextMinute, logs: nextLogs.slice(-8) }
  }

  const announceTeaParty = () => {
    if (game.announced) return
    setGame((current) => {
      const updated = current.npcs.map((item) => ({
        ...item,
        relation: item.relation + 1,
        memories: capMemory(item.memories, `${current.playerName}在公告栏发起了17:30的雨后茶会。`),
      }))
      return advance({ ...current, announced: true, npcs: updated }, 10, { text: `${current.playerName}贴出了雨后茶会公告，居民们开始留意这件事。`, tone: 'green' })
    })
    setNoticeOpen(false)
  }

  const talk = async (content: string) => {
    const clean = content.trim().slice(0, 200)
    if (!clean || game.dialogueCount >= 20 || isOver) return
    const replies = [
      `听起来很有意思。雨停以后，大家确实需要一个聚在一起的理由。`,
      `我记住了。你这个新邻居，比我想象中更愿意了解小镇。`,
      game.announced ? `茶会吗？如果时间安排得开，我会认真考虑参加。` : `先去公告栏写清楚时间吧，这样大家比较容易做决定。`,
    ]
    let reply = replies[(game.dialogueCount + selected) % replies.length]
    let source: SaveData['aiSource'] = 'MOCK'
    if (game.liveAi && game.sessionId) {
      try {
        const result = await sendDialogue(game.sessionId, npc.id, clean, true)
        reply = result.reply
        source = result.source.startsWith('LIVE') ? 'LIVE' : 'MOCK'
      } catch {
        source = 'OFFLINE'
      }
    }
    setGame((current) => {
      const updated = current.npcs.map((item, index) => index === selected ? {
        ...item,
        mood: Math.min(100, item.mood + 3),
        relation: item.relation + 1,
        memories: capMemory(item.memories, `${current.playerName}和我聊到：“${clean.slice(0, 42)}”`),
      } : item)
      return advance({ ...current, dialogueCount: current.dialogueCount + 1, npcs: updated, aiSource: source, liveAi: source === 'OFFLINE' ? false : current.liveAi }, 10, { text: `${npc.name}回应：“${reply}”`, tone: selected === 0 ? 'amber' : 'blue' })
    })
    setMessage('')
  }

  const giveGift = (kind: 'coffee' | 'umbrella') => {
    if (game.gifts[kind] || isOver) return
    const giftName = kind === 'coffee' ? '热咖啡' : '备用雨伞'
    setGame((current) => {
      const updated = current.npcs.map((item, index) => index === selected ? {
        ...item,
        mood: Math.min(100, item.mood + 8),
        relation: item.relation + 2,
        memories: capMemory(item.memories, `${current.playerName}送给我一份${giftName}。`),
      } : item)
      return advance({ ...current, gifts: { ...current.gifts, [kind]: true }, npcs: updated }, 10, { text: `${current.playerName}把${giftName}送给了${npc.name}，彼此更熟悉了。`, tone: 'green' })
    })
  }

  const resetGame = () => {
    localStorage.removeItem('after-rain-town-save')
    setGame(freshGame())
    setSelected(0)
    setEndingOpen(false)
  }

  const startGame = async () => {
    const name = draftName.trim().slice(0, 12)
    if (!name) return
    setGame((current) => ({
      ...current,
      playerName: name,
      started: true,
      logs: [...current.logs, { time: '15:00', text: `${name}作为新居民来到了雨后小镇。`, tone: 'green' }],
    }))
    try {
      const remote = await createGame(name)
      setGame((current) => ({ ...current, sessionId: remote.sessionId }))
    } catch {
      setGame((current) => ({ ...current, aiSource: 'OFFLINE', liveAi: false }))
    }
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">☂</span><strong>雨后小镇</strong></div>
        <div className="world-chip">第 1 天 <strong>{formatTime(game.minute)}</strong></div>
        <div className="world-chip">🌧 小雨</div>
        <div className="world-chip status">世界状态：{isOver ? '茶会时间' : '平和'}</div>
        <div className="top-actions">
          <button title={`当前响应来源：${game.aiSource}`} className={`mode-button ${game.liveAi ? 'live' : ''}`} onClick={() => setGame((current) => ({ ...current, liveAi: !current.liveAi }))}>✦ {game.liveAi ? '真实 AI' : game.aiSource === 'OFFLINE' ? '离线演示' : '稳定演示'}</button>
          <button className="reset-button" onClick={resetGame}>重新开始</button>
          <button aria-label="查看结局" className="icon-button" onClick={() => setEndingOpen(true)}>◎</button>
          <button aria-label="静音" className="icon-button" onClick={() => setGame((current) => ({ ...current, muted: !current.muted }))}>{game.muted ? '×' : '♪'}</button>
        </div>
      </header>

      <section className="workspace">
        <div className="map-column">
          <GameCanvas />
          <div className="objective-card">
            <div><span className="eyebrow">今日目标</span><strong>促成雨后茶会</strong></div>
            <div className="objective-progress"><span>{attendees} / 3 位居民确认参加</span><div><i style={{ width: `${Math.max(5, attendees / 3 * 100)}%` }} /></div></div>
            <button onClick={() => setNoticeOpen(true)}>{game.announced ? '公告已发布' : '查看公告栏'}</button>
          </div>
          <div className="timeline">
            <div className="timeline-title"><strong>行动记录</strong><span>{isOver ? '可以查看今日结局' : '小镇正在运转'}</span></div>
            {game.logs.slice(-3).map((log, index) => <div className="log-row" key={`${log.time}-${index}`}><time>{log.time}</time><b className={`dot ${log.tone}`} />{log.text}</div>)}
          </div>
        </div>

        <aside className="side-panel">
          <div className="npc-switcher">
            {game.npcs.map((item, index) => (
              <button className={selected === index ? 'active' : ''} onClick={() => setSelected(index)} key={item.name}>
                <span>{item.name.slice(0, 1)}</span>{item.name}
              </button>
            ))}
          </div>
          <div className="profile-head">
            <div className={`portrait portrait-${selected}`}>{npc.name.slice(0, 1)}</div>
            <div><h1>{npc.name}</h1><p>{npc.role}</p><span className="personality">{npc.tag}</span></div>
          </div>
          <div className="meters">
            <label>⚡ 精力 <span>{npc.energy}/100</span><i><b style={{ width: `${npc.energy}%` }} /></i></label>
            <label>♥ 心情 <span>{npc.mood}/100</span><i><b className="mood" style={{ width: `${npc.mood}%` }} /></i></label>
            <label>◆ 熟悉度 <span>{npc.relation}/{npc.threshold}</span><i><b className="relation" style={{ width: `${Math.min(100, npc.relation / npc.threshold * 100)}%` }} /></i></label>
          </div>
          <section className="info-card"><span>当前目标</span><strong>{npc.goal}</strong></section>
          <section className="info-card"><span>近期记忆 · {npc.memories.length}/10</span><p>{npc.memories.at(-1)}</p></section>
          <section className="gift-card">
            <span>赠送物品</span>
            <button disabled={game.gifts.coffee || isOver} onClick={() => giveGift('coffee')}>☕ {game.gifts.coffee ? '已送出' : '热咖啡'}</button>
            <button disabled={game.gifts.umbrella || isOver} onClick={() => giveGift('umbrella')}>☂ {game.gifts.umbrella ? '已送出' : '备用雨伞'}</button>
          </section>
          <section className="chat-card">
            <strong>和{npc.name}聊聊</strong>
            <div className="quick-prompts"><button onClick={() => talk('你现在想做什么？')}>你现在想做什么？</button><button onClick={() => talk('你喜欢雨天吗？')}>你喜欢雨天吗？</button></div>
            <div className="chat-input"><input maxLength={200} value={message} disabled={game.dialogueCount >= 20 || isOver} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') talk(message) }} placeholder={`和${npc.name}说点什么…`} /><button onClick={() => talk(message)}>发送</button></div>
            <small>还可以自由对话 {20 - game.dialogueCount} 次 · 每次推进 10 分钟</small>
          </section>
        </aside>
      </section>

      {!game.started && <div className="modal-backdrop"><section className="start-modal"><span className="rain-symbol">☂</span><p className="eyebrow">AFTER RAIN TOWN</p><h2>欢迎来到雨后小镇</h2><p>你是今天刚搬来的新居民。傍晚前，让三位性格不同的邻居愿意来参加茶会吧。</p><input autoFocus maxLength={12} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') startGame() }} placeholder="输入你的名字" /><button onClick={startGame}>走进小镇</button></section></div>}

      {noticeOpen && <div className="modal-backdrop"><section className="notice-modal"><button className="modal-close" onClick={() => setNoticeOpen(false)}>×</button><p className="eyebrow">小镇公告栏</p><h2>雨后茶会招募</h2><p>17:30，中央广场。带上此刻的心情，一起来喝杯热茶。</p><small>发布公告会推进 10 分钟，并成为三名 NPC 的共同记忆。</small><button className="primary" disabled={game.announced || isOver} onClick={announceTeaParty}>{game.announced ? '公告已经发布' : '签名并发布'}</button></section></div>}

      {endingOpen && <div className="modal-backdrop"><section className="notice-modal ending"><button className="modal-close" onClick={() => setEndingOpen(false)}>×</button><p className="eyebrow">今日结局</p><h2>{attendees === 3 ? '完美茶会' : attendees >= 2 ? '雨后的相聚' : '下次再邀请吧'}</h2><p>{attendees === 3 ? '三位居民都来到广场。这个潮湿的傍晚，因为一位新邻居变得格外温暖。' : attendees >= 2 ? `有 ${attendees} 位居民接受了邀请。小小的茶会，已经足够成为友谊的开始。` : '愿意参加的人还不够。继续交谈、送出合适的礼物，也许能改变他们的决定。'}</p><div className="ending-score">确认参加 <strong>{attendees} / 3</strong></div><button className="primary" onClick={() => setEndingOpen(false)}>{isOver ? '留在小镇' : '继续行动'}</button></section></div>}
    </main>
  )
}

export default App
