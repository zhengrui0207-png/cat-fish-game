# 小猫抓鱼 3D 小游戏

根据《小猫抓鱼》V1.0 PRD 实现的 Three.js 浏览器小游戏，支持手机和桌面浏览器打开即玩。

## 本地运行

```bash
npm install
npm run dev
```

## 测试与构建

```bash
npm run test:logic
npm run build
```

## 线上地址

<http://8.141.101.70/xiaomao-zhuayu-3d-2026/>

生产文件部署在阿里云 ECS 的 `/var/www/cat-fishing-3d/current`，由 Nginx 以 `/xiaomao-zhuayu-3d-2026/` 路径提供静态服务。
