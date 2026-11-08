/**
 * 媒体服务：把本机任意绝对路径的文件，经一条**只有本进程签发过 token** 的路由
 * 送到浏览器。URL 里不出现文件路径，所以这条路由不能被拿来读取任意文件。
 *
 * Range 响应一律 no-store：浏览器把半截媒体当完整资源缓存会导致"刷新黑屏、硬刷新正常"，
 * 这是同类插件踩过的坑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { mimeFor } from './config.js'

/** 路径 ⇄ token 的双向表，生命周期 = 插件实例。 */
export class MediaTokens {
  constructor() {
    this.byPath = new Map()
    this.byToken = new Map()
  }

  /** 给一个已校验存在的文件发 token；同一个路径始终得到同一个 token。 */
  issue(filePath) {
    const key = path.resolve(filePath)
    const existing = this.byPath.get(key)
    if (existing !== undefined) return existing
    const token = randomBytes(12).toString('hex')
    this.byPath.set(key, token)
    this.byToken.set(token, key)
    return token
  }

  resolve(token) {
    if (typeof token !== 'string') return undefined
    return this.byToken.get(token)
  }
}

/** 直接发媒体字节，支持 Range（视频拖动进度条）。 */
export function serveMedia(req, res, filePath) {
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }

  const total = stat.size
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', mimeFor(filePath))
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')

  const header = req.headers.range
  const match = typeof header === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null

  if (match) {
    let start = match[1] === '' ? null : Number(match[1])
    let end = match[2] === '' ? null : Number(match[2])
    if (start === null && end !== null) {
      start = Math.max(0, total - end)
      end = total - 1
    } else {
      start = start === null ? 0 : start
      end = end === null ? total - 1 : end
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` })
      res.end()
      return
    }
    end = Math.min(end, total - 1)
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    pipe(res, fs.createReadStream(filePath, { start, end }))
    return
  }

  res.writeHead(200, { 'Content-Length': total })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  pipe(res, fs.createReadStream(filePath))
}

function pipe(res, stream) {
  stream.on('error', () => {
    try {
      res.destroy()
    } catch {
      /* 已经断开 */
    }
  })
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}
