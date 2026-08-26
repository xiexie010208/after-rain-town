import { useEffect, useMemo, useState } from 'react'
import { GameCanvas } from './game/GameCanvas'
import { createGame, saveSnapshot, sendDialogueStream, sendEventDialogueStream } from './api'
import {
  addMemory, advanceWorld, fallbackReply, formatTime, freshGame, interventionLabels,
  migrateSave, relationLabel, resolveEventLocally,
  type Attitude, type InterventionAction, type Log, type MainEvent, type SaveData,
} from './agentSystem'
import './App.css'

function App() {
  const [game, setGame] = useState<SaveData>(() => {
    try { return migrateSave(JSON.parse(localStorage.getItem('after-rain-town-save') ?? '')) }
    catch { return freshGame() }
  })
  const [selected, setSelected] = useState(0)
  const [draftName, setDraftName] = useState('')
  const [message, setMessage] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [endingOpen, setEndingOpen] = useState(false)
  const [endingDismissed, setEndingDismissed] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingReply, setStreamingReply] = useState('')
  const [interventionOpen, setInterventionOpen] = useState(false)
  const [interventionStep, setInterventionStep] = useState<'action' | 'attitude' | 'line' | 'result'>('action')
  const [eventAction, setEventAction] = useState<InterventionAction>('join')
  const [eventAttitude, setEventAttitude] = useState<Attitude>('gentle')
  const [eventLine, setEventLine] = useState('')
  const [eventReplies, setEventReplies] = useState<Record<string, string>>({})
  const [eventOutcome, setEventOutcome] = useState('')
  const [interventionEvent, setInterventionEvent] = useState<MainEvent>()

  useEffect(() => {
    localStorage.setItem('after-rain-town-save', JSON.stringify(game))
    if (!game.sessionId) return
    const timer = window.setTimeout(() => { void saveSnapshot(game.sessionId!, game).catch(() => undefined) }, 700)
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    const dispatchWorld = () => window.dispatchEvent(new CustomEvent('rain-town:world-update', {
      detail: {
        npcs: game.npcs.map(({ id, location, action }) => ({ id, location, action })),
        activeEvent: game.activeEvent ? {
          id: game.activeEvent.id, location: game.activeEvent.location, title: game.activeEvent.title,
          participants: game.activeEvent.participants,
        } : undefined,
      },
    }))
    dispatchWorld()
    window.addEventListener('rain-town:scene-ready', dispatchWorld)
    return () => window.removeEventListener('rain-town:scene-ready', dispatchWorld)
  }, [game.npcs, game.activeEvent])

  useEffect(() => {
    if (!game.started || game.minute >= 1080 || interventionOpen || isSending) return
    const timer = window.setInterval(() => setGame((current) => advanceWorld(current, 5)), 8000)
    return () => window.clearInterval(timer)
  }, [game.started, game.minute, interventionOpen, isSending])

  useEffect(() => {
    if (!game.eventNotice) return
    const timer = window.setTimeout(() => setGame((current) => ({ ...current, eventNotice: undefined })), 5500)
    return () => window.clearTimeout(timer)
  }, [game.eventNotice])

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
    const openNotice = () => setNoticeOpen(true)
    const openEvent = () => {
      if (!game.activeEvent) return
      setInterventionEvent(game.activeEvent)
      setInterventionStep('action')
      setEventReplies({})
      setEventOutcome('')
      setInterventionOpen(true)
    }
    window.addEventListener('rain-town:notice-open', openNotice)
    window.addEventListener('rain-town:event-open', openEvent)
    return () => {
      window.removeEventListener('rain-town:notice-open', openNotice)
      window.removeEventListener('rain-town:event-open', openEvent)
    }
  }, [game.activeEvent])

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
  const displayEvent = game.activeEvent ?? interventionEvent
  const attendees = useMemo(
    () => game.announced ? game.npcs.filter((item) => item.relation >= item.threshold).length : 0,
    [game.announced, game.npcs],
  )
  const isOver = game.minute >= 18 * 60
  const showEnding = endingOpen || (game.started && isOver && !endingDismissed)

  const advance = (state: SaveData, minutes: number, log: Omit<Log, 'time'>): SaveData => {
    return advanceWorld(state, minutes, log)
  }

  const announceTeaParty = () => {
    if (game.announced) return
    setGame((current) => {
      const updated = current.npcs.map((item) => ({
        ...addMemory(item, current.minute, `${current.playerName}在公告栏发起了17:30的雨后茶会。`, 6, ['玩家', '茶会']),
        relation: item.relation + 1,
      }))
      return advance({ ...current, announced: true, npcs: updated }, 10, { text: `${current.playerName}贴出了雨后茶会公告，居民们开始留意这件事。`, tone: 'green' })
    })
    setNoticeOpen(false)
  }

  const talk = async (content: string) => {
    const clean = content.trim().slice(0, 200)
    if (!clean || game.dialogueCount >= 20 || isOver || isSending) return
    const replies = [
      `听起来很有意思。雨停以后，大家确实需要一个聚在一起的理由。`,
      `我记住了。你这个新邻居，比我想象中更愿意了解小镇。`,
      game.announced ? `茶会吗？如果时间安排得开，我会认真考虑参加。` : `先去公告栏写清楚时间吧，这样大家比较容易做决定。`,
    ]
    let reply = replies[(game.dialogueCount + selected) % replies.length]
    let source: SaveData['aiSource'] = 'MOCK'
    if (game.liveAi && game.sessionId) {
      setIsSending(true)
      setStreamingReply('')
      try {
        const result = await sendDialogueStream(game.sessionId, npc.id, clean, true,
          (delta) => setStreamingReply((current) => current + delta))
        reply = result.reply
        source = result.source.startsWith('LIVE') ? 'LIVE' : 'MOCK'
      } catch {
        source = 'OFFLINE'
      } finally {
        setIsSending(false)
        setStreamingReply('')
      }
    }
    setGame((current) => {
      const updated = current.npcs.map((item, index) => index === selected ? {
        ...addMemory(item, current.minute, `${current.playerName}和我聊到：“${clean.slice(0, 42)}”`, 5, ['玩家', '对话']),
        mood: Math.min(100, item.mood + 3),
        relation: item.relation + 1,
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
        ...addMemory(item, current.minute, `${current.playerName}送给我一份${giftName}。`, 7, ['玩家', '礼物']),
        mood: Math.min(100, item.mood + 8),
        relation: item.relation + 2,
      } : item)
      return advance({ ...current, gifts: { ...current.gifts, [kind]: true }, npcs: updated }, 10, { text: `${current.playerName}把${giftName}送给了${npc.name}，彼此更熟悉了。`, tone: 'green' })
    })
  }

  const beginIntervention = (action: InterventionAction) => {
    if (!game.activeEvent) return
    setEventAction(action)
    if (action === 'leave') {
      const event = game.activeEvent
      const outcome = `${event.title}由居民们自行处理，你决定暂时不介入。`
      setGame((current) => resolveEventLocally(current, event, 'leave', 'gentle', ''))
      setEventOutcome(outcome)
      setInterventionStep('result')
      return
    }
    setInterventionStep('attitude')
  }

  const chooseAttitude = (attitude: Attitude) => {
    setEventAttitude(attitude)
    const suggestions: Record<Attitude, string> = {
      gentle: '我们先听听每个人的想法，再一起找到合适的办法吧。',
      direct: '先把最急的事情分开处理，我来负责其中一部分。',
      humorous: '雨已经够忙了，我们就别让分歧也跟着添乱啦。',
    }
    setEventLine(suggestions[attitude])
    setInterventionStep('line')
  }

  const submitIntervention = async () => {
    const event = game.activeEvent
    if (!event || isSending) return
    const line = eventLine.trim().slice(0, 120) || '我们一起想办法吧。'
    let replies = Object.fromEntries(event.participants.map((id) => [id, fallbackReply(id, event, eventAttitude)]))
    let source: SaveData['aiSource'] = 'MOCK'
    setIsSending(true)
    setEventReplies(Object.fromEntries(event.participants.map((id) => [id, ''])))
    try {
      if (game.liveAi && game.sessionId) {
        const result = await sendEventDialogueStream(game.sessionId, {
          eventId: event.id, eventTitle: event.title, participantIds: event.participants,
          action: interventionLabels.actions[eventAction], attitude: interventionLabels.attitudes[eventAttitude],
          playerLine: line, live: true,
        }, (npcId, delta) => setEventReplies((current) => ({ ...current, [npcId]: (current[npcId] ?? '') + delta })))
        replies = result.replies
        source = result.source.startsWith('LIVE') ? 'LIVE' : 'MOCK'
      } else {
        setEventReplies(replies)
      }
    } catch {
      setEventReplies(replies)
      source = 'OFFLINE'
    } finally {
      setIsSending(false)
    }
    const outcome = eventAction === 'mediate'
      ? '分歧得到缓和，参与者之间更愿意理解彼此。'
      : eventAction === 'help' ? '实际困难被顺利解决，茶会准备向前推进。' : '交谈让大家确认了共同目标。'
    setGame((current) => ({ ...resolveEventLocally(current, event, eventAction, eventAttitude, line, replies), aiSource: source }))
    setEventReplies(replies)
    setEventOutcome(outcome)
    setInterventionStep('result')
  }

  const closeIntervention = () => {
    setInterventionOpen(false)
    setInterventionStep('action')
    setEventLine('')
    setEventReplies({})
    setInterventionEvent(undefined)
  }

  const openActiveEvent = () => {
    if (!game.activeEvent) return
    setInterventionEvent(game.activeEvent)
    setInterventionStep('action')
    setEventReplies({})
    setEventOutcome('')
    setInterventionOpen(true)
  }

  const resetGame = () => {
    if (game.started && !window.confirm('重新开始会清空当前人物关系、记忆和事件进度，确定继续吗？')) return
    localStorage.removeItem('after-rain-town-save')
    setGame(freshGame())
    setSelected(0)
    setEndingOpen(false)
    setEndingDismissed(false)
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
      setGame((current) => ({ ...current, sessionId: remote.sessionId, liveAi: true }))
    } catch {
      setGame((current) => ({ ...current, aiSource: 'OFFLINE', liveAi: false }))
    }
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">🏡</span><strong>雨后小镇</strong></div>
        <div className="world-chip">◷　第 1 天 <strong>{formatTime(game.minute)}</strong></div>
        <div className="world-chip">🌧　小雨</div>
        <div className="world-chip status">🌿　世界状态：<strong>{isOver ? '茶会时间' : '平和'}</strong></div>
        <div className="top-actions">
          <button title={`当前响应来源：${game.aiSource}`} className={`mode-button ${game.liveAi ? 'live' : 'demo'}`} onClick={() => setGame((current) => ({ ...current, liveAi: !current.liveAi }))}>🧠　{game.liveAi ? '真实 AI' : '稳定演示'} <i /></button>
          <button className="world-button" onClick={() => setEndingOpen(true)}>◉　影响世界</button>
          <button className="publish-button" onClick={() => setNoticeOpen(true)}>📣　发布活动</button>
          <button className="reset-button" onClick={resetGame}>↻　重新开始</button>
        </div>
      </header>

      <section className="workspace">
        <div className="map-column">
          <GameCanvas />
          {game.eventNotice && <button className="event-toast" onClick={openActiveEvent}>
            <span>附近事件</span><strong>{game.eventNotice}</strong><small>前往光圈处可以介入</small>
          </button>}
          {game.activeEvent && <button className="active-event-card" onClick={openActiveEvent}>
            <b>!</b><span><small>正在发生 · {game.activeEvent.locationName}</small><strong>{game.activeEvent.title}</strong></span><em>查看事件</em>
          </button>}
          <div className="timeline">
            <div className="timeline-title"><strong>行动记录</strong><span>{isOver ? '可以查看今日结局' : '小镇正在运转'}</span></div>
            {game.logs.slice(-2).map((log, index) => <div className="log-row" key={`${log.time}-${index}`}><time>{log.time}</time><b className={`dot ${log.tone}`} /><span className="log-avatar">{log.tone === 'amber' ? '岚' : log.tone === 'blue' ? '宁' : '你'}</span><span>{log.text}</span></div>)}
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
            <div className={`portrait portrait-${selected}`} aria-label={`${npc.name}的角色肖像`}><img src="/characters-v2.png" alt="" /></div>
            <div><h1>{npc.name}</h1><p>{npc.role}</p><span className="personality">{npc.tag}</span></div>
          </div>
          <div className="meters">
            <label>⚡ 精力 <span>{npc.energy}/100</span><i><b style={{ width: `${npc.energy}%` }} /></i></label>
            <label>♥ 心情 <span>{npc.mood}/100</span><i><b className="mood" style={{ width: `${npc.mood}%` }} /></i></label>
            <label>◆ 熟悉度 <span>{Math.min(npc.relation, npc.threshold)}/{npc.threshold}</span><i><b className="relation" style={{ width: `${Math.min(100, npc.relation / npc.threshold * 100)}%` }} /></i></label>
          </div>
          <section className="info-card"><span>当前目标</span><strong>{npc.goal}</strong><p className="agent-action">日程：{npc.action}</p></section>
          <section className="info-card"><span>关系 · {relationLabel(npc.relation)}</span><p>玩家关系 {npc.relation >= 0 ? '↑' : '↓'} · NPC关系会影响相遇和事件回应</p></section>
          <section className="info-card"><span>近期记忆 · {npc.memories.length}/10</span><p>{npc.memories.at(-1)?.text}</p>{npc.impressions.length > 0 && <small className="impression">长期印象：{npc.impressions.at(-1)}</small>}</section>
          <section className="gift-card">
            <span>赠送物品</span>
            <button disabled={game.gifts.coffee || isOver} onClick={() => giveGift('coffee')}>☕ {game.gifts.coffee ? '已送出' : '热咖啡'}</button>
            <button disabled={game.gifts.umbrella || isOver} onClick={() => giveGift('umbrella')}>☂ {game.gifts.umbrella ? '已送出' : '备用雨伞'}</button>
          </section>
          <section className="chat-card">
            <strong>和{npc.name}聊聊</strong>
            {isSending && <div className="streaming-reply"><span>{npc.name}正在回应</span><p>{streamingReply || '…'}</p></div>}
            <div className="quick-prompts"><button disabled={isSending} onClick={() => talk('你现在想做什么？')}>你现在想做什么？</button><button disabled={isSending} onClick={() => talk('你喜欢雨天吗？')}>你喜欢雨天吗？</button></div>
            <div className="chat-input"><input maxLength={200} value={message} disabled={game.dialogueCount >= 20 || isOver || isSending} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') talk(message) }} placeholder={`和${npc.name}说点什么…`} /><button disabled={isSending} onClick={() => talk(message)}>{isSending ? '回应中' : '发送'}</button></div>
            <small>还可以自由对话 {20 - game.dialogueCount} 次 · 每次推进 10 分钟</small>
          </section>
        </aside>
      </section>

      {!game.started && <div className="modal-backdrop"><section className="start-modal"><span className="rain-symbol">☂</span><p className="eyebrow">AFTER RAIN TOWN</p><h2>欢迎来到雨后小镇</h2><p>你是今天刚搬来的新居民。傍晚前，让三位性格不同的邻居愿意来参加茶会吧。</p><input autoFocus maxLength={12} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') startGame() }} placeholder="输入你的名字" /><button onClick={startGame}>走进小镇</button></section></div>}

      {noticeOpen && <div className="modal-backdrop"><section className="notice-modal"><button className="modal-close" onClick={() => setNoticeOpen(false)}>×</button><p className="eyebrow">小镇公告栏</p><h2>雨后茶会招募</h2><p>17:30，中央广场。带上此刻的心情，一起来喝杯热茶。</p><small>发布公告会推进 10 分钟，并成为三名 NPC 的共同记忆。</small><button className="primary" disabled={game.announced || isOver} onClick={announceTeaParty}>{game.announced ? '公告已经发布' : '签名并发布'}</button></section></div>}

      {interventionOpen && displayEvent && <div className="modal-backdrop event-backdrop"><section className="event-modal">
        {interventionStep !== 'result' && <button className="modal-close" onClick={closeIntervention}>×</button>}
        <p className="eyebrow">主要事件 · {displayEvent.locationName}</p>
        <h2>{displayEvent.title}</h2>
        <div className="event-cast">
          {displayEvent.participants.map((id, index) => {
            const person = game.npcs.find((item) => item.id === id)
            return <div className="event-line" key={id}><b>{person?.name}</b><p>{displayEvent.opening[index] ?? displayEvent.opening[0]}</p></div>
          })}
        </div>

        {interventionStep === 'action' && <div className="event-step">
          <h3>你想怎么做？</h3>
          <div className="choice-grid action-choices">
            {(['join', 'help', 'mediate', 'leave'] as InterventionAction[]).map((action) => <button key={action} onClick={() => beginIntervention(action)}>
              <span>{action === 'join' ? '💬' : action === 'help' ? '🤝' : action === 'mediate' ? '⚖' : '↩'}</span>{interventionLabels.actions[action]}
            </button>)}
          </div>
        </div>}

        {interventionStep === 'attitude' && <div className="event-step">
          <button className="step-back" onClick={() => setInterventionStep('action')}>← 返回</button>
          <h3>选择表达态度</h3>
          <div className="choice-grid attitude-choices">
            {(['gentle', 'direct', 'humorous'] as Attitude[]).map((attitude) => <button key={attitude} onClick={() => chooseAttitude(attitude)}>
              <span>{attitude === 'gentle' ? '🌿' : attitude === 'direct' ? '◆' : '☀'}</span><b>{interventionLabels.attitudes[attitude]}</b>
              <small>{attitude === 'gentle' ? '重视每个人的感受' : attitude === 'direct' ? '推动问题尽快解决' : '用轻松方式缓和气氛'}</small>
            </button>)}
          </div>
        </div>}

        {interventionStep === 'line' && <div className="event-step">
          <button className="step-back" onClick={() => setInterventionStep('attitude')}>← 返回</button>
          <h3>{interventionLabels.attitudes[eventAttitude]}地说一句话</h3>
          <textarea maxLength={120} value={eventLine} onChange={(event) => setEventLine(event.target.value)} />
          <div className="line-meta"><span>可修改推荐台词</span><span>{eventLine.length}/120</span></div>
          {isSending && <div className="event-stream">
            {displayEvent.participants.map((id) => <p key={id}><b>{game.npcs.find((item) => item.id === id)?.name}</b>{eventReplies[id] || '正在思考…'}</p>)}
          </div>}
          <button className="event-submit" disabled={isSending} onClick={submitIntervention}>{isSending ? '居民正在回应…' : '说出这句话'}</button>
        </div>}

        {interventionStep === 'result' && <div className="event-step result-step">
          <h3>{eventAction === 'leave' ? '事件自行发展' : '你的行动产生了影响'}</h3>
          {Object.entries(eventReplies).map(([id, reply]) => <div className="result-reply" key={id}><b>{game.npcs.find((item) => item.id === id)?.name}</b><p>“{reply}”</p></div>)}
          <div className="result-summary"><span>事件结果</span><strong>{eventOutcome}</strong><small>关系、情绪、日程与记忆已经更新</small></div>
          <button className="event-submit" onClick={closeIntervention}>回到小镇</button>
        </div>}
      </section></div>}

      {showEnding && <div className="modal-backdrop"><section className="notice-modal ending relation-modal">
        <button className="modal-close" onClick={() => { setEndingOpen(false); setEndingDismissed(true) }}>×</button>
        <p className="eyebrow">{isOver ? '18:00 · 今日结局' : '正在变化的小镇'}</p>
        <h2>{isOver ? (game.teaPreparation >= 55 ? '雨后的相聚' : '仍在生长的友谊') : '人物关系与世界状态'}</h2>
        <p>{isOver ? '居民会记得你今天的选择。关系不只影响一句台词，也改变了他们愿意去哪里、与谁共同度过黄昏。' : '关系通过交谈、礼物和主要事件发生变化，并会被后续 Agent 决策读取。'}</p>
        <div className="world-summary">
          <div><span>主要事件</span><strong>{game.completedEventIds.length} / 3</strong></div>
          <div><span>茶会准备</span><strong>{game.teaPreparation}%</strong></div>
          <div><span>自由对话</span><strong>{game.dialogueCount} / 20</strong></div>
        </div>
        <div className="relationship-list">
          <h3>{game.playerName || '玩家'}与居民</h3>
          {game.npcs.map((item) => <div key={item.id}><span>{game.playerName || '玩家'} ↔ {item.name}</span><b>{relationLabel(item.relation)}</b></div>)}
          <h3>居民之间</h3>
          <div><span>魏宁 ↔ 苏禾</span><b>{relationLabel(game.npcRelations['weining:suhe'] ?? 0)}</b></div>
          <div><span>阿岚 ↔ 魏宁</span><b>{relationLabel(game.npcRelations['alan:weining'] ?? 0)}</b></div>
          <div><span>阿岚 ↔ 苏禾</span><b>{relationLabel(game.npcRelations['alan:suhe'] ?? 0)}</b></div>
        </div>
        {isOver && <div className="ending-score">来到黄昏聚会 <strong>{Math.max(attendees, game.completedEventIds.includes('sunset-gathering') ? 3 : 0)} / 3</strong></div>}
        <button className="primary" onClick={() => { setEndingOpen(false); setEndingDismissed(true) }}>{isOver ? '留在小镇' : '继续行动'}</button>
      </section></div>}
    </main>
  )
}

export default App
