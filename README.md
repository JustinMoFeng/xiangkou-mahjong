# 巷口麻将

一个本地四人网页麻将 MVP。第一版目标是快速能玩：你坐下方，三名机器人陪打，支持摸牌、出牌、自摸、点炮胡、流局和基础倍率结算。

首页可以选择玩法：**巷口麻将** 或 **川麻·血战到底**。两套规则引擎相互独立，进度分别保存在本机浏览器。

## 入口

- `/`：游戏大厅，选择麻将玩法。
- `/game/xiangkou`：巷口麻将开桌方式，当前开放 `人机练习`，`朋友房间` 敬请期待。
- `/play/xiangkou/bot`：巷口麻将人机牌桌。
- `/game/sichuan`：川麻·血战到底牌桌。
- 兼容旧入口：`/classic`、`/sichuan`、`?mode=classic`、`?mode=sichuan`。

## 规则（经典）

- 使用 136 张基础牌：万、筒、条、东南西北中发白。
- 胡牌检测为标准型：4 组面子 + 1 对将。
- 垃圾胡不是胡牌限制，而是最低倍率：任何合法胡牌都可以胡，最低 1 倍。
- 额外倍率：自摸 +1、碰碰胡 +2、清一色 +4、字牌刻子每组 +1。
- 第一版暂不实现吃、碰、杠、花牌和真人联机。

## 规则（川麻·血战到底）

- 使用 108 张牌：只有万、筒、条，没有字牌。
- **开局定缺**：每人选一门要缺的花色，手里不能留缺门牌，否则不能胡。
- **只碰杠不吃**：支持碰、直杠（明杠）、暗杠、补杠（可被抢杠胡）与杠上开花。
- **血战到底**：胡牌者亮牌离场，其余人继续，直到只剩一家或牌墙摸完。支持一炮多响。
- **番型（番数相加，底分 × 2^番，封顶 8 番）**：平胡、对对胡、清一色、七对、将对、金钩钓、根（每根 +1）、自摸、杠上开花/杠上炮、抢杠胡、海底捞月、天胡、地胡。
- **刮风下雨**：杠分即时结算——直杠放杠者付，暗杠/补杠各家付。
- **流局结算**：查大叫（未听赔听牌家其最大叫番值）、查花猪（三门齐赔付）、退税（未听/花猪退还本局杠分）。

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

## 打包与发布

Web/PWA 打包：

```bash
npm run build
```

打包产物在 `dist/`，可直接部署到 Vercel、Netlify、Cloudflare Pages、GitHub Pages、nginx 静态目录或任意静态网站服务。

GitHub Actions 会在 `dev` 分支 push 后自动构建并发布到 GitHub Pages。`main` 用作稳定主线，建议通过 PR 合入。

手机建议横屏游玩。支持 PWA manifest 和 service worker，部署到 HTTPS 后，Android 和 iOS Safari 可以通过浏览器“添加到主屏幕”使用。

## 素材

牌面使用 `tilekit` 生成的本地 SVG 图片，文件位于 `public/tiles/`，包含 34 种基础牌和背面牌。万、筒、条、风牌、箭牌都会以正常麻将牌图案显示，不依赖外链图片。
