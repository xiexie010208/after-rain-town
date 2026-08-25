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

  preload() {
    this.load.spritesheet('town-characters', '/characters-v2.png', {
      frameWidth: 627,
      frameHeight: 627,
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
    const background = this.add.graphics()
    background.fillGradientStyle(0x17343a, 0x17343a, 0x0b2228, 0x0b2228, 1)
    background.fillRect(0, 0, this.scale.width, this.scale.height)

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) this.drawTile(x, y)
    }
    this.drawPlaza()
    this.drawCafe()
    this.drawNoticeBoard()
    this.drawDecor()

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
    g.fillStyle(0x243f3c).fillEllipse(p.x, p.y + 12, 88, 42)
    g.fillStyle(0x8a6348).fillEllipse(p.x, p.y + 5, 72, 30)
    g.fillStyle(0xd7b16f).fillEllipse(p.x, p.y, 65, 23)
    g.fillStyle(0xe8d7ac).fillCircle(p.x - 18, p.y - 4, 5).fillCircle(p.x + 12, p.y + 2, 5)
    g.fillStyle(0x9a6d4c).fillRect(p.x - 31, p.y + 11, 7, 25).fillRect(p.x + 24, p.y + 11, 7, 25)
    this.add.text(p.x, p.y + 85, '中央广场', { fontFamily: 'system-ui', fontSize: '15px', color: '#f0f5ef', backgroundColor: '#12262ccc', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(p.y + 100)
  }

  private drawCafe() {
    const p = this.iso({ x: 9, y: 2 })
    const g = this.add.graphics().setDepth(p.y + 30)
    g.fillStyle(0x1b2423).fillRect(p.x - 88, p.y - 74, 176, 116)
    g.fillStyle(0x654934).fillRect(p.x - 78, p.y - 64, 156, 98)
    g.fillStyle(0x253834).fillRect(p.x - 19, p.y - 38, 38, 72)
    g.fillStyle(0x3d2921).fillRect(p.x - 13, p.y - 31, 26, 65)
    g.fillStyle(0xe5b86e, 0.92).fillRect(p.x - 67, p.y - 52, 36, 35).fillRect(p.x + 31, p.y - 52, 36, 35)
    g.lineStyle(3, 0x5b3d2e, 1).strokeRect(p.x - 67, p.y - 52, 36, 35).strokeRect(p.x + 31, p.y - 52, 36, 35)
    g.fillStyle(0xe7d1a3).fillRect(p.x - 75, p.y - 72, 150, 15)
    for (let i = 0; i < 6; i++) g.fillStyle(i % 2 ? 0xb85f49 : 0xf0d9af).fillRect(p.x - 75 + i * 25, p.y - 72, 25, 15)
    g.fillStyle(0x183a35).fillTriangle(p.x - 103, p.y - 74, p.x, p.y - 133, p.x + 103, p.y - 74)
    g.fillStyle(0x8e5d43).fillRect(p.x + 50, p.y - 126, 18, 39)
    g.fillStyle(0xe7c47f).fillCircle(p.x + 7, p.y - 2, 3)
    this.add.text(p.x, p.y - 87, '雨巷咖啡', { fontFamily: 'serif', fontStyle: 'bold', fontSize: '15px', color: '#ffe5ac' }).setOrigin(0.5).setDepth(p.y + 31)
    this.add.text(p.x, p.y + 54, '咖啡馆', { fontFamily: 'system-ui', fontSize: '15px', color: '#fff4df', backgroundColor: '#1b2526e8', padding: { x: 10, y: 6 } }).setOrigin(0.5).setDepth(p.y + 120)
  }

  private drawNoticeBoard() {
    const p = this.iso({ x: 3, y: 5 })
    const c = this.add.container(p.x, p.y - 5).setDepth(p.y + 72)
    const shadow = this.add.ellipse(0, 29, 62, 18, 0x071315, 0.34)
    const g = this.add.graphics()
    g.fillStyle(0x5d402d).fillRect(-29, -37, 58, 49)
    g.fillStyle(0xd3b777).fillRect(-24, -32, 48, 38)
    g.fillStyle(0xefe2bd).fillRect(-18, -25, 18, 14).fillRect(4, -18, 14, 17)
    g.fillStyle(0xb85e4d).fillCircle(-15, -22, 2).fillCircle(9, -15, 2)
    g.fillStyle(0x4d3527).fillRect(-20, 10, 6, 24).fillRect(14, 10, 6, 24)
    const label = this.add.text(0, 44, '公告栏', { fontFamily: 'system-ui', fontStyle: 'bold', fontSize: '12px', color: '#fff3d3', backgroundColor: '#583b2de8', padding: { x: 7, y: 4 } }).setOrigin(0.5)
    c.add([shadow, g, label]).setSize(72, 82).setInteractive({ useHandCursor: true })
    c.on('pointerover', () => label.setBackgroundColor('#a05c38ee'))
    c.on('pointerout', () => label.setBackgroundColor('#583b2de8'))
    c.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      window.dispatchEvent(new CustomEvent('rain-town:notice-open'))
    })
  }

  private drawDecor() {
    ;[[1, 2], [2, 1], [10, 7], [3, 9], [11, 3], [7, 8]].forEach(([x, y]) => {
      const p = this.iso({ x, y })
      const g = this.add.graphics().setDepth(p.y + 20)
      g.fillStyle(0x18352f).fillRect(p.x - 4, p.y, 8, 25)
      g.fillStyle(0x476c50).fillCircle(p.x, p.y - 12, 25)
      g.fillStyle(0x5f805c).fillCircle(p.x - 10, p.y - 20, 18)
    })

    ;[[2, 5], [6, 8], [10, 5]].forEach(([x, y]) => {
      const p = this.iso({ x, y })
      const g = this.add.graphics().setDepth(p.y + 18)
      g.fillStyle(0x263a39).fillRect(p.x - 2, p.y - 28, 4, 43)
      g.fillStyle(0xf2d18a, 0.82).fillCircle(p.x, p.y - 31, 8)
      g.lineStyle(2, 0xd9bd7d, 0.26).strokeCircle(p.x, p.y - 31, 13)
    })

    ;[[3, 7], [7, 6], [9, 7]].forEach(([x, y], index) => {
      const p = this.iso({ x, y })
      const puddle = this.add.ellipse(p.x + 7, p.y + 24, 42 + index * 5, 13, 0x88b9bd, 0.2).setDepth(p.y + 3)
      puddle.setStrokeStyle(1, 0xb9d8d8, 0.28)
    })
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
