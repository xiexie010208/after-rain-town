import Phaser from 'phaser'

type GridPoint = { x: number; y: number }
type PathNode = GridPoint & { g: number; h: number; parent?: PathNode }

const GRID_WIDTH = 12
const GRID_HEIGHT = 10
const keyOf = ({ x, y }: GridPoint) => `${x},${y}`

export class RainTownScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Container
  private playerGrid: GridPoint = { x: 2, y: 7 }
  private tileW = 88
  private tileH = 44
  private origin = { x: 525, y: 70 }
  private destinationMarker?: Phaser.GameObjects.Ellipse
  private walking = false
  private blocked = new Set([
    '1,2', '2,1', '10,7', '3,9', '11,3', '7,8',
    '8,1', '9,1', '10,1', '8,2', '9,2', '10,2', '9,3',
  ])

  constructor() { super('rain-town') }

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
    const background = this.add.graphics()
    background.fillGradientStyle(0x17343a, 0x17343a, 0x0b2228, 0x0b2228, 1)
    background.fillRect(0, 0, this.scale.width, this.scale.height)

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) this.drawTile(x, y)
    }
    this.drawPlaza()
    this.drawCafe()
    this.drawDecor()

    this.makePerson('alan', '阿岚', 4, 4, 0xd79a62)
    this.makePerson('weining', '魏宁', 8, 5, 0x6e8fac)
    this.makePerson('suhe', '苏禾', 8, 3, 0x72a48f)
    this.player = this.makePerson('player', '你', this.playerGrid.x, this.playerGrid.y, 0x65c8b5, true)

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
        return
      }
      const node = path[index]
      const point = this.iso(node)
      this.tweens.add({
        targets: this.player,
        x: point.x,
        y: point.y - 14,
        duration: 150,
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

  private drawTile(x: number, y: number) {
    const p = this.iso({ x, y })
    const g = this.add.graphics()
    const road = x > 1 && x < 10 && y > 3 && y < 8
    const color = road ? 0x355157 : ((x + y) % 2 ? 0x294c43 : 0x2d5548)
    g.fillStyle(color, 1).lineStyle(1, 0x416863, 0.48)
    g.beginPath().moveTo(p.x, p.y).lineTo(p.x + 44, p.y + 22).lineTo(p.x, p.y + 44).lineTo(p.x - 44, p.y + 22).closePath().fillPath().strokePath()
  }

  private drawPlaza() {
    const p = this.iso({ x: 5, y: 5 })
    const g = this.add.graphics().setDepth(p.y)
    g.fillStyle(0x536669, 0.95).fillEllipse(p.x, p.y + 18, 270, 145).lineStyle(4, 0x6e7d78, 0.5).strokeEllipse(p.x, p.y + 18, 270, 145)
    g.fillStyle(0x1e493d).fillCircle(p.x, p.y - 8, 42)
    g.fillStyle(0x52755a).fillCircle(p.x, p.y - 25, 57)
    this.add.text(p.x, p.y + 85, '中央广场', { fontFamily: 'system-ui', fontSize: '15px', color: '#f0f5ef', backgroundColor: '#12262ccc', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(p.y + 100)
  }

  private drawCafe() {
    const p = this.iso({ x: 9, y: 2 })
    const g = this.add.graphics().setDepth(p.y + 30)
    g.fillStyle(0x2a2924).fillRect(p.x - 85, p.y - 70, 170, 110)
    g.fillStyle(0x77543b).fillRect(p.x - 73, p.y - 58, 64, 55)
    g.fillStyle(0xe7b86d, 0.85).fillRect(p.x + 12, p.y - 58, 55, 55)
    g.fillStyle(0x173a36).fillTriangle(p.x - 100, p.y - 70, p.x, p.y - 128, p.x + 100, p.y - 70)
    this.add.text(p.x, p.y + 54, '咖啡馆', { fontFamily: 'system-ui', fontSize: '15px', color: '#fff4df', backgroundColor: '#1b2526dd', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(p.y + 120)
  }

  private drawDecor() {
    ;[[1, 2], [2, 1], [10, 7], [3, 9], [11, 3], [7, 8]].forEach(([x, y]) => {
      const p = this.iso({ x, y })
      const g = this.add.graphics().setDepth(p.y + 20)
      g.fillStyle(0x18352f).fillRect(p.x - 4, p.y, 8, 25)
      g.fillStyle(0x476c50).fillCircle(p.x, p.y - 12, 25)
      g.fillStyle(0x5f805c).fillCircle(p.x - 10, p.y - 20, 18)
    })
  }

  private makePerson(id: string, name: string, x: number, y: number, color: number, isPlayer = false) {
    const p = this.iso({ x, y })
    const c = this.add.container(p.x, p.y - 14).setDepth(p.y + 80)
    const shadow = this.add.ellipse(0, 16, 32, 13, 0x051012, 0.42)
    const body = this.add.circle(0, 0, 16, color).setStrokeStyle(isPlayer ? 3 : 2, isPlayer ? 0xb5fff0 : 0xe9e3d0)
    const head = this.add.circle(0, -19, 10, 0xf1c8a6).setStrokeStyle(2, 0x43342c)
    const label = this.add.text(0, 31, name, { fontFamily: 'system-ui', fontSize: '12px', color: '#ffffff', backgroundColor: '#0b1c22d9', padding: { x: 6, y: 3 } }).setOrigin(0.5)
    c.add([shadow, body, head, label])
    if (!isPlayer) {
      c.setSize(54, 72).setInteractive({ useHandCursor: true })
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
