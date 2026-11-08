/**
 * 壁纸与片头 · 宿主半
 *
 * 做三件事：
 *   1. 起一条 /dsh-wallpaper-intro 路由：配置读写、目录列举、WE 扫描、媒体流
 *   2. 在 webserver/index-inject 里推入样式与页面运行时（片头覆盖层 + 背景层）
 *   3. 把本机绝对路径变成只有本进程签得出来的 token URL —— 路由里不出现文件路径
 *
 * 注意：注入行是宿主启动时的一次性快照，所以片头参数改完要完全重启 DSH；
 * 背景配置由页面每次加载重新拉 /config.json，刷新页面即生效。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, saveConfig, mediaKind } from './lib/config.js'
import { MediaTokens, serveMedia } from './lib/media.js'
import { scanWe, currentDesktopWallpaper, findWeDirs } from './lib/we.js'
import { bootstrapScript } from './lib/bootstrap.js'

const BASE = '/dsh-wallpaper-intro'
const here = path.dirname(fileURLToPath(import.meta.url))

function readLocal(name) {
  return fs.readFileSync(path.join(here, name), 'utf8')
}

function readVersion() {
  try {
    return JSON.parse(readLocal('package.json')).version || '0'
  } catch {
    return '0'
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export const inject = ['webServer']

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (!webServer) return

  const tokens = new MediaTokens()
  const version = readVersion()

  function mediaUrl(filePath) {
    if (typeof filePath !== 'string' || filePath === '') return null
    try {
      if (!isFile(filePath)) return null
      if (mediaKind(filePath) === null) return null
      return `${BASE}/media/${tokens.issue(filePath)}`
    } catch {
      return null
    }
  }

  function bootView(cfg) {
    const url = mediaUrl(cfg.boot.file)
    return {
      ...cfg.boot,
      url,
      kind: cfg.boot.file ? mediaKind(cfg.boot.file) : null,
      missing: cfg.boot.file !== '' && url === null,
    }
  }

  function backgroundView(cfg) {
    const url = mediaUrl(cfg.background.file)
    return {
      ...cfg.background,
      url,
      kind: cfg.background.file ? mediaKind(cfg.background.file) : null,
      missing: cfg.background.file !== '' && url === null,
    }
  }

  /** 扫一个目录里的媒体文件（只看一层，按名字排序，上限 300）。 */
  function listMediaFiles(dir) {
    const out = []
    if (!dir) return out
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      if (out.length >= 300) break
      if (!entry.isFile()) continue
      if (mediaKind(entry.name) === null) continue
      out.push(path.join(dir, entry.name))
    }
    out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    return out
  }

  /** 轮播池：WE 勾选列表 或 目录扫描结果，解析成带 token 的条目。 */
  function rotationView(cfg) {
    const r = cfg.rotation
    const pool = []
    if (r.source === 'folder') {
      for (const file of listMediaFiles(r.folder)) pool.push({ file, title: '' })
    } else {
      for (const item of r.items) pool.push({ file: item.file, title: item.title })
    }

    const entries = []
    for (const item of pool.slice(0, 300)) {
      const url = mediaUrl(item.file)
      if (!url) continue
      entries.push({
        url,
        kind: mediaKind(item.file) || 'image',
        title: item.title || path.basename(item.file),
        file: item.file,
      })
    }

    return {
      enabled: r.enabled && entries.length > 1,
      source: r.source,
      intervalMin: r.intervalMin,
      mode: r.mode,
      fadeMs: r.fadeMs,
      poolSize: entries.length,
      entries,
    }
  }

  function configView() {
    const cfg = loadConfig()
    const boot = bootView(cfg)
    const background = backgroundView(cfg)
    const home = os.homedir()
    const folders = [
      { label: '图片', path: path.join(home, 'Pictures') },
      { label: '视频', path: path.join(home, 'Videos') },
      { label: '桌面', path: path.join(home, 'Desktop') },
      { label: '下载', path: path.join(home, 'Downloads') },
    ].filter((f) => {
      try {
        return fs.statSync(f.path).isDirectory()
      } catch {
        return false
      }
    })
    return {
      ok: true,
      version,
      boot,
      background,
      appearance: cfg.appearance,
      autoYield: cfg.we.autoYield,
      overlay: cfg.overlay,
      rotation: rotationView(cfg),
      home,
      folders,
      we: {
        installPath: cfg.we.installPath || findWeDirs()[0] || '',
        detected: findWeDirs(),
      },
    }
  }

  /* ---------------- 索引注入：样式 + 运行时 ---------------- */

  function buildRuntimeScript(boot) {
    const bootCfgSafe = {
      enabled: boot.enabled && !!boot.url,
      durationSec: boot.durationSec,
      fadeMs: boot.fadeMs,
      sound: boot.sound,
      volume: boot.volume,
      hint: boot.hint,
      skipLabel: boot.skipLabel,
      soundLabel: boot.soundLabel,
    }
    const cfg = loadConfig()
    const payload = {
      version,
      base: BASE,
      boot: bootCfgSafe,
      bootUrl: boot.url || '',
      bootKind: boot.kind || 'video',
      appearance: cfg.appearance,
      autoYield: cfg.we.autoYield,
    }
    // 只注入引导脚本；runtime.js / runtime.css 由它按需拉取（见 lib/bootstrap.js 注释）
    return bootstrapScript(BASE, payload)
  }

  ctx.on('webserver/index-inject', (table) => {
    try {
      const cfg = loadConfig()
      const boot = bootView(cfg)
      // 样式与运行时都改成动态加载：注入行本身保持稳定，刷新页面即可拿到新代码
      table.push({ kind: 'script', placement: 'head', text: buildRuntimeScript(boot) })
    } catch (err) {
      // 注入失败绝不许影响页面：什么都不推，DSH 保持原样
    }
  })

  /* ---------------- 路由 ---------------- */

  async function handler(req, res) {
    let pathname = ''
    try {
      pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad url' })
      return
    }
    const rest = pathname.slice(BASE.length)
    const method = (req.method || 'GET').toUpperCase()

    try {
      /* 媒体流（不需要 method 判断，GET/HEAD 都支持） */
      if (rest.startsWith('/media/')) {
        const token = decodeURIComponent(rest.slice('/media/'.length))
        const filePath = tokens.resolve(token)
        if (!filePath) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('unknown media')
          return
        }
        serveMedia(req, res, filePath)
        return
      }

      if (rest === '/config.json' && method === 'GET') {
        sendJson(res, 200, configView())
        return
      }

      // 运行时与样式：每次现读磁盘 + no-store —— 改了刷新页面就生效，不必重启宿主
      if ((rest === '/runtime.js' || rest === '/runtime.css') && (method === 'GET' || method === 'HEAD')) {
        try {
          const body = readLocal(rest.slice(1))
          res.writeHead(200, {
            'Content-Type': rest.endsWith('.js')
              ? 'text/javascript; charset=utf-8'
              : 'text/css; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Length': Buffer.byteLength(body),
          })
          res.end(method === 'HEAD' ? undefined : body)
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('missing runtime asset')
        }
        return
      }

      if (rest === '/config' && method === 'POST') {
        const raw = await readBody(req)
        let patch
        try {
          patch = JSON.parse(raw || '{}')
        } catch {
          sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
          return
        }
        if (!patch || typeof patch !== 'object') {
          sendJson(res, 400, { ok: false, error: '请求体必须是对象' })
          return
        }
        saveConfig(patch)
        sendJson(res, 200, configView())
        return
      }

      if (rest === '/scan-we' && (method === 'POST' || method === 'GET')) {
        const result = scanWe({ force: true })
        const entries = result.entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          type: entry.type,
          source: entry.source,
          playable: entry.playable,
          previewUrl: entry.preview ? mediaUrl(entry.preview) : null,
          url: entry.playable && entry.file ? mediaUrl(entry.file) : null,
          file: entry.file || entry.preview || '',
        }))
        const current = currentDesktopWallpaper()
        sendJson(res, 200, {
          ok: true,
          dirs: result.dirs,
          total: result.total,
          playable: result.playable,
          counts: result.counts,
          problems: result.problems,
          current: current
            ? {
                raw: current.raw,
                file: current.file,
                url: current.file ? mediaUrl(current.file) : null,
                kind: current.file ? mediaKind(current.file) : null,
                title: path.basename(current.file || current.raw || ''),
              }
            : null,
          entries,
        })
        return
      }

      if (rest === '/pick-capability' && method === 'GET') {
        // 只报告能力，不弹窗（用来给界面判断要不要显示「选文件夹」）
        const controller = ctx.get('directoryPickerController')
        sendJson(res, 200, {
          ok: true,
          available: !!(controller && typeof controller.pick === 'function'),
        })
        return
      }

      if (rest === '/pick' && method === 'POST') {
        // 系统文件夹选择器：客户端拿不到远程命名空间时的兜底
        try {
          const controller = ctx.get('directoryPickerController')
          if (!controller || typeof controller.pick !== 'function') {
            sendJson(res, 200, { ok: false, error: '这个版本没有可用的系统文件夹选择器' })
            return
          }
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), 120000)
          let picked = null
          try {
            picked = await controller.pick(ac.signal)
          } finally {
            clearTimeout(timer)
          }
          sendJson(res, 200, { ok: !!picked, path: picked || '' })
        } catch (error) {
          sendJson(res, 200, { ok: false, error: '打开选择器失败：' + String((error && error.message) || error) })
        }
        return
      }

      if (rest === '/desktop-wallpaper' && method === 'GET') {
        const current = currentDesktopWallpaper()
        sendJson(res, 200, {
          ok: true,
          current: current
            ? {
                raw: current.raw,
                file: current.file,
                url: current.file ? mediaUrl(current.file) : null,
                kind: current.file ? mediaKind(current.file) : null,
                title: path.basename(current.file || current.raw || ''),
              }
            : null,
        })
        return
      }

      if (rest === '/list' && method === 'GET') {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const target = url.searchParams.get('path') || ''
        if (!target || !path.isAbsolute(target)) {
          sendJson(res, 400, { ok: false, error: '需要绝对路径' })
          return
        }
        let stat
        try {
          stat = fs.statSync(target)
        } catch {
          sendJson(res, 404, { ok: false, error: '路径不存在' })
          return
        }
        if (!stat.isDirectory()) {
          sendJson(res, 400, { ok: false, error: '不是目录' })
          return
        }
        const dirs = []
        const files = []
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
          const full = path.join(target, entry.name)
          if (entry.isDirectory()) {
            dirs.push({ name: entry.name, path: full })
            continue
          }
          if (!entry.isFile()) continue
          const kind = mediaKind(entry.name)
          if (!kind) continue
          let size = 0
          try {
            size = fs.statSync(full).size
          } catch {
            size = 0
          }
          files.push({ name: entry.name, path: full, kind, size, url: mediaUrl(full) })
        }
        dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
        files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
        sendJson(res, 200, { ok: true, path: target, parent: path.dirname(target), dirs, files })
        return
      }

      if (rest === '/replay-boot' && method === 'POST') {
        // 只回一个提示：真正的重播在页面里由 window.__WPS__.replayBoot() 完成
        sendJson(res, 200, { ok: true, hint: '在页面控制台执行 window.__WPS__.replayBoot() 可重播片头' })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not found', path: rest })
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
      } else {
        try {
          res.end()
        } catch {
          /* 已断开 */
        }
      }
    }
  }

  ctx.effect(() => {
    const off = webServer.register({ kind: 'prefix', path: BASE, handler })
    return () => off()
  })
}
