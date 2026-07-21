# 巷口麻将

一个本地四人网页麻将 MVP。第一版目标是快速能玩：你坐下方，三名机器人陪打，支持摸牌、出牌、自摸、点炮胡、流局和基础倍率结算。

## 规则

- 使用 136 张基础牌：万、筒、条、东南西北中发白。
- 胡牌检测为标准型：4 组面子 + 1 对将。
- 垃圾胡不是胡牌限制，而是最低倍率：任何合法胡牌都可以胡，最低 1 倍。
- 额外倍率：自摸 +1、碰碰胡 +2、清一色 +4、字牌刻子每组 +1。
- 第一版暂不实现吃、碰、杠、花牌和真人联机。

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

手机建议横屏游玩。支持 PWA manifest 和 service worker，部署到 HTTPS 后，Android 和 iOS Safari 可以通过浏览器“添加到主屏幕”使用。

## 素材

牌面使用 `tilekit` 生成的本地 SVG 图片，文件位于 `public/tiles/`，包含 34 种基础牌和背面牌。万、筒、条、风牌、箭牌都会以正常麻将牌图案显示，不依赖外链图片。
