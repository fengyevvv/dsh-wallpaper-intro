/**
 * 用真实的引导脚本生成一个测试页，模拟桌面壳把注入行塞进 <head> 的效果。
 * 这样测试页和插件注入的内容不会各写一份、慢慢跑偏。
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootstrapScript } from '../lib/bootstrap.js'

const bootUrl = process.env.WPS_BOOT_URL || ''
const rotUrls = (process.env.WPS_ROT_URLS || '').split(',').map((s) => s.trim()).filter(Boolean)

const config = {
  version: '0.1.0',
  base: '/dsh-wallpaper-intro',
  boot: {
    enabled: !!bootUrl,
    fadeMs: 900,
    sound: false,
    volume: 0.8,
    hint: '正在启动…',
    skipLabel: '点击画面跳过',
    soundLabel: '开启声音',
  },
  bootUrl: bootUrl,
  bootKind: 'video',
  appearance: { veil: 0.14, blur: 0, surface: 0.2, surfaceLight: 0.55 },
  autoYield: true,
  rotation: rotUrls.length >= 2
    ? {
        enabled: true,
        source: 'list',
        intervalMin: 0.05, // 3 秒，仅测试用
        mode: 'sequential',
        fadeMs: 400,
        poolSize: rotUrls.length,
        entries: rotUrls.map((url, i) => ({ url, kind: 'video', title: 'clip ' + (i + 1), file: url })),
      }
    : undefined,
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>injection bootstrap test</title>
<script>${bootstrapScript('/dsh-wallpaper-intro', config)}</script>
<style>
  html, body { margin: 0; height: 100%; }
  body {
    --dsw-alias-bg-base: #15161a;
    --dsw-specific-sidebar-fill: #101114;
    background: var(--dsw-alias-bg-base);
    color: #e9eaee;
    font-family: "Microsoft YaHei UI", sans-serif;
  }
  .wrap { padding: 40px; font-size: 14px; }
</style>
</head>
<body>
<div class="wrap">这段文字由页面自身渲染；壁纸由「引导脚本 → 动态加载 runtime.js」提供。</div>
</body>
</html>
`

fs.writeFileSync(path.join(process.cwd(), 'tests', 'injection.html'), html)
console.log('written tests/injection.html', html.length, 'bytes')
