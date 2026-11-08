/* 壁纸与片头 · 页面运行时（内联注入，在页面求值时立刻执行）
 *
 * 两件事，各自独立失败，任何异常都不许挡住应用启动：
 *   1. 片头覆盖层：铺满视口、放完淡出、点击/键盘随时跳过
 *   2. 背景层：读 /config.json，建 #wps-backdrop，改两个表面 token 让壁纸透出来
 *
 * 配置是快照（window.__WPS_CFG__），但背景每页都重新拉 /config.json，所以换壁纸刷新即生效。
 */
;(function () {
  'use strict'

  var CFG = window.__WPS_CFG__ || {}
  var BASE = CFG.base || '/dsh-wallpaper-intro'
  var doc = document
  var root = doc.documentElement

  var state = {
    bootEl: null,
    bootActive: false,
    bootFinished: false,
    backdrop: null,
    backdropStarted: false,
    conf: null,
    timers: [],
  }

  function later(fn, ms) {
    var id = window.setTimeout(fn, ms)
    state.timers.push(id)
    return id
  }

  function clearTimer(id) {
    if (id) window.clearTimeout(id)
  }

  function make(tag, props) {
    var node = doc.createElement(tag)
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue
        node.setAttribute(key, props[key])
      }
    }
    return node
  }

  /* 注入行在 <head> 里执行，此刻 <body> 可能还不存在。
     背景层必须挂到 body 上才正常（挂在 <html> 上会被 body 的不透明底色盖住）。 */
  var bodyWaiters = []

  function whenBodyReady(fn) {
    if (doc.body) {
      fn()
      return
    }
    bodyWaiters.push(fn)
    if (bodyWaiters.length > 1) return
    var run = function () {
      var list = bodyWaiters.slice()
      bodyWaiters.length = 0
      for (var i = 0; i < list.length; i += 1) {
        try {
          list[i]()
        } catch (err) {
          /* 单个回调失败不影响别的 */
        }
      }
    }
    try {
      doc.addEventListener('DOMContentLoaded', run, { once: true })
    } catch (err) {
      doc.addEventListener('DOMContentLoaded', run)
    }
    later(function () {
      if (doc.body) run()
    }, 2000)
  }

  function bootCfg() {
    return CFG.boot || {}
  }

  /* ------------------------------------------------------------------ */
  /* 片头                                                                */
  /* ------------------------------------------------------------------ */

  function startBoot() {
    var cfg = bootCfg()
    if (!cfg.enabled || !CFG.bootUrl) {
      finishBoot(true)
      return
    }
    try {
      state.bootActive = true
      var el = make('div', { id: 'wps-boot', 'data-wps-boot': '1' })
      el.style.setProperty('--wps-boot-fade', (cfg.fadeMs || 900) + 'ms')

      var media
      if (CFG.bootKind === 'image') {
        media = make('img', { alt: '', draggable: 'false' })
        media.src = CFG.bootUrl
      } else {
        media = make('video', {
          autoplay: '',
          playsinline: '',
          preload: 'auto',
          'webkit-playsinline': '',
        })
        media.muted = cfg.sound === false
        try {
          media.volume = typeof cfg.volume === 'number' ? cfg.volume : 0.8
        } catch (err) {
          /* 某些容器不允许改 volume，忽略 */
        }
        media.src = CFG.bootUrl
      }
      el.appendChild(media)

      var hint = make('div', { id: 'wps-boot-hint' })
      hint.textContent = cfg.hint || '正在启动…'
      el.appendChild(hint)

      var bar = make('div', { id: 'wps-boot-bar' })
      bar.appendChild(make('i'))
      el.appendChild(bar)

      var skip = make('div', { id: 'wps-boot-skip' })
      skip.textContent = cfg.skipLabel || '点击画面跳过'
      el.appendChild(skip)

      var sound = make('button', { id: 'wps-boot-sound', type: 'button', hidden: '' })
      sound.textContent = cfg.soundLabel || '开启声音'
      sound.addEventListener('click', function (event) {
        event.stopPropagation()
        sound.hidden = true
        try {
          media.muted = false
          var p = media.play()
          if (p && p.catch) p.catch(function () {})
        } catch (err) {
          /* 打不开声音就继续静音 */
        }
      })
      el.appendChild(sound)

      el.addEventListener('click', function () {
        finishBoot(false)
      })

      state.bootEl = el
      var parent = doc.body || root
      parent.appendChild(el)
      // body 后来才出现的话，把覆盖层挪进去（挂 html 与 body 都能显示，但 body 更规矩）
      whenBodyReady(function () {
        if (state.bootEl && doc.body && state.bootEl.parentNode !== doc.body) {
          try {
            doc.body.appendChild(state.bootEl)
          } catch (err) {
            /* ignore */
          }
        }
      })

      if (CFG.bootKind === 'image') {
        later(function () {
          finishBoot(false)
        }, (cfg.durationSec > 0 ? cfg.durationSec : 3.2) * 1000)
      } else {
        // 用户设了时长就按时交接；0 = 跟随素材长度（放完自然结束）
        if (cfg.durationSec > 0) {
          later(function () {
            finishBoot(false)
          }, cfg.durationSec * 1000)
        }
        media.addEventListener('ended', function () {
          finishBoot(false)
        })
        media.addEventListener('error', function () {
          finishBoot(true)
        })

        var playResult = null
        try {
          playResult = media.play()
        } catch (err) {
          playResult = null
        }
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(function () {
            // 浏览器拦了未静音自动播放：退回静音继续放，亮出独立的声音开关
            if (cfg.sound === false) {
              finishBoot(true)
              return
            }
            media.muted = true
            try {
              var retry = media.play()
              if (retry && retry.catch) retry.catch(function () { finishBoot(true) })
            } catch (err) {
              finishBoot(true)
            }
            sound.hidden = false
          })
        }
        // 一帧都出不来：判坏跳过
        later(function () {
          if (media.readyState < 2) finishBoot(true)
        }, 12000)
      }

      // 任何情况下都不许扣住用户
      later(function () {
        finishBoot(false)
      }, 20000)

      doc.addEventListener('keydown', onBootKey, true)
    } catch (err) {
      finishBoot(true)
    }
  }

  function onBootKey(event) {
    if (!state.bootActive) return
    if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      finishBoot(false)
    }
  }

  function finishBoot(immediate) {
    if (state.bootFinished) return
    state.bootFinished = true
    state.bootActive = false
    try {
      doc.removeEventListener('keydown', onBootKey, true)
    } catch (err) {
      /* ignore */
    }

    var el = state.bootEl
    var fade = immediate ? 0 : (bootCfg().fadeMs || 900)
    if (el) {
      el.setAttribute('data-wps-fading', '1')
      window.setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el)
        state.bootEl = null
      }, fade + 60)
    }
    // 片头退场后才铺背景，避免和片头抢带宽
    if (fade === 0) startBackdrop()
    else later(startBackdrop, Math.max(0, fade - 120))
  }

  /* ------------------------------------------------------------------ */
  /* 背景                                                                */
  /* ------------------------------------------------------------------ */

  function startBackdrop() {
    if (state.backdropStarted) return
    state.backdropStarted = true
    fetchConfig(function (conf) {
      whenBodyReady(function () {
        try {
          applyBackdrop(conf)
        } catch (err) {
          teardown()
        }
      })
    })
  }

  function fetchConfig(done) {
    try {
      if (!window.fetch) {
        done(bakedConfig())
        return
      }
      window
        .fetch(BASE + '/config.json', { cache: 'no-store', credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return res.json()
        })
        .then(function (json) {
          done(json && json.ok ? json : bakedConfig())
        })
        .catch(function () {
          done(bakedConfig())
        })
    } catch (err) {
      done(bakedConfig())
    }
  }

  function bakedConfig() {
    return {
      ok: true,
      background: {
        enabled: CFG.bgEnabled !== false && !!CFG.bgUrl,
        url: CFG.bgUrl || '',
        kind: CFG.bgKind || 'image',
        title: '',
      },
      appearance: CFG.appearance || { veil: 0.14, surface: 0.2, surfaceLight: 0.55, blur: 0 },
      autoYield: CFG.autoYield !== false,
    }
  }

  function otherWallpaperActive() {
    try {
      var body = doc.body
      if (!body) return false
      var value = body.getAttribute('data-we-wallpaper')
      if (value === null) return false
      var v = String(value).toLowerCase()
      return !(v === '' || v === 'off' || v === 'false' || v === '0')
    } catch (err) {
      return false
    }
  }

  function applyBackdrop(conf) {
    state.conf = conf
    if (!conf || !conf.background || !conf.background.enabled || !conf.background.url) {
      teardown()
      syncYieldObserver()
      return
    }
    if (conf.autoYield !== false && otherWallpaperActive()) {
      teardown()
      syncYieldObserver()
      return
    }
    build(conf.background, conf.appearance || {}, conf.autoYield !== false)
    startRotation(conf)
    syncYieldObserver()
  }

  function build(media, look, autoYield) {
    teardown()
    var reduced = false
    try {
      reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (err) {
      reduced = false
    }

    var layer = make('div', { id: 'wps-backdrop' })
    var node
    var isVideo = media.kind === 'video'
    if (isVideo && !reduced) {
      node = make('video', { autoplay: '', playsinline: '', preload: 'auto' })
      node.muted = true
      node.loop = true
      node.src = media.url
      try {
        var p = node.play()
        if (p && p.catch) p.catch(function () {})
      } catch (err) {
        /* 拦截就黑着，无害 */
      }
    } else {
      node = make('img', { alt: '', draggable: 'false' })
      node.src = media.url
    }
    layer.appendChild(node)

    var veil = make('div', { id: 'wps-backdrop-veil' })
    layer.appendChild(veil)

    applyLookNow(look)

    var parent = doc.body || root
    parent.insertBefore(layer, parent.firstChild)
    state.backdrop = layer

    root.setAttribute('data-wps', 'on')
    if (isVideo && !reduced) root.setAttribute('data-wps-background', 'on')
    state.autoYield = autoYield

    if (autoYield) observeBody()
    observeTheme()
  }

  /* 变量写进独立 <style>，不写 <html style>：
     主题观察器盯的是 html 的 style 属性，写它会自己触发自己（每 120ms 重算一轮 → 持续抖动）。
     !important 是为了赢过旧版本运行时留在 inline style 上的同名变量。 */
  var liveVars = {}
  var liveStyleEl = null

  function ensureLiveStyle() {
    try {
      if (liveStyleEl && liveStyleEl.parentNode) return liveStyleEl
      var existing = doc.getElementById('wps-live')
      if (!existing) {
        existing = doc.createElement('style')
        existing.id = 'wps-live'
        ;(doc.head || root).appendChild(existing)
      }
      liveStyleEl = existing
      return liveStyleEl
    } catch (err) {
      liveStyleEl = null
      return null
    }
  }

  function setRootVar(name, value) {
    if (liveVars[name] === value) return
    liveVars[name] = value
    var el = ensureLiveStyle()
    if (!el) {
      try {
        root.style.setProperty(name, value)
      } catch (err) {
        /* ignore */
      }
      return
    }
    var parts = []
    for (var key in liveVars) {
      if (Object.prototype.hasOwnProperty.call(liveVars, key)) {
        parts.push(key + ':' + liveVars[key] + ' !important')
      }
    }
    el.textContent = ':root{' + parts.join(';') + '}'
  }

  function writeCheapVars(l) {
    setRootVar('--wps-veil', String(clamp01(l.veil, 0.14)))
    var blur = Math.max(0, Math.min(40, typeof l.blur === 'number' ? l.blur : 0))
    setRootVar('--wps-blur', blur + 'px')
    setRootVar('--wps-filter', blur > 0 ? 'blur(' + blur + 'px)' : 'none')
    // 固定底值 1.01：0→1px 时几何完全不动，不会出现"从无到有"的跳变；
    // 只在模糊大到会露出边缘时才继续增长（两侧各要盖住一个模糊半径）。
    var ref = 900
    try {
      ref = Math.min(window.innerWidth || 900, window.innerHeight || 900) || 900
    } catch (err) {
      ref = 900
    }
    var scale = Math.max(1.01, 1 + (2 * blur) / ref)
    setRootVar('--wps-blur-scale', String(scale))
    setRootVar('--wps-transform', 'scale(' + scale.toFixed(4) + ')')
  }

  var tokenTimer = 0
  var pendingLook = null

  /** 表面 token 会让整个界面重算样式，节流到 60ms 一次；不节流的话拖动时整页每帧重排。 */
  function scheduleTokens(look) {
    pendingLook = look
    if (tokenTimer) return
    tokenTimer = window.setTimeout(function () {
      tokenTimer = 0
      var next = pendingLook
      pendingLook = null
      if (!next) return
      try {
        applyTokens(next)
      } catch (err) {
        /* ignore */
      }
    }, 60)
  }

  /** 滑杆实时路径：便宜的立即写，贵的节流。 */
  function applyLook(look) {
    var l = look || {}
    writeCheapVars(l)
    scheduleTokens(l)
  }

  /** 建背景层时用：同步写全套，不要节流。 */
  function applyLookNow(look) {
    var l = look || {}
    writeCheapVars(l)
    applyTokens(l)
  }

  function teardown() {
    stopRotation()
    if (state.backdrop && state.backdrop.parentNode) {
      state.backdrop.parentNode.removeChild(state.backdrop)
    }
    state.backdrop = null
    try {
      root.removeAttribute('data-wps')
      root.removeAttribute('data-wps-background')
    } catch (err) {
      /* ignore */
    }
  }

  function clamp01(value, fallback) {
    var n = typeof value === 'number' && isFinite(value) ? value : fallback
    return Math.max(0, Math.min(1, n))
  }

  function applyTokens(look) {
    var dark = isDarkTheme()
    var alpha = clamp01(dark ? look.surface : look.surfaceLight, dark ? 0.2 : 0.55)
    var base = dark
      ? 'rgba(18, 19, 24, ' + alpha + ')'
      : 'rgba(255, 255, 255, ' + alpha + ')'
    var sideAlpha = Math.min(1, alpha + (dark ? 0.08 : 0.12))
    var side = dark
      ? 'rgba(14, 15, 19, ' + sideAlpha + ')'
      : 'rgba(250, 250, 252, ' + sideAlpha + ')'
    setRootVar('--wps-base', base)
    setRootVar('--wps-sidebar', side)
  }

  function parseColor(text) {
    if (!text) return null
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)$/i.exec(text)
    if (!m) return null
    var alpha = m[4] === undefined ? 1 : m[4].indexOf('%') >= 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: isFinite(alpha) ? alpha : 1 }
  }

  var themeDarkCache = null

  function isDarkTheme(force) {
    if (!force && themeDarkCache !== null) return themeDarkCache
    var result = null
    try {
      var candidates = [doc.body, root]
      for (var i = 0; i < candidates.length; i += 1) {
        var node = candidates[i]
        if (!node || !window.getComputedStyle) continue
        var color = parseColor(window.getComputedStyle(node).backgroundColor)
        if (color && color.a > 0.5) {
          var lum = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
          result = lum < 0.5
          break
        }
      }
    } catch (err) {
      result = null
    }
    if (result === null) {
      try {
        result = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      } catch (err) {
        result = true
      }
    }
    themeDarkCache = result
    return result
  }

  /* 主题切换时重算表面 token */
  var themeObserver = null
  var themeScheduled = false

  function observeTheme() {
    if (themeObserver || !window.MutationObserver) return
    try {
      themeObserver = new MutationObserver(function () {
        if (themeScheduled) return
        themeScheduled = true
        window.setTimeout(function () {
          themeScheduled = false
          themeDarkCache = null // 主题真的变了才重算，避免和 --wps-base 互相反馈
          if (state.backdrop && state.conf) applyTokens(state.conf.appearance || {})
        }, 120)
      })
      themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
      if (doc.body) themeObserver.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    } catch (err) {
      /* 观察不到就算了，token 用首次算出的值 */
    }
  }

  /* 让路：别的壁纸插件在台上就撤掉自己，撤掉了再接回来 */
  var bodyObserver = null

  function observeBody() {
    if (bodyObserver || !window.MutationObserver) return
    try {
      bodyObserver = new MutationObserver(function () {
        if (!state.conf) return
        var conf = state.conf
        if (!conf.background || !conf.background.enabled) return
        if (otherWallpaperActive()) {
          if (state.backdrop) teardown()
        } else if (!state.backdrop) {
          build(conf.background, conf.appearance || {}, true)
        }
      })
      bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['data-we-wallpaper'] })
    } catch (err) {
      /* ignore */
    }
  }

  function syncYieldObserver() {
    if (!window.MutationObserver) return
    if (state.autoYield === false) {
      if (bodyObserver) {
        bodyObserver.disconnect()
        bodyObserver = null
      }
      return
    }
    observeBody()
  }

  /* ------------------------------------------------------------------ */
  /* 轮播                                                                */
  /* ------------------------------------------------------------------ */

  function stopRotation() {
    if (state.rotationTimer) {
      window.clearInterval(state.rotationTimer)
      state.rotationTimer = 0
    }
  }

  function startRotation(conf) {
    stopRotation()
    var rot = conf && conf.rotation
    if (!rot || !rot.enabled || !rot.entries || rot.entries.length < 2) return
    state.rotation = rot
    state.rotationIndex = rot.mode === 'random' ? Math.floor(Math.random() * rot.entries.length) : 0
    var ms = Math.max(1000, (rot.intervalMin || 30) * 60000)
    state.rotationTimer = window.setInterval(function () {
      try {
        if (doc.hidden) return
        nextWallpaper()
      } catch (err) {
        /* ignore */
      }
    }, ms)
  }

  /** 切到下一张；返回目标条目（没有轮播池时返回 null）。 */
  function nextWallpaper() {
    var rot = state.rotation
    if (!rot || !rot.entries || rot.entries.length < 2) return null
    var index = state.rotationIndex
    if (rot.mode === 'random') {
      for (var i = 0; i < 8 && index === state.rotationIndex; i += 1) {
        index = Math.floor(Math.random() * rot.entries.length)
      }
    } else {
      index = (state.rotationIndex + 1) % rot.entries.length
    }
    state.rotationIndex = index
    var target = rot.entries[index]
    swapMedia(target, rot.fadeMs || 700)
    return target
  }

  /** 回到配置里那张基础壁纸（关掉轮播时用）。已经是它就不动，避免无谓重载。 */
  function restoreBaseWallpaper() {
    var conf = state.conf
    var bg = conf && conf.background
    if (!bg || !bg.url) return false
    var current = state.backdrop ? state.backdrop.querySelector('img, video') : null
    var currentSrc = current ? String(current.currentSrc || current.src || '') : ''
    if (currentSrc !== '' && currentSrc.indexOf(bg.url) >= 0) return false
    var fade = (conf.rotation && conf.rotation.fadeMs) || 700
    swapMedia({ url: bg.url, kind: bg.kind || 'image', title: bg.title || '' }, fade)
    return true
  }

  /** 交叉淡入地换掉壁纸（旧节点退场后再移除）。 */
  function swapMedia(entry, fadeMs) {
    var layer = state.backdrop
    if (!layer || !entry) return
    var old = layer.querySelector('img, video')
    var isVideo = entry.kind === 'video'
    var node
    if (isVideo) {
      node = make('video', { autoplay: '', playsinline: '', preload: 'auto' })
      node.muted = true
      node.loop = true
      node.src = entry.url
    } else {
      node = make('img', { alt: '', draggable: 'false' })
      node.src = entry.url
    }
    node.style.opacity = '0'
    node.style.transition = 'opacity ' + fadeMs + 'ms ease'
    if (old && old.parentNode) layer.insertBefore(node, old)
    else layer.insertBefore(node, layer.firstChild)

    window.requestAnimationFrame(function () {
      node.style.opacity = '1'
    })

    if (isVideo && !state.paused) {
      try {
        var p = node.play()
        if (p && p.catch) p.catch(function () {})
      } catch (err) {
        /* ignore */
      }
    }

    if (old) {
      window.setTimeout(function () {
        if (old.parentNode) old.parentNode.removeChild(old)
      }, fadeMs + 80)
    }
  }



  try {
    root.style.setProperty('--wps-veil', '0.14')
    startBoot()
  } catch (err) {
    try {
      startBackdrop()
    } catch (err2) {
      /* 最终兜底：什么都不做，保持 DSH 原样 */
    }
  }

  window.__WPS__ = {
    version: CFG.version || '0',
    replayBoot: function () {
      state.bootFinished = false
      startBoot()
    },
    /** 设置页拖滑杆时调用：只改外观变量，不重建节点。 */
    applyLook: function (look) {
      try {
        applyLook(look)
        if (state.conf) state.conf.appearance = look
      } catch (err) {
        /* ignore */
      }
    },
    /** 换壁纸后调用：重新拉配置并重建背景层。 */
    refresh: function () {
      try {
        state.backdropStarted = false
        state.conf = null
        startBackdrop()
      } catch (err) {
        /* ignore */
      }
    },
    hasBackdrop: function () {
      return !!state.backdrop
    },
    /** 暂停/继续背景视频；返回"现在是暂停状态吗"。 */
    togglePause: function () {
      var video = state.backdrop ? state.backdrop.querySelector('video') : null
      if (!video) return false
      try {
        if (video.paused) {
          var p = video.play()
          if (p && p.catch) p.catch(function () {})
          state.paused = false
          return false
        }
        video.pause()
        state.paused = true
        return true
      } catch (err) {
        return false
      }
    },
    /** 立刻切到下一张（快捷面板的「下一张」）。 */
    nextWallpaper: function () {
      try {
        var next = nextWallpaper()
        return next ? next.title : null
      } catch (err) {
        return null
      }
    },
    /** 运行时开关轮播；关闭时把画面还原成配置里的基础壁纸。 */
    setRotation: function (on) {
      try {
        if (!state.conf) return false
        if (!state.conf.rotation) state.conf.rotation = { entries: [] }
        state.conf.rotation.enabled = !!on
        if (on) {
          startRotation(state.conf)
        } else {
          stopRotation()
          restoreBaseWallpaper()
        }
        return !!state.conf.rotation.enabled
      } catch (err) {
        return false
      }
    },
  }
})()
