import Phaser from 'phaser'

type GridPoint = { x: number; y: number }
type PathNode = GridPoint & { g: number; h: number; parent?: PathNode }
type WorldUpdate = {
  npcs: Array<{ id: string; location: string; action: string }>
  activeEvent?: { id: string; location: string; title: string; participants: string[] }
}

const GRID_WIDTH = 12
const GRID_HEIGHT = 10
const keyOf = ({ x, y }: GridPoint) => `${x},${y}`

export class RainTownScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container
  private playerSprite?: Phaser.GameObjects.Sprite
  private playerGrid: GridPoint = { x: 2, y: 7 }
  private tileW = 88
  private tileH = 44
  private origin = { x: 525, y: 70 }
  private destinationMarker?: Phaser.GameObjects.Ellipse
  private people = new Map<string, Phaser.GameObjects.Container>()
  private peopleSprites = new Map<string, Phaser.GameObjects.Sprite>()
  private peopleFrames = new Map<string, number>()
  private npcGrids = new Map<string, GridPoint>()
  private eventMarker?: Phaser.GameObjects.Container
  private lastBackgroundInteractionAt = 0
  private walking = false
  private blocked = new Set([
    '1,2', '2,1', '10,7', '3,9', '11,3', '7,8',
    '8,1', '9,1', '10,1', '8,2', '9,2', '10,2', '9,3',
  ])
  private locationGrids: Record<string, GridPoint> = {
    home: { x: 3, y: 6 }, plaza: { x: 5, y: 4 }, cafe: { x: 8, y: 4 }, garden: { x: 4, y: 2 },
  }

  constructor() { super('rain-town') }

  preload() {
    this.load.image('rain-town-background', '/rain-town-scene-v2.webp')
    this.load.spritesheet('town-characters', '/characters-v2.png', {
      frameWidth: 256,
      frameHeight: 256,
      endFrame: 3,
    })
    this.load.spritesheet('town-characters-back', '/characters-back-v2.png', {
      frameWidth: 256,
      frameHeight: 256,
      endFrame: 3,
    })
  }

  private iso({ x, y }: GridPoint) {
    return {
      x: this.origin.x + (x - y) * this.tileW / 2,
      y: this.origin.y + (x + y) * this.tileH / 2,
    }
  }

  private screenToGrid(x: number, y: number): GridPoint {
    const wx = x - this.origin.x
    const wy = y - this.origin.y
    return {
      x: Math.round((wy / (this.tileH / 2) + wx / (this.tileW / 2)) / 2),
      y: Math.round((wy / (this.tileH / 2) - wx / (this.tileW / 2)) / 2),
    }
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b2228')
    this.tileW = this.scale.width * 0.095
    this.tileH = this.scale.height * 0.065
    this.origin = { x: this.scale.width * 0.5, y: this.scale.height * 0.25 }

    const background = this.add.image(0, 0, 'rain-town-background').setOrigin(0).setDepth(-1000)
    background.setDisplaySize(this.scale.width, this.scale.height)
    this.addLocationLabel('中央广场', this.scale.width * 0.24, this.scale.height * 0.44)
    this.addLocationLabel('咖啡馆', this.scale.width * 0.83, this.scale.height * 0.69)

    this.makePerson('alan', '阿岚', 4, 4, 1)
    this.makePerson('weining', '魏宁', 8, 5, 2)
    this.makePerson('suhe', '苏禾', 8, 3, 3)
    this.player = this.makePerson('player', '你', this.playerGrid.x, this.playerGrid.y, 0, true)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.walking) return
      const target = this.screenToGrid(pointer.worldX, pointer.worldY)
      if (!this.isWalkable(target) || !this.player) {
        this.showBlockedHint(pointer.worldX, pointer.worldY)
        return
      }

      const path = this.findPath(this.playerGrid, target)
      if (!path.length) {
        if (keyOf(target) !== keyOf(this.playerGrid)) this.showBlockedHint(pointer.worldX, pointer.worldY)
        return
      }
      this.walkPath(path)
    })

    this.time.addEvent({ delay: 100, loop: true, callback: () => this.rainDrop() })
    this.time.addEvent({ delay: 9000, loop: true, callback: () => this.showBackgroundInteraction() })
    window.addEventListener('rain-town:world-update', this.onWorldUpdate as EventListener)
    window.dispatchEvent(new CustomEvent('rain-town:scene-ready'))
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('rain-town:world-update', this.onWorldUpdate as EventListener)
    })
  }

  private onWorldUpdate = (raw: Event) => {
    const world = (raw as CustomEvent<WorldUpdate>).detail
    if (!world) return
    world.npcs.forEach((npc, index) => this.moveNpc(npc.id, npc.location, index))
    this.renderEventMarker(world.activeEvent)
  }

  private moveNpc(id: string, location: string, index: number) {
    const person = this.people.get(id)
    const sprite = this.peopleSprites.get(id)
    const frame = this.peopleFrames.get(id) ?? 0
    const base = this.locationGrids[location] ?? this.locationGrids.plaza
    const offsets: GridPoint[] = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }]
    const target = { x: Math.max(0, base.x + offsets[index].x), y: Math.max(0, base.y + offsets[index].y) }
    const previous = this.npcGrids.get(id)
    if (!person || (previous && keyOf(previous) === keyOf(target))) return
    this.npcGrids.set(id, target)
    const point = this.iso(target)
    if (sprite) {
      sprite.setTexture(point.y < person.y ? 'town-characters-back' : 'town-characters', frame)
      sprite.setFlipX(point.x < person.x)
    }
    this.tweens.killTweensOf(person)
    this.tweens.add({
      targets: person, x: point.x, y: point.y - 14, duration: 900, ease: 'Sine.easeInOut',
      onUpdate: () => person.setDepth(person.y + 94),
      onComplete: () => sprite?.setTexture('town-characters', frame).setFlipX(false),
    })
  }

  private renderEventMarker(event?: WorldUpdate['activeEvent']) {
    this.eventMarker?.destroy(true)
    this.eventMarker = undefined
    if (!event) return
    const point = this.iso(this.locationGrids[event.location] ?? this.locationGrids.plaza)
    const marker = this.add.container(point.x, point.y + 8).setDepth(point.y + 850)
    const glow = this.add.ellipse(0, 0, 150, 68, 0xf2b85f, 0.12).setStrokeStyle(3, 0xffcf79, 0.9)
    const badge = this.add.text(0, -56, `!  ${event.title}`, {
      fontFamily: 'system-ui', fontStyle: 'bold', fontSize: '14px', color: '#fff5d5',
      backgroundColor: '#6d3f20ee', padding: { x: 13, y: 8 },
    }).setOrigin(0.5)
    marker.add([glow, badge]).setSize(180, 105).setInteractive({ useHandCursor: true })
    marker.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, inputEvent: Phaser.Types.Input.EventData) => {
      inputEvent.stopPropagation()
      window.dispatchEvent(new CustomEvent('rain-town:event-open'))
    })
    this.tweens.add({ targets: glow, scale: 1.18, alpha: 0.26, duration: 900, yoyo: true, repeat: -1 })
    event.participants.forEach((id) => this.showBubble(id, '！', true))
    this.eventMarker = marker
  }

  private showBackgroundInteraction() {
    if (this.eventMarker) return
    const now = this.time.now
    if (now - this.lastBackgroundInteractionAt < 15000 || Math.random() > 0.3) return
    const options = [
      ['alan', '待会儿广场见。'], ['weining', '雨后的颜色很特别。'], ['suhe', '热茶已经准备好了。'],
    ] as const
    const [id, text] = options[Phaser.Math.Between(0, options.length - 1)]
    this.lastBackgroundInteractionAt = now
    this.showBubble(id, text, false)
  }

  private showBubble(id: string, text: string, important: boolean) {
    const person = this.people.get(id)
    if (!person) return
    const bubble = this.add.text(person.x, person.y - 105, text, {
      fontFamily: 'system-ui', fontStyle: important ? 'bold' : 'normal', fontSize: important ? '20px' : '12px',
      color: important ? '#6d3f20' : '#263d43', backgroundColor: important ? '#fff0c9ee' : '#f1eee2ee',
      padding: { x: important ? 10 : 8, y: important ? 6 : 5 },
    }).setOrigin(0.5).setDepth(1100)
    this.tweens.add({ targets: bubble, y: bubble.y - 8, alpha: 0, delay: important ? 1700 : 2300, duration: 500, onComplete: () => bubble.destroy() })
  }

  private addLocationLabel(label: string, x: number, y: number) {
    this.add.text(x, y, label, {
      fontFamily: 'system-ui', fontStyle: 'bold', fontSize: '15px', color: '#fff8e8',
      backgroundColor: '#08141bd9', padding: { x: 14, y: 8 },
      stroke: '#091318', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(920)
  }

  private isWalkable(point: GridPoint) {
    return point.x >= 0 && point.y >= 0 && point.x < GRID_WIDTH && point.y < GRID_HEIGHT && !this.blocked.has(keyOf(point))
  }

  private findPath(start: GridPoint, goal: GridPoint): GridPoint[] {
    if (keyOf(start) === keyOf(goal)) return []
    const open: PathNode[] = [{ ...start, g: 0, h: this.distance(start, goal) }]
    const bestCost = new Map<string, number>([[keyOf(start), 0]])
    const closed = new Set<string>()

    while (open.length) {
      open.sort((a, b) => (a.g + a.h) - (b.g + b.h) || a.h - b.h)
      const current = open.shift()!
      const currentKey = keyOf(current)
      if (closed.has(currentKey)) continue
      if (currentKey === keyOf(goal)) {
        const path: GridPoint[] = []
        let cursor: PathNode | undefined = current
        while (cursor?.parent) {
          path.unshift({ x: cursor.x, y: cursor.y })
          cursor = cursor.parent
        }
        return path
      }

      closed.add(currentKey)
      const neighbours = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ]

      for (const next of neighbours) {
        if (!this.isWalkable(next) || closed.has(keyOf(next))) continue
        const nextCost = current.g + 1
        if (nextCost >= (bestCost.get(keyOf(next)) ?? Number.POSITIVE_INFINITY)) continue
        bestCost.set(keyOf(next), nextCost)
        open.push({ ...next, g: nextCost, h: this.distance(next, goal), parent: current })
      }
    }
    return []
  }

  private distance(a: GridPoint, b: GridPoint) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }

  private walkPath(path: GridPoint[]) {
    if (!this.player || !path.length) return
    this.walking = true
    const destination = this.iso(path[path.length - 1])
    this.destinationMarker?.destroy()
    this.destinationMarker = this.add.ellipse(destination.x, destination.y + 18, 26, 12, 0xa9f4df, 0.25)
      .setStrokeStyle(2, 0xa9f4df, 0.75).setDepth(destination.y + 1)

    const moveNext = (index: number) => {
      if (!this.player) return
      if (index >= path.length) {
        this.walking = false
        this.destinationMarker?.destroy()
        this.playerSprite?.setTexture('town-characters', 0).setFlipX(false).setY(-25)
        return
      }
      const node = path[index]
      const point = this.iso(node)
      const dx = point.x - this.player.x
      const dy = point.y - this.player.y
      this.playerSprite?.setTexture(dy < 0 ? 'town-characters-back' : 'town-characters', 0)
      this.playerSprite?.setFlipX(dx < 0)
      if (this.playerSprite) {
        this.tweens.add({ targets: this.playerSprite, y: -31, duration: 110, yoyo: true, ease: 'Sine.easeInOut' })
      }
      this.tweens.add({
        targets: this.player,
        x: point.x,
        y: point.y - 14,
        duration: 220,
        ease: 'Linear',
        onUpdate: () => this.player?.setDepth((this.player?.y ?? 0) + 94),
        onComplete: () => {
          this.playerGrid = node
          moveNext(index + 1)
        },
      })
    }
    moveNext(0)
  }

  private showBlockedHint(x: number, y: number) {
    const marker = this.add.circle(x, y, 9, 0xe7847b, 0.22).setStrokeStyle(2, 0xe7847b, 0.8).setDepth(1000)
    this.tweens.add({ targets: marker, scale: 1.8, alpha: 0, duration: 350, onComplete: () => marker.destroy() })
  }

  private makePerson(id: string, name: string, x: number, y: number, frame: number, isPlayer = false) {
    const p = this.iso({ x, y })
    const c = this.add.container(p.x, p.y - 14).setDepth(p.y + 80)
    const shadow = this.add.ellipse(0, 18, 43, 14, 0x051012, 0.38)
    const sprite = this.add.sprite(0, -25, 'town-characters', frame).setDisplaySize(92, 92)
    const label = this.add.text(0, 39, name, {
      fontFamily: 'system-ui', fontStyle: 'bold', fontSize: '12px', color: '#ffffff',
      backgroundColor: isPlayer ? '#167466e8' : '#0b1c22e8', padding: { x: 7, y: 4 },
    }).setOrigin(0.5)
    c.add([shadow, sprite, label])
    this.people.set(id, c)
    this.peopleSprites.set(id, sprite)
    this.peopleFrames.set(id, frame)
    this.npcGrids.set(id, { x, y })
    if (isPlayer) this.playerSprite = sprite
    if (!isPlayer) {
      c.setSize(74, 96).setInteractive({ useHandCursor: true })
      c.on('pointerover', () => {
        this.tweens.add({ targets: sprite, scaleX: sprite.scaleX * 1.06, scaleY: sprite.scaleY * 1.06, duration: 100 })
        label.setBackgroundColor('#b2673be8')
      })
      c.on('pointerout', () => {
        this.tweens.add({ targets: sprite, displayWidth: 92, displayHeight: 92, duration: 100 })
        label.setBackgroundColor('#0b1c22e8')
      })
      c.on('pointerdown', (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation()
        window.dispatchEvent(new CustomEvent('rain-town:npc-select', { detail: id }))
      })
    }
    return c
  }

  private rainDrop() {
    const x = Phaser.Math.Between(0, this.scale.width)
    const y = Phaser.Math.Between(-20, this.scale.height - 60)
    const line = this.add.rectangle(x, y, 1, 15, 0x9fd4dc, 0.26).setDepth(999)
    this.tweens.add({ targets: line, x: x - 8, y: y + 45, alpha: 0, duration: 450, onComplete: () => line.destroy() })
  }
}
