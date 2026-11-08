/**
 * 用 CDP 驱动无头 Edge：导航 → 等一段真实时间 → 截图。
 * 用途只有验证注入运行时（片头覆盖层 / 背景层）真的画出来了。
 *
 * 用法：node tests/shot.mjs <url> <out.png> [waitMs]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const url = process.argv[2]
const out = process.argv[3]
const waitMs = Number(process.argv[4] || 4000)
const PORT = 9333

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) return await res.json()
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
  }
  throw new Error('DevTools 端口没起来')
}

const profile = path.join(os.tmpdir(), `wps-shot-${Date.now()}`)
const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-crash-reporter',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', windowsHide: true },
)

let ws = null
try {
  await waitForDevtools()

  const targetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  const target = await targetRes.json()
  const wsUrl = target.webSocketDebuggerUrl
  if (!wsUrl) throw new Error('没有 webSocketDebuggerUrl：' + JSON.stringify(target).slice(0, 300))

  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    let msg
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })

  function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url })
  await sleep(waitMs)

  // 可选：截图前先在页面里跑一段 JS（用来点开面板）
  const script = process.env.WPS_EVAL
  if (script) {
    const r = await send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true })
    console.log('eval result:', JSON.stringify(r.result && r.result.value))
    await sleep(Number(process.env.WPS_EVAL_WAIT || 3500))
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  const state = await send('Runtime.evaluate', {
    expression:
      'JSON.stringify({backdrop:!!document.getElementById("wps-backdrop"),boot:!!document.getElementById("wps-boot"),html:document.documentElement.getAttribute("data-wps")})',
    returnByValue: true,
  })
  console.log('OK', out, '| page:', state.result && state.result.value)
} finally {
  try {
    if (ws) ws.close()
  } catch {
    /* ignore */
  }
  try {
    child.kill()
  } catch {
    /* ignore */
  }
  await sleep(400)
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 删不掉就算了 */
  }
}
