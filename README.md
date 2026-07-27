# 巷口麻将

一个本地四人网页麻将 MVP。当前包含两套本地人机玩法：项目自定义的 `巷口麻将`，以及 `川麻 · 血战到底`。两套规则引擎相互独立，进度分别保存在本机浏览器。

首页可以选择玩法：**巷口麻将** 或 **川麻 · 血战到底**。每个玩法先进入开桌方式页；巷口麻将当前开放人机牌桌和朋友房间，川麻当前开放人机牌桌。

## 入口

- `/`：游戏大厅，选择麻将玩法。
- `/game/xiangkou`：巷口麻将开桌方式，开放 `人机练习` 和 `朋友房间`。
- `/play/xiangkou/bot`：巷口麻将人机牌桌。
- `/play/xiangkou/room/create`：创建巷口麻将朋友房间。
- `/play/xiangkou/room`、`/play/xiangkou/room/:roomCode`：输入房间号或带房间号加入朋友房间。
- `/game/sichuan`：川麻开桌方式，当前开放 `人机血战`，`朋友房间` 敬请期待。
- `/play/sichuan/bot`：川麻 · 血战到底人机牌桌。
- 兼容旧入口：`/classic`、`/sichuan`、`?mode=classic`、`?mode=sichuan`。

## 规则（经典）

- 使用 136 张基础牌：万、筒、条、东南西北中发白。
- 胡牌检测为标准型：4 组面子 + 1 对将。
- 垃圾胡不是胡牌限制，而是最低倍率：任何合法胡牌都可以胡，最低 1 倍。
- 额外倍率：自摸 +1、碰碰胡 +2、清一色 +4、字牌刻子每组 +1。
- 支持吃、碰、明杠；朋友房间第一版使用房主权威 WebRTC 同步，空座会由机器人补位。
- 牌桌设置里可以改四家名字，名字会保存在本机浏览器。

## 巷口麻将朋友房间

- 前端仍由 EdgeOne Pages 托管，`functions/api/rooms/*` 提供房间登记和 WebRTC 信令交换。
- EdgeOne KV 只保存短期房间元数据和 offer/answer/ICE 信令，不保存完整牌局。
- 浏览器之间通过 WebRTC DataChannel 同步牌局；房主浏览器持有完整 `GameState` 并负责发牌、摸牌、出牌、吃碰杠胡和机器人决策。
- 加入者只发送操作意图，房主校验合法性后广播完整状态快照；非本人手牌和牌山会在快照中隐藏。
- 部署时需要给 EdgeOne Functions 绑定 KV，推荐变量名 `ROOMS_KV`。

## 巷口麻将朋友房间 · Cloudflare 方案（实验分支）

`feature/cloudflare-online` 分支提供一套**服务端权威**的联机实现，覆盖巷口麻将与川麻两种玩法，作为 EdgeOne P2P 方案的替代（EdgeOne 相关代码保持不动）。

- 一个房间对应一个 Cloudflare **Durable Object**（`worker/GameRoom.ts`），DO 单实例强一致地持有完整游戏状态，直接复用现有引擎与 `applyHostPlayerAction` / `maskStateForSeat`（川麻为 `applySichuanHostPlayerAction` / `maskSichuanStateForSeat`）。
- `GameRoom` 通过 `worker/adapters.ts` 的 `GameAdapter` 按房间种别（`kind=xiangkou|sichuan`）切换引擎、动作校验、遮牌和机器人循环；建房时用 `POST /api/rooms?kind=sichuan` 指定玩法。
- 所有玩家通过 **WebSocket** 连接同一个 DO，只发送操作、只接收按座位遮牌后的快照；**没有房主浏览器、没有 P2P**，任何人掉线都能用同一 `clientId` 重连回原座位与最新牌局。
- 机器人回合与自动摸牌由 DO 内的 `setTimeout` 驱动（`src/online/autoplay.ts` 抽出的纯函数，川麻额外处理定缺阶段与已胡玩家跳过），节奏与本地一致。
- 本地开发：`npm run cf:dev`（构建后用 `wrangler dev` 起 DO）。前端用 `VITE_ONLINE_BACKEND=cloudflare` 把巷口与川麻的朋友房间入口切换到云端，默认仍走 EdgeOne。
- 自动部署：GitHub Actions（`.github/workflows/deploy-cloudflare.yml`）在 push 到 `feature/cloudflare-online` 时运行单测+worker 类型检查，用 `VITE_ONLINE_BACKEND=cloudflare` 构建后 `wrangler deploy`。需在仓库配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` secrets。手动兜底用 `npm run cf:deploy`。
- 线上地址：自定义域名 `majong-cloud.9423.net`（与 EdgeOne 的 `majong.9423.net` 相互独立），另有 `xiangkou-mahjong.<子域>.workers.dev` 备用。
- 注意：Cloudflare 在中国大陆的连通性弱于 EdgeOne，是否切换需结合用户地域权衡。

## 规则（川麻·血战到底）

- 使用 108 张牌：只有万、筒、条，没有字牌。
- **开局定缺**：每人选一门要缺的花色，手里不能留缺门牌，否则不能胡。
- **只碰杠不吃**：支持碰、直杠（明杠）、暗杠、补杠（可被抢杠胡）与杠上开花。
- **血战到底**：胡牌者亮牌离场，其余人继续，直到只剩一家或牌墙摸完。支持一炮多响。
- **番型（番数相加，底分 × 2^番，封顶 8 番）**：平胡、对对胡、清一色、七对、将对、金钩钓、根（每根 +1）、自摸、杠上开花/杠上炮、抢杠胡、海底捞月、天胡、地胡。
- **刮风下雨**：杠分即时结算——直杠放杠者付，暗杠/补杠各家付。
- **流局结算**：查大叫（未听赔听牌家其最大叫番值）、查花猪（三门齐赔付）、退税（未听/花猪退还本局杠分）。
- 定缺选择不会遮住手牌，可以先看牌再决定缺哪门。
- 川麻牌桌提供规则帮助，说明基本规则、番型和结算项。

## 开发

如果系统 Homebrew Node 因 `libllhttp.9.3.dylib` 崩溃，使用本机 NVM Node：

```bash
PATH=/Users/bytedance/.nvm/versions/node/v22.22.1/bin:$PATH npm install
PATH=/Users/bytedance/.nvm/versions/node/v22.22.1/bin:$PATH npm run dev
```

常用命令：

```bash
npm run generate:tiles
npm run test
npm run test:e2e
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

## 分支与协作流程

- Agent 日常开发提交到 `xc_dev`。
- 不手动部署，不主动创建 MR/PR。
- 需要提 MR/PR 时，先把最新 `dev` 合入 `xc_dev`，确认无冲突后再继续。
- 提 MR/PR 的流程是：`xc_dev -> dev`，再由 `dev -> main`。
- `main` 是受保护的生产分支，只通过 MR/PR 合入。

## 打包与发布

Web/PWA 打包：

```bash
npm run build
```

打包产物在 `dist/`。当前生产发布使用 Tencent EdgeOne，不使用 GitHub Pages。

GitHub Actions 在 PR 阶段只做检查；代码合入 `main` 后才自动构建并部署到 EdgeOne。

手机建议横屏游玩。支持 PWA manifest 和 service worker，部署到 HTTPS 后，Android 和 iOS Safari 可以通过浏览器“添加到主屏幕”使用。

## 素材

牌面使用 `tilekit` 生成的本地 SVG 图片，文件位于 `public/tiles/`，包含 34 种基础牌和背面牌。万、筒、条、风牌、箭牌都会以正常麻将牌图案显示，不依赖外链图片。
