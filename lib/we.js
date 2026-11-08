/**
 * Wallpaper Engine 发现与扫描（只读）。
 *
 * 三处必须小心（都是实测踩出来的）：
 *   1. project.json 的 type 大小写不统一（本机 25/187 写成 Video/Scene/Web），不 toLowerCase 会静默漏 13%。
 *   2. scene 壁纸常声明 file: "scene.json" 但目录里只有 scene.pkg —— 必须自己探候选。
 *   3. file / preview 是外部可控输入，解析后要做目录包含检查，别跟着它跑出壁纸目录。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const WORKSHOP_APPID = '431960'
const MEDIA_EXT = new Set(['.mp4', '.webm', '.ogv', '.m4v', '.mov'])
const PREVIEW_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function regQuery(key, value) {
  try {
    const out = execFileSync('reg', ['query', key, '/v', value], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000,
    })
    const m = /REG_(?:SZ|EXPAND_SZ)\s+(.+)/i.exec(out)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

/** 解析后必须仍在 dir 里面，否则视为无效（防路径穿越）。 */
function inside(dir, candidate) {
  const resolved = path.resolve(candidate)
  const base = path.resolve(dir)
  return resolved === base || resolved.startsWith(base + path.sep) ? resolved : null
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Steam 根目录（注册表）与它的库盘列表。 */
function steamRoots() {
  const roots = []
  const steamPath = regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath')
  if (steamPath) roots.push(steamPath.replace(/\//g, '\\'))

  for (const root of roots.slice()) {
    const vdf = path.join(root, 'steamapps', 'libraryfolders.vdf')
    let text = ''
    try {
      text = fs.readFileSync(vdf, 'utf8')
    } catch {
      continue
    }
    const re = /"path"\s+"((?:[^"\\]|\\.)+)"/g
    let m
    while ((m = re.exec(text)) !== null) {
      const p = m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"')
      if (p && !roots.includes(p)) roots.push(p)
    }
  }
  return roots
}

/** 所有可能的 wallpaper_engine 安装目录（去重，只保留存在的）。 */
export function findWeDirs() {
  const found = []
  const seen = new Set()
  const push = (p) => {
    if (!p) return
    let dir
    try {
      dir = path.resolve(p)
    } catch {
      return
    }
    // Windows 路径大小写不敏感：D:\Steam 与 d:\steam 是同一个目录
    const key = dir.toLowerCase()
    if (seen.has(key)) return
    if (!isDir(dir)) return
    seen.add(key)
    found.push(dir)
  }

  const installPath = regQuery('HKCU\\Software\\WallpaperEngine', 'installPath')
  if (installPath) push(path.dirname(installPath))

  for (const root of steamRoots()) {
    push(path.join(root, 'steamapps', 'common', 'wallpaper_engine'))
  }

  // 兜底：按盘符扫常见位置（注册表读不到时）
  if (found.length === 0) {
    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`
      if (!isDir(drive)) continue
      push(path.join(drive, 'Steam', 'steamapps', 'common', 'wallpaper_engine'))
      push(path.join(drive, 'SteamLibrary', 'steamapps', 'common', 'wallpaper_engine'))
      push(path.join(drive, 'Games', 'SteamLibrary', 'steamapps', 'common', 'wallpaper_engine'))
    }
  }
  return found
}

function pickType(project, dir) {
  const raw = typeof project.type === 'string' ? project.type.toLowerCase() : ''
  if (raw === 'video' || raw === 'scene' || raw === 'web' || raw === 'application') return raw
  // 没有 type 或写成别的值：按目录里实际有的东西猜
  if (isFile(path.join(dir, 'scene.pkg'))) return 'scene'
  if (isFile(path.join(dir, 'index.html'))) return 'web'
  if (typeof project.file === 'string' && MEDIA_EXT.has(path.extname(project.file).toLowerCase())) return 'video'
  return 'unknown'
}

function resolveMedia(project, dir) {
  if (typeof project.file !== 'string' || project.file === '') return null
  const abs = inside(dir, path.join(dir, project.file))
  if (!abs || !isFile(abs)) return null
  const ext = path.extname(abs).toLowerCase()
  if (MEDIA_EXT.has(ext)) return abs
  if (PREVIEW_EXT.has(ext)) return abs
  return null
}

function resolvePreview(project, dir) {
  if (typeof project.preview !== 'string' || project.preview === '') return null
  const abs = inside(dir, path.join(dir, project.preview))
  if (!abs || !isFile(abs)) return null
  return PREVIEW_EXT.has(path.extname(abs).toLowerCase()) ? abs : null
}

function readEntry(dir, source, id) {
  const project = readJson(path.join(dir, 'project.json'))
  if (!project || typeof project !== 'object') return null

  const type = pickType(project, dir)
  const media = type === 'video' ? resolveMedia(project, dir) : null
  const preview = resolvePreview(project, dir)
  if (!media && !preview) return null

  return {
    id: id || path.basename(dir),
    title: typeof project.title === 'string' && project.title.trim() !== '' ? project.title.trim() : path.basename(dir),
    type,
    source,
    dir,
    // 视频壁纸给真实文件；scene / web 只能给预览图（真渲染要背整个 WE 引擎，不做）
    file: media,
    preview,
    // 能实时播放的只有视频，其余按静态图处理
    playable: type === 'video' && !!media,
  }
}

function listDirs(parent) {
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(parent, d.name))
  } catch {
    return []
  }
}

let cache = { at: 0, value: null }
const CACHE_MS = 30_000

/** 扫描全部壁纸。结果按"可播放优先、标题"排序。 */
export function scanWe(options = {}) {
  const now = Date.now()
  if (!options.force && cache.value !== null && now - cache.at < CACHE_MS) return cache.value

  const dirs = findWeDirs()
  const entries = []
  const problems = []

  for (const weDir of dirs) {
    const steamApps = path.resolve(weDir, '..', '..')
    const workshop = path.join(steamApps, 'workshop', 'content', WORKSHOP_APPID)
    for (const dir of listDirs(workshop)) {
      const entry = readEntry(dir, 'workshop', path.basename(dir))
      if (entry) entries.push(entry)
    }
    for (const kind of ['myprojects', 'defaultprojects']) {
      for (const dir of listDirs(path.join(weDir, 'projects', kind))) {
        const entry = readEntry(dir, kind, path.basename(dir))
        if (entry) entries.push(entry)
      }
    }
  }

  if (dirs.length === 0) problems.push('没找到 Wallpaper Engine 安装目录')

  // 同一张壁纸可能从不同根被扫到两次（多个 Steam 库指向同一目录），按落盘路径去重
  const unique = []
  const seenEntries = new Set()
  for (const entry of entries) {
    const key = String(entry.file || entry.preview || entry.dir).toLowerCase()
    if (seenEntries.has(key)) continue
    seenEntries.add(key)
    unique.push(entry)
  }
  entries.length = 0
  entries.push(...unique)

  entries.sort((a, b) => {
    if (a.playable !== b.playable) return a.playable ? -1 : 1
    return a.title.localeCompare(b.title, 'zh-Hans-CN')
  })

  const value = {
    ok: true,
    dirs,
    total: entries.length,
    playable: entries.filter((e) => e.playable).length,
    counts: {
      video: entries.filter((e) => e.type === 'video').length,
      scene: entries.filter((e) => e.type === 'scene').length,
      web: entries.filter((e) => e.type === 'web').length,
      other: entries.filter((e) => e.type !== 'video' && e.type !== 'scene' && e.type !== 'web').length,
    },
    entries,
    problems,
  }
  cache = { at: now, value }
  return value
}

/** WE 自己记着"当前桌面用的是哪张"，直接拿来当"就用我现在这张"。 */
export function currentDesktopWallpaper() {
  for (const weDir of findWeDirs()) {
    const cfg = path.join(weDir, 'config.json')
    let text = ''
    try {
      text = fs.readFileSync(cfg, 'utf8')
    } catch {
      continue
    }
    let file = ''
    const parsed = (() => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    })()
    if (parsed) {
      const selected = parsed?.general?.wallpaperconfig?.selectedwallpapers
      if (selected && typeof selected === 'object') {
        for (const key of Object.keys(selected)) {
          const candidate = selected[key]?.file
          if (typeof candidate === 'string' && candidate !== '') {
            file = candidate
            break
          }
        }
      }
    }
    if (!file) {
      const m = /"selectedwallpapers"\s*:\s*\{[\s\S]{0,4000}?"file"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(text)
      if (m) file = m[1].replace(/\\\\/g, '\\')
    }
    if (file) {
      const abs = path.resolve(file)
      return {
        file: isFile(abs) ? abs : null,
        raw: file,
        installPath: weDir,
      }
    }
  }
  return null
}

export function clearScanCache() {
  cache = { at: 0, value: null }
}
