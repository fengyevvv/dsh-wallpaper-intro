/**
 * 配置：默认值、读写、夹取。
 *
 * 存在 $DSH_HOME/dsh-wallpaper-intro.json（包外），升级插件不会丢。
 * 刻意不写 profile 的 cordis.patch.yml —— 那份文件属于用户，且被别的插件共用。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULTS = {
  boot: {
    enabled: true,
    file: '', // 绝对路径；空 = 不播片头，回退 DSH 原生启动页
    durationSec: 0, // 0 = 跟随素材长度；>0 = 到时交接
    fadeMs: 900,
    sound: true,
    volume: 0.8,
    hint: '正在启动…',
    skipLabel: '点击画面跳过',
    soundLabel: '开启声音',
  },
  background: {
    enabled: true,
    file: '', // 绝对路径（图片或视频）
    title: '',
    source: 'local', // local | we | we-preview
  },
  appearance: {
    veil: 0.14, // 压在壁纸上的蒙版浓度
    surface: 0.2, // 暗色主题下画布/侧栏不透明度
    surfaceLight: 0.55, // 亮色主题下画布/侧栏不透明度
    blur: 0, // 只糊壁纸本身
  },
  we: {
    installPath: '', // 自动探测，也可手填
    autoYield: true, // 检测到别的壁纸插件时让路
  },
  overlay: {
    enabled: true, // 右下角快捷面板
  },
  rotation: {
    enabled: false, // 总开关：关掉就固定用 background.file
    source: 'list', // list = WE 勾选的列表；folder = 扫描一个目录
    items: [], // [{ file, title, kind }]
    folder: '',
    intervalMin: 30,
    mode: 'sequential', // sequential | random
    fadeMs: 700,
  },
}

const MIME_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.apng'])
const MIME_VIDEO = new Set(['.mp4', '.webm', '.ogv', '.m4v', '.mov'])

/** DSH 的 home 目录（配置与素材放这里）。 */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv && fromEnv.trim() !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

export function configPath() {
  return path.join(dshHome(), 'dsh-wallpaper-intro.json')
}

function clamp(n, lo, hi, fallback) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(hi, Math.max(lo, v))
}

function cleanString(v, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

/** 逐段夹取，任何越界/类型不对都回落到默认值而不是报错。 */
export function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const boot = src.boot && typeof src.boot === 'object' ? src.boot : {}
  const bg = src.background && typeof src.background === 'object' ? src.background : {}
  const look = src.appearance && typeof src.appearance === 'object' ? src.appearance : {}
  const we = src.we && typeof src.we === 'object' ? src.we : {}
  const overlay = src.overlay && typeof src.overlay === 'object' ? src.overlay : {}
  const rotation = src.rotation && typeof src.rotation === 'object' ? src.rotation : {}

  const items = Array.isArray(rotation.items)
    ? rotation.items
        .filter((it) => it && typeof it.file === 'string' && it.file !== '')
        .slice(0, 500)
        .map((it) => ({
          file: it.file,
          title: typeof it.title === 'string' ? it.title : '',
          kind: it.kind === 'video' ? 'video' : 'image',
        }))
    : []

  const source = ['local', 'we', 'we-preview'].includes(bg.source) ? bg.source : 'local'

  return {
    boot: {
      enabled: boot.enabled !== false,
      file: cleanString(boot.file),
      durationSec: clamp(boot.durationSec, 0, 60, DEFAULTS.boot.durationSec),
      fadeMs: Math.round(clamp(boot.fadeMs, 0, 5000, DEFAULTS.boot.fadeMs)),
      sound: boot.sound !== false,
      volume: clamp(boot.volume, 0, 1, DEFAULTS.boot.volume),
      hint: cleanString(boot.hint, DEFAULTS.boot.hint) || DEFAULTS.boot.hint,
      skipLabel: cleanString(boot.skipLabel, DEFAULTS.boot.skipLabel) || DEFAULTS.boot.skipLabel,
      soundLabel: cleanString(boot.soundLabel, DEFAULTS.boot.soundLabel) || DEFAULTS.boot.soundLabel,
    },
    background: {
      enabled: bg.enabled !== false,
      file: cleanString(bg.file),
      title: cleanString(bg.title),
      source,
    },
    appearance: {
      veil: clamp(look.veil, 0, 1, DEFAULTS.appearance.veil),
      surface: clamp(look.surface, 0, 1, DEFAULTS.appearance.surface),
      surfaceLight: clamp(look.surfaceLight, 0, 1, DEFAULTS.appearance.surfaceLight),
      blur: clamp(look.blur, 0, 40, DEFAULTS.appearance.blur),
    },
    we: {
      installPath: cleanString(we.installPath),
      autoYield: we.autoYield !== false,
    },
    overlay: {
      enabled: overlay.enabled !== false,
    },
    rotation: {
      enabled: rotation.enabled === true,
      source: rotation.source === 'folder' ? 'folder' : 'list',
      items,
      folder: cleanString(rotation.folder),
      intervalMin: Math.round(clamp(rotation.intervalMin, 1, 1440, DEFAULTS.rotation.intervalMin)),
      mode: rotation.mode === 'random' ? 'random' : 'sequential',
      fadeMs: Math.round(clamp(rotation.fadeMs, 0, 3000, DEFAULTS.rotation.fadeMs)),
    },
  }
}

/** 读配置；文件不存在或坏了都返回默认值，不抛。
 *  从旧名（dsh-wallpaper-studio.json）迁移一次，避免改名后用户的片头/轮播配置丢失。 */
export function loadConfig() {
  try {
    const text = fs.readFileSync(configPath(), 'utf8')
    return normalize(JSON.parse(text))
  } catch {
    /* 新路径没有，试试迁移 */
  }
  try {
    const legacyPath = path.join(dshHome(), 'dsh-wallpaper-studio.json')
    const legacy = normalize(JSON.parse(fs.readFileSync(legacyPath, 'utf8')))
    try {
      const target = configPath()
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
    } catch {
      /* 写不进去也先把读到的用上 */
    }
    return legacy
  } catch {
    return normalize(DEFAULTS)
  }
}

/** 合并一段补丁并落盘（原子写：先写 .tmp 再 rename）。 */
export function saveConfig(patch) {
  const current = loadConfig()
  const merged = normalize({
    boot: { ...current.boot, ...(patch && patch.boot) },
    background: { ...current.background, ...(patch && patch.background) },
    appearance: { ...current.appearance, ...(patch && patch.appearance) },
    we: { ...current.we, ...(patch && patch.we) },
    overlay: { ...current.overlay, ...(patch && patch.overlay) },
    rotation: {
      ...current.rotation,
      ...(patch && patch.rotation),
      items:
        patch && patch.rotation && Array.isArray(patch.rotation.items)
          ? patch.rotation.items
          : current.rotation.items,
    },
  })
  const target = configPath()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, target)
  return merged
}

/** 这个绝对路径是图片还是视频（按扩展名判断，未知返回 null）。 */
export function mediaKind(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (MIME_IMAGE.has(ext)) return 'image'
  if (MIME_VIDEO.has(ext)) return 'video'
  return null
}

export function isMediaExt(name) {
  const ext = path.extname(name).toLowerCase()
  return MIME_IMAGE.has(ext) || MIME_VIDEO.has(ext)
}

export function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.avif': return 'image/avif'
    case '.bmp': return 'image/bmp'
    case '.apng': return 'image/apng'
    case '.mp4':
    case '.m4v': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.ogv': return 'video/ogg'
    case '.mov': return 'video/quicktime'
    default: return 'application/octet-stream'
  }
}
