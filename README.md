# 雨后小镇（After Rain Town）

一款面向桌面浏览器的等距视角 AI 小镇游戏。玩家作为刚搬来的居民，在 15:40—18:00 之间观察三名 NPC 的自主生活，并介入逐步关联的雨后茶会事件。

![雨后小镇游戏界面](outputs/game-preview.png)

## 当前可玩内容

- 等距单屏地图、雨景动画、固定镜头和 A* 网格寻路
- 三名 NPC：活动策划人阿岚、插画师魏宁、咖啡馆店主苏禾
- 基础日程、事件改道、NPC 背景气泡和自主相遇
- 三个弱关联主要事件：茶会筹备、创意分歧、黄昏聚会
- 玩家可加入、帮忙、调解或离开，再选择温和、直接或幽默态度
- 每名 NPC 最多 10 条近期记忆、3 条长期印象，全局最多 20 次自由对话
- 玩家与 NPC、NPC 与 NPC 的双向关系和 18:00 世界结算
- 失败、普通成功、完美成功三种结果
- 浏览器自动存档，以及 Java/PostgreSQL 匿名会话快照
- 真实 AI、备用模型和内置演示回复三级降级

## 技术结构

```text
game-ui   React 19 + TypeScript + Phaser 3 + Vite
game-api  Java 17 + Spring Boot 3.5 + JPA + PostgreSQL
```

模型接口仅由后端访问，API Key 不会进入前端包。自由对话支持流式输出；主要事件生成每名参与者的一句关键回应，约 5 秒超时后无感切换为内置台词。位置、日程、关系和事件结果始终由本地规则结算。

## 本地运行

要求 Node.js 20+、Java 17+、Maven 3.9+。不安装 PostgreSQL也可以使用内存数据库运行开发版。

后端：

```bash
cd game-api
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

前端：

```bash
cd game-ui
npm install
npm run dev -- --port 5174
```

打开 `http://localhost:5174`。没有配置 AI Key 时，完整游戏仍可使用内置演示回复跑通。

如需测试真实模型，在后端运行环境中设置：

```text
AI_API_KEY=学校平台中的密钥
AI_BASE_URL=https://api.llm.ustc.edu.cn/v1
```

不要把真实密钥写进仓库或前端环境变量。

## 验证

```bash
cd game-ui && npm run build
cd game-api && mvn test
```

后端测试覆盖初始世界创建与恢复、AI 缺失时自动降级、20 次对话计数、每名 NPC 10 条记忆上限和客户端快照保存。

## 面试演示路线（约 5 分钟）

1. 输入姓名进入小镇，点击不同位置展示绕障碍寻路。
2. 点击 NPC 或右侧姓名切换角色，说明其状态、目标和独立记忆。
3. 等待 16:00 的“雨后茶会筹备”，观察顶部通知、地图光圈和 NPC 特殊气泡。
4. 选择“帮忙 → 温和”，修改推荐台词并完成单回合事件结算。
5. 在 16:45 调解魏宁与苏禾的创意分歧，打开“影响世界”查看双向关系变化。
6. 切换“真实 AI / 稳定演示”，说明 5 秒超时后事件仍可完整跑通。
7. 在 17:30 完成黄昏聚会，18:00 查看关系和长期印象结算。

## 部署

### 前端：Vercel

1. 导入本仓库，将 Root Directory 设为 `game-ui`。
2. 添加 `VITE_API_URL=https://你的后端.onrender.com`。
3. 使用 Hobby 方案部署。

### 后端与数据库：Render

1. 选择 New Blueprint 并导入仓库根目录的 `render.yaml`。
2. 首次创建时填写 `FRONTEND_ORIGIN`（Vercel 地址）和 `AI_API_KEY`。
3. 等待 `/actuator/health` 通过，再把后端地址填回 Vercel。

零成本方案适合面试和短期体验，但免费后端会休眠，首次访问可能较慢；免费 PostgreSQL 目前会在 30 天后到期。面试前可按已确定方案升级后端，避免冷启动。

## 安全与范围

- API Key 只存于后端密钥环境变量。
- 每局服务端最多接受 20 次自由对话，请求文本最多 200 字。
- AI 回复为空、超时或异常时不阻塞游戏。
- 本版本不包含登录、多人同步、房屋室内场景与移动端适配。
