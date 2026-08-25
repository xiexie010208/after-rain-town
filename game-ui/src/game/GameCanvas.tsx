import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { RainTownScene } from './RainTownScene'

export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host.current) return
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: 1050,
      height: 650,
      transparent: true,
      scene: [RainTownScene],
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true },
    })
    return () => game.destroy(true)
  }, [])

  return <><div className="map-hint">点击地面移动 · 点击居民查看信息</div><div className="phaser-host" ref={host} /></>
}
