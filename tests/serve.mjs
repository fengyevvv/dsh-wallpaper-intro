/**
 * 本地验证服务器（只在开发时用，不进插件运行时）。
 *
 *   /runtime-boot.html     注入运行时的片头覆盖层测试
 *   /runtime-backdrop.html 注入运行时的背景层测试
 *   /settings-harness.html 用真 React 渲染设置页 UI
 *   /runtime.js /runtime.css /client.js   从包根提供
 *   /vendor/*              React UMD（测试脚手架）
 *   /dsh-wallpaper-intro/* → 反代到真实宿主（WPS_HOST 或自动探测），保持同源
 *
 * HTML 每次请求现读，避免改完文件还要重启。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const TESTS = path.join(ROOT, 'tests')
const PORT = Number(process.env.WPS_TEST_PORT || 8901)

/** 宿主的端口每次重启都会变，这里探一遍常见候选。 */
async function discoverHost() {
  if (process.env.WPS_HOST) return process.env.WPS_HOST
  const candidates = [9144, 6451, 3596, 10485, 10631, 1120, 3080]
  for (const port of candidates) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/dsh-wallpaper-intro/config.json`)
      if (res.ok) return `http://127.0.0.1:${port}`
    } catch {
      /* 换下一个 */
    }
  }
  console.warn('⚠ 没探到 DSH 宿主端口，请用 WPS_HOST=http://127.0.0.1:<port> 指定')
  return `http://127.0.0.1:${candidates[0]}`
}

const HOST = await discoverHost()
console.log('host =', HOST)

async function html(name) {
  const raw = fs.readFileSync(path.join(TESTS, name), 'utf8')
  // 测试页里写死了宿主的绝对地址，同源代理后要去掉
  let out = raw.replace(/http:\/\/127\.0\.0\.1:\d+\/dsh-wallpaper-intro/g, '/dsh-wallpaper-intro')
  // 占位符换成当前真实的媒体地址（token 是进程内生成的，不能写死）
  if (out.includes('__WPS_BG_URL__')) {
    let url = ''
    try {
      const conf = await (await fetch(HOST + '/dsh-wallpaper-intro/config.json')).json()
      url = conf.background && conf.background.url ? conf.background.url : ''
    } catch {
      url = ''
    }
    out = out.replace(/__WPS_BG_URL__/g, url)
  }
  return out
}

function sendFile(res, file, type) {
  try {
    const body = fs.readFileSync(file)
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found: ' + file)
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const p = url.pathname

  // 模拟宿主新增的运行时路由（宿主跑旧代码时也能测浏览器侧机制）
  if (p === '/dsh-wallpaper-intro/runtime.js' || p === '/dsh-wallpaper-intro/runtime.css') {
    const isJs = p.endsWith('.js')
    return sendFile(
      res,
      path.join(ROOT, isJs ? 'runtime.js' : 'runtime.css'),
      isJs ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
    )
  }

  // 合成一份带轮播池的配置：宿主还没重启时也能测运行时轮播
  if (p === '/dsh-wallpaper-intro/config.json' && process.env.WPS_SYNTH_ROTATION) {
    try {
      const real = await (await fetch(HOST + p)).json()
      const urls = process.env.WPS_SYNTH_ROTATION.split(',').map((s) => s.trim()).filter(Boolean)
      real.rotation = {
        enabled: true,
        source: 'list',
        intervalMin: Number(process.env.WPS_SYNTH_INTERVAL || 0.05), // 分钟
        mode: process.env.WPS_SYNTH_MODE || 'sequential',
        fadeMs: 400,
        poolSize: urls.length,
        items: urls.map((url, i) => ({ file: url, title: 'clip ' + (i + 1), kind: 'video' })),
        entries: urls.map((url, i) => ({ url, kind: 'video', title: 'clip ' + (i + 1), file: url })),
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      return res.end(JSON.stringify(real))
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('synth config failed: ' + String(e && e.message))
    }
  }

  if (p.startsWith('/dsh-wallpaper-intro/')) {
    try {
      const target = HOST + p + url.search
      const headers = {}
      if (req.headers.range) headers.range = req.headers.range
      const up = await fetch(target, { method: req.method, headers })
      res.writeHead(up.status, {
        'content-type': up.headers.get('content-type') || 'application/octet-stream',
        'content-range': up.headers.get('content-range') || '',
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      })
      res.end(Buffer.from(await up.arrayBuffer()))
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('proxy failed: ' + String(e && e.message))
    }
    return
  }

  if (p.endsWith('.html')) {
    const file = path.join(TESTS, path.basename(p))
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      return res.end('no such test page')
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(await html(path.basename(p)))
  }
  if (p === '/runtime.js') return sendFile(res, path.join(ROOT, 'runtime.js'), 'text/javascript; charset=utf-8')
  if (p === '/runtime.css') return sendFile(res, path.join(ROOT, 'runtime.css'), 'text/css; charset=utf-8')
  if (p === '/client.js') return sendFile(res, path.join(ROOT, 'client.js'), 'text/javascript; charset=utf-8')
  if (p.startsWith('/vendor/')) return sendFile(res, path.join(TESTS, p.slice(1)), 'text/javascript; charset=utf-8')

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`test server on http://127.0.0.1:${PORT} (proxy -> ${HOST})`)
})
