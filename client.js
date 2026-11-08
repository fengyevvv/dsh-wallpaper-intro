window.__ModuleLoader__.load({
  id: 'dsh-wallpaper-intro',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const BASE = '/dsh-wallpaper-intro'
    const VERSION = 'v0.1.0 · b7'

    const T = {
      card: 'var(--dsw-alias-bg-layer-1, #ffffff)',
      sunken: 'var(--dsw-alias-bg-layer-2, #f4f4f6)',
      border: 'var(--dsw-alias-border-l1, rgba(0,0,0,0.08))',
      border2: 'var(--dsw-alias-border-l2, rgba(0,0,0,0.16))',
      text: 'var(--dsw-alias-label-primary, #16161a)',
      muted: 'var(--dsw-alias-label-secondary, #6b6b78)',
      brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
      // 主按钮固定用品牌蓝：深色主题下 --dsw-alias-brand-primary 可能接近白色，
      // 直接拿它当底色会变成白底白字（真实踩过）。
      accent: '#4d6bfe',
      danger: 'var(--dsw-alias-state-error-primary, #dc2626)',
      success: 'var(--dsw-alias-state-success-primary, #16a34a)',
    }

    const clamp01 = (v, fb) => {
      const n = typeof v === 'number' && isFinite(v) ? v : fb
      return Math.max(0, Math.min(1, n))
    }

    /** 分段按钮样式（顺序/随机、来源切换共用）。 */
    const segStyle = (active) => ({
      height: 26,
      padding: '0 10px',
      borderRadius: 7,
      fontSize: 11.5,
      fontFamily: 'inherit',
      cursor: 'pointer',
      border: '1px solid ' + (active ? T.accent : T.border),
      background: active ? T.accent : 'transparent',
      color: active ? '#fff' : T.muted,
    })

    /** 判断当前是深色还是浅色主题（读 body 实际背景色，读不到就跟系统偏好）。 */
    function detectDark() {
      try {
        const text = window.getComputedStyle(document.body).backgroundColor
        const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i.exec(text)
        if (m) {
          const alpha = m[4] === undefined ? 1 : parseFloat(m[4])
          if (alpha > 0.5) {
            const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255
            return lum < 0.5
          }
        }
      } catch (e) {
        /* ignore */
      }
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
      } catch (e) {
        return true
      }
    }

    function errText(error) {
      if (!error) return '未知错误'
      return String((error && error.message) || error)
    }

    async function api(path, init) {
      const res = await fetch(BASE + path, Object.assign({ credentials: 'same-origin' }, init))
      const text = await res.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch (e) {
        throw new Error('返回不是 JSON：' + text.slice(0, 200))
      }
      if (!res.ok || json.ok === false) throw new Error(json.error || 'HTTP ' + res.status)
      return json
    }

    /**
     * 主题只算一次。算它需要读 body 的背景色，而 body 背景正是我们要改的东西：
     * 每帧重算会自我反馈 —— alpha 跨过阈值就翻成另一套底色，表现是拖滑杆时"一黑一黑地闪"。
     */
    let themeDarkCache = null
    function themeIsDark() {
      if (themeDarkCache === null) themeDarkCache = detectDark()
      return themeDarkCache
    }

    /* ---------- 页面外观的实时应用（设置页与悬浮面板共用） ---------- */

    // 变量写进独立 <style>（不动 <html style>，否则会触发运行时的主题观察器自我回环）。
    // !important 用来赢过运行时留在 inline style 上的同名变量。
    const liveVars = {}
    let liveStyleEl = null

    function ensureLiveStyle() {
      if (liveStyleEl && liveStyleEl.parentNode) return liveStyleEl
      let el = document.getElementById('wps-live')
      if (!el) {
        el = document.createElement('style')
        el.id = 'wps-live'
        document.head.appendChild(el)
      }
      liveStyleEl = el
      return liveStyleEl
    }

    function setVar(name, value) {
      if (liveVars[name] === value) return
      liveVars[name] = value
      const el = ensureLiveStyle()
      if (!el) return
      const parts = Object.keys(liveVars).map((k) => k + ':' + liveVars[k] + ' !important')
      el.textContent = ':root{' + parts.join(';') + '}'
    }

    let liveTokenTimer = 0
    let livePendingTokens = null

    /** 新版运行时走 window.__WPS__；旧版没有接口就直接写同一套 CSS 变量。 */
    function applyLookToPage(look) {
      try {
        if (window.__WPS__ && typeof window.__WPS__.applyLook === 'function') {
          window.__WPS__.applyLook(look)
          return true
        }
      } catch (e) {
        /* 落到兜底 */
      }
      try {
        setVar('--wps-veil', String(clamp01(look.veil, 0.14)))
        const blur = Math.max(0, Math.min(40, typeof look.blur === 'number' ? look.blur : 0))
        setVar('--wps-blur', blur + 'px')
        setVar('--wps-filter', blur > 0 ? 'blur(' + blur + 'px)' : 'none')
        const ref = Math.min(window.innerWidth || 900, window.innerHeight || 900) || 900
        const scale = Math.max(1.01, 1 + (2 * blur) / ref)
        setVar('--wps-blur-scale', String(scale))
        setVar('--wps-transform', 'scale(' + scale.toFixed(4) + ')')
      } catch (e) {
        return false
      }

      livePendingTokens = look
      if (liveTokenTimer) return true
      liveTokenTimer = window.setTimeout(() => {
        liveTokenTimer = 0
        const next = livePendingTokens
        livePendingTokens = null
        if (!next) return
        try {
          const dark = themeIsDark()
          const alpha = clamp01(dark ? next.surface : next.surfaceLight, dark ? 0.2 : 0.55)
          setVar('--wps-base', dark ? 'rgba(18, 19, 24, ' + alpha + ')' : 'rgba(255, 255, 255, ' + alpha + ')')
          const sideAlpha = Math.min(1, alpha + (dark ? 0.08 : 0.12))
          setVar('--wps-sidebar', dark ? 'rgba(14, 15, 19, ' + sideAlpha + ')' : 'rgba(250, 250, 252, ' + sideAlpha + ')')
        } catch (e) {
          /* ignore */
        }
      }, 60)
      return true
    }

    let liveLookFrame = 0
    let livePendingLook = null

    /** 滑杆一分钟能来几千次事件；合并到每帧最多一次。 */
    function pushLook(look) {
      livePendingLook = look
      if (liveLookFrame) return
      liveLookFrame = window.requestAnimationFrame(() => {
        liveLookFrame = 0
        const next = livePendingLook
        livePendingLook = null
        if (next) applyLookToPage(next)
      })
    }

    /** 让页面立刻重建背景层（换壁纸后调用，不用刷新）。 */
    function refreshPageBackdrop() {
      try {
        if (window.__WPS__ && typeof window.__WPS__.refresh === 'function') window.__WPS__.refresh()
      } catch (e) {
        /* ignore */
      }
    }

    function fmtSize(bytes) {
      if (!bytes) return ''
      if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function baseName(p) {
      if (!p) return ''
      const parts = String(p).split(/[\\/]/)
      return parts[parts.length - 1] || p
    }

    /* ---------------- 基础元件 ---------------- */

    function Btn(props) {
      const { children, onClick, primary, small, disabled, danger, title } = props
      return h(
        'button',
        {
          type: 'button',
          title,
          disabled: !!disabled,
          onClick: onClick,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: small ? 26 : 32,
            padding: small ? '0 10px' : '0 14px',
            fontSize: small ? 12 : 13,
            fontFamily: 'inherit',
            fontWeight: 500,
            borderRadius: small ? 7 : 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            border: '1px solid ' + (primary ? T.accent : T.border2),
            background: primary ? T.accent : 'transparent',
            color: danger ? T.danger : primary ? '#fff' : T.text,
            whiteSpace: 'nowrap',
          },
        },
        children,
      )
    }

    function Section(props) {
      return h(
        'div',
        { style: { marginBottom: 22 } },
        h(
          'div',
          {
            style: {
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: T.muted,
              marginBottom: 9,
            },
          },
          props.title,
        ),
        props.children,
      )
    }

    function Slider(props) {
      const { label, value, min, max, step, onChange, hint, format } = props
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            minHeight: 44,
            borderBottom: '1px solid ' + T.border,
          },
        },
        h('span', { style: { width: 104, fontSize: 13, color: T.text, flex: 'none' } }, label),
        h('input', {
          type: 'range',
          min,
          max,
          step,
          value,
          onChange: (e) => onChange(Number(e.target.value)),
          style: { flex: 1, minWidth: 80, accentColor: T.accent, cursor: 'pointer' },
        }),
        h(
          'span',
          {
            style: {
              width: 58,
              textAlign: 'right',
              fontSize: 12,
              color: T.muted,
              fontVariantNumeric: 'tabular-nums',
              flex: 'none',
            },
          },
          format ? format(value) : value,
        ),
        h(
          'span',
          {
            style: {
              flex: '0 1 132px',
              minWidth: 0,
              fontSize: 11,
              color: T.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            },
          },
          hint || '',
        ),
      )
    }

    function Check(props) {
      return h(
        'label',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: T.text,
            cursor: 'pointer',
          },
        },
        h('input', {
          type: 'checkbox',
          checked: !!props.checked,
          onChange: (e) => props.onChange(e.target.checked),
          style: { accentColor: T.brand, cursor: 'pointer' },
        }),
        props.label,
      )
    }

    /** 视频缩略图：静音、不自动播，读到元数据后跳到 0.4 秒取一帧。 */
    function Thumb(props) {
      const url = props.url
      const kind = props.kind
      const w = props.w || 220
      const hgt = props.h || 124
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        if (!node || kind !== 'video') return
        const seek = () => {
          try {
            node.currentTime = 0.4
          } catch (e) {
            /* 还没法 seek */
          }
        }
        node.addEventListener('loadedmetadata', seek)
        return () => node.removeEventListener('loadedmetadata', seek)
      }, [url, kind])

      const fill = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }

      if (!url) {
        return h(
          'div',
          {
            style: {
              width: '100%',
              height: hgt,
              borderRadius: 10,
              background: T.sunken,
              border: '1px solid ' + T.border,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: T.muted,
            },
          },
          '未设置',
        )
      }
      return h(
        'div',
        {
          style: {
            width: '100%',
            height: hgt,
            borderRadius: 10,
            overflow: 'hidden',
            background: '#000',
            border: '1px solid ' + T.border,
          },
        },
        kind === 'video'
          ? h('video', { ref, src: url, muted: true, playsInline: true, preload: 'metadata', style: fill })
          : h('img', { src: url, alt: '', style: fill }),
      )
    }

    /** 外观预览：按「壁纸 → 蒙版 → 画布表面」合成，接近聊天区的实际观感。 */
    function LookPreview(props) {
      const { url, kind, veil, blur, surface } = props
      // 预览框高 156px：同样用固定底值，0→1px 时不跳
      const previewScale = Math.max(1.01, 1 + (2 * blur) / 156)
      const mediaStyle = {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        filter: 'blur(' + blur + 'px)',
        transform: previewScale > 0 ? 'scale(' + previewScale.toFixed(4) + ')' : 'none',
      }
      return h(
        'div',
        {
          style: {
            position: 'relative',
            width: '100%',
            height: 156,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#101218',
            border: '1px solid ' + T.border,
          },
        },
        url
          ? kind === 'video'
            ? h('video', {
                src: url,
                muted: true,
                loop: true,
                autoPlay: true,
                playsInline: true,
                style: mediaStyle,
              })
            : h('img', { src: url, alt: '', style: mediaStyle })
          : h(
              'div',
              {
                style: {
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: T.muted,
                  fontSize: 12,
                },
              },
              '未设置背景',
            ),
        h('div', { style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,' + veil + ')' } }),
        h('div', { style: { position: 'absolute', inset: 0, background: 'rgba(18,19,24,' + surface + ')' } }),
        h(
          'div',
          {
            style: {
              position: 'absolute',
              left: 10,
              bottom: 10,
              fontSize: 10.5,
              color: 'rgba(255,255,255,0.88)',
              background: 'rgba(0,0,0,0.48)',
              padding: '3px 8px',
              borderRadius: 999,
            },
          },
          '暗色聊天区观感',
        ),
      )
    }

    /* ---------------- 本机文件浏览 ---------------- */

    function FileBrowser(props) {
      const [path, setPath] = React.useState(props.startPath || '')
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')

      const load = React.useCallback(async (target) => {
        setError('')
        try {
          const json = await api('/list?path=' + encodeURIComponent(target))
          setData(json)
          setPath(json.path)
        } catch (e) {
          setError(errText(e))
        }
      }, [])

      React.useEffect(() => {
        if (props.startPath) load(props.startPath)
      }, [])

      return h(
        'div',
        {
          style: {
            marginTop: 12,
            border: '1px solid ' + T.border,
            borderRadius: 10,
            background: T.card,
            overflow: 'hidden',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: 10,
              borderBottom: '1px solid ' + T.border,
              background: T.sunken,
            },
          },
          h(
            Btn,
            {
              small: true,
              disabled: !data,
              title: '上级文件夹',
              onClick: () => {
                if (data && data.parent) load(data.parent)
              },
            },
            '↑ 上级',
          ),
          props.onBrowse
            ? h(
                Btn,
                {
                  small: true,
                  onClick: props.onBrowse,
                  title: '系统对话框只显示文件夹；选中后这里会列出里面的图片/视频',
                },
                '选文件夹…',
              )
            : null,
          h('input', {
            value: path,
            placeholder: '粘贴文件夹绝对路径，例如 D:\\壁纸',
            onChange: (e) => setPath(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') load(e.currentTarget.value)
            },
            style: {
              flex: 1,
              height: 26,
              padding: '0 9px',
              borderRadius: 7,
              border: '1px solid ' + T.border2,
              background: T.card,
              color: T.text,
              font: 'inherit',
              fontSize: 12,
            },
          }),
          h(Btn, { small: true, onClick: () => load(path) }, '打开'),
          h(Btn, { small: true, onClick: props.onClose }, '收起'),
        ),
        error
          ? h('div', { style: { padding: '10px 12px', fontSize: 12, color: T.danger } }, error)
          : null,
        props.quickFolders && props.quickFolders.length > 0
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  padding: '8px 10px 0',
                },
              },
              ...props.quickFolders.map((folder) =>
                h(
                  'button',
                  {
                    key: folder.path,
                    type: 'button',
                    onClick: () => load(folder.path),
                    style: {
                      height: 24,
                      padding: '0 9px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      border: '1px solid ' + T.border,
                      background: path === folder.path ? T.accent : 'transparent',
                      color: path === folder.path ? '#fff' : T.muted,
                    },
                  },
                  folder.label,
                ),
              ),
            )
          : null,
        data
          ? h(
              'div',
              { style: { maxHeight: 300, overflow: 'auto', padding: '6px 8px 10px' } },
              h(
                'div',
                { style: { padding: '4px 6px', fontSize: 11, color: T.muted } },
                '文件夹 ' + data.dirs.length + ' · 媒体文件 ' + data.files.length,
              ),
              ...data.dirs.map((dir) =>
                h(
                  'div',
                  {
                    key: dir.path,
                    onClick: () => load(dir.path),
                    style: {
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      color: T.text,
                    },
                  },
                  '📁 ' + dir.name,
                ),
              ),
              ...data.files.map((file) =>
                h(
                  'div',
                  {
                    key: file.path,
                    onClick: () => props.onPick(file.path, file.kind, file.name),
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      color: T.text,
                    },
                  },
                  h('span', null, file.kind === 'video' ? '🎬' : '🖼'),
                  h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, file.name),
                  h('span', { style: { fontSize: 11, color: T.muted } }, fmtSize(file.size)),
                ),
              ),
              data.dirs.length === 0 && data.files.length === 0
                ? h('div', { style: { padding: 10, fontSize: 12, color: T.muted } }, '这个文件夹里没有图片或视频。')
                : null,
            )
          : h('div', { style: { padding: 12, fontSize: 12, color: T.muted } }, '选一个文件夹开始浏览。'),
      )
    }

    /* ---------------- Wallpaper Engine 浏览 ---------------- */

    function WeBrowser(props) {
      const [data, setData] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [filter, setFilter] = React.useState('all')
      const [query, setQuery] = React.useState('')

      const scan = React.useCallback(async () => {
        setBusy(true)
        setError('')
        try {
          setData(await api('/scan-we', { method: 'POST' }))
        } catch (e) {
          setError(errText(e))
        } finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        scan()
      }, [])

      const chips = [
        ['all', '全部'],
        ['video', '视频'],
        ['scene', '场景'],
        ['web', 'Web'],
      ]

      // 先按落盘路径去重（宿主旧版本会把同一个目录扫两遍），再用去重后的结果算计数
      const seenFiles = new Set()
      const all = []
      for (const entry of data ? data.entries : []) {
        const key = String(entry.file || entry.id).toLowerCase()
        if (seenFiles.has(key)) continue
        seenFiles.add(key)
        all.push(entry)
      }
      const counts = {
        all: all.length,
        video: all.filter((e) => e.type === 'video').length,
        scene: all.filter((e) => e.type === 'scene').length,
        web: all.filter((e) => e.type === 'web').length,
        playable: all.filter((e) => e.playable).length,
      }

      let entries = all
      if (filter !== 'all') entries = entries.filter((e) => e.type === filter)
      if (query.trim() !== '') {
        const q = query.trim().toLowerCase()
        entries = entries.filter((e) => e.title.toLowerCase().includes(q))
      }

      return h(
        'div',
        {
          style: {
            marginTop: 12,
            border: '1px solid ' + T.border,
            borderRadius: 10,
            background: T.card,
            overflow: 'hidden',
          },
        },
        h(
          'div',
          {
            style: {
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: 10,
              borderBottom: '1px solid ' + T.border,
              background: T.sunken,
              flexWrap: 'wrap',
            },
          },
          h(
            'span',
            { style: { fontSize: 12, color: T.muted } },
            data
              ? '已找到 ' + counts.all + ' 张 · 可实时播放 ' + counts.playable + ' 张'
              : busy
                ? '扫描中…'
                : '未扫描',
          ),
          h('div', { style: { flex: 1 } }),
          ...chips.map(([key, label]) =>
            h(
              'button',
              {
                key,
                type: 'button',
                onClick: () => setFilter(key),
                style: {
                  height: 24,
                  padding: '0 9px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: '1px solid ' + (filter === key ? T.accent : T.border),
                  background: filter === key ? T.accent : 'transparent',
                  color: filter === key ? '#fff' : T.muted,
                },
              },
              label,
            ),
          ),
          h('input', {
            value: query,
            placeholder: '搜标题',
            onChange: (e) => setQuery(e.target.value),
            style: {
              width: 120,
              height: 24,
              padding: '0 8px',
              borderRadius: 6,
              border: '1px solid ' + T.border2,
              background: T.card,
              color: T.text,
              font: 'inherit',
              fontSize: 11.5,
            },
          }),
          h(Btn, { small: true, onClick: scan, disabled: busy }, busy ? '扫描中' : '重新扫描'),
          h(Btn, { small: true, onClick: props.onClose }, '收起'),
        ),

        data && data.current && data.current.url
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderBottom: '1px solid ' + T.border,
                },
              },
              h('span', { style: { fontSize: 12, color: T.muted, flex: 1 } },
                '你桌面上现在用的是：' + (data.current.title || baseName(data.current.raw))),
              h(
                Btn,
                {
                  small: true,
                  primary: true,
                  onClick: () =>
                    props.onPick(data.current.file || data.current.raw, data.current.kind || 'video', data.current.title),
                },
                '就用这张',
              ),
            )
          : null,

        error ? h('div', { style: { padding: '10px 12px', fontSize: 12, color: T.danger } }, error) : null,

        h(
          'div',
          {
            style: {
              maxHeight: 340,
              overflow: 'auto',
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            },
          },
          ...entries.map((entry) =>
            h(
              'div',
              {
                key: entry.source + ':' + entry.id,
                onClick: () => props.onPick(entry.file, entry.playable ? 'video' : 'image', entry.title),
                title: entry.title + ' · ' + entry.type,
                style: {
                  border: '1px solid ' + T.border,
                  borderRadius: 9,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: T.card,
                },
              },
              h(
                'div',
                { style: { height: 84, background: '#000', position: 'relative' } },
                entry.previewUrl
                  ? h('img', {
                      src: entry.previewUrl,
                      alt: '',
                      loading: 'lazy',
                      style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
                    })
                  : null,
                h(
                  'span',
                  {
                    style: {
                      position: 'absolute',
                      left: 6,
                      top: 6,
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(0,0,0,0.55)',
                      color: '#fff',
                    },
                  },
                  entry.playable ? '视频' : entry.type === 'scene' ? '场景' : entry.type === 'web' ? 'Web' : entry.type,
                ),
                props.onAddItem
                  ? h(
                      'button',
                      {
                        type: 'button',
                        title: '加入轮播列表',
                        onClick: (e) => {
                          e.stopPropagation()
                          props.onAddItem(entry.file, entry.playable ? 'video' : 'image', entry.title)
                        },
                        style: {
                          position: 'absolute',
                          right: 6,
                          top: 6,
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: '1px solid rgba(255,255,255,0.35)',
                          background: 'rgba(0,0,0,0.5)',
                          color: '#fff',
                          fontSize: 13,
                          lineHeight: '18px',
                          cursor: 'pointer',
                          padding: 0,
                        },
                      },
                      '＋',
                    )
                  : null,
              ),
              h(
                'div',
                {
                  style: {
                    padding: '6px 8px',
                    fontSize: 11.5,
                    lineHeight: 1.4,
                    color: T.text,
                    maxHeight: 44,
                    overflow: 'hidden',
                  },
                },
                entry.title,
              ),
            ),
          ),
        ),

        data && entries.length === 0
          ? h('div', { style: { padding: 14, fontSize: 12, color: T.muted } }, '这个筛选下没有壁纸。')
          : null,
        data && data.dirs && data.dirs.length === 0
          ? h(
              'div',
              { style: { padding: '0 12px 12px', fontSize: 11.5, color: T.danger } },
              '没找到 Wallpaper Engine 安装目录；可以在下方手动填它的路径。',
            )
          : null,
      )
    }

    /* ---------------- 设置页 ---------------- */

    function SettingsPage() {
      const [cfg, setCfg] = React.useState(null)
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [filePanel, setFilePanel] = React.useState(null)
      const [browseHint, setBrowseHint] = React.useState('')
      const [weOpen, setWeOpen] = React.useState(false)

      const load = React.useCallback(async () => {
        try {
          setCfg(await api('/config.json'))
          setError('')
        } catch (e) {
          setError(errText(e))
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [])

      const saveTimer = React.useRef(0)
      const patch = React.useCallback((part, message) => {
        // 深一层合并：{appearance:{veil:0.5}} 不能把 appearance 的其它字段冲掉
        setCfg((prev) => {
          if (!prev) return prev
          const next = Object.assign({}, prev)
          Object.keys(part).forEach((key) => {
            const value = part[key]
            const isPlainObject =
              value && typeof value === 'object' && !Array.isArray(value) &&
              next[key] && typeof next[key] === 'object'
            next[key] = isPlainObject ? Object.assign({}, next[key], value) : value
          })
          return next
        })
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(async () => {
          try {
            await api('/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(part),
            })
            setNotice(message || '已保存')
            setError('')
            window.setTimeout(() => setNotice(''), 2600)
          } catch (e) {
            setError(errText(e))
          }
        }, 260)
      }, [])

      if (error && !cfg) {
        return h('div', { style: { padding: 24, fontSize: 13, color: T.danger } }, VERSION + '：' + error)
      }
      if (!cfg) {
        return h('div', { style: { padding: 24, fontSize: 13, color: T.muted } }, '读取配置中…')
      }

      const appearance = cfg.appearance || {}
      const boot = cfg.boot || {}
      const background = cfg.background || {}

      /** 拖滑杆：先把新值推给页面（立刻能看出来），再落盘。 */
      const setLook = (key, value) => {
        const next = Object.assign({}, appearance, { [key]: value })
        pushLook(next)
        patch({ appearance: { [key]: value } })
      }

      const runtimeLive = !!(
        typeof window !== 'undefined' &&
        window.__WPS__ &&
        typeof window.__WPS__.applyLook === 'function'
      )

      /** 换完壁纸让页面立刻重建背景层，不用刷新。 */
      const refreshBackdrop = () => refreshPageBackdrop()

      const pickBackground = (file, kind, title) => {
        patch(
          { background: { enabled: true, file, title: title || baseName(file), source: 'local' } },
          '背景已应用',
        )
        // 等落盘完成再让页面重建背景层
        window.setTimeout(refreshBackdrop, 900)
        setFilePanel(null)
        setWeOpen(false)
      }

      const pickBoot = (file, kind, title) => {
        patch({ boot: { file } }, '片头已保存 · 完全重启 DSH 后生效')
        setFilePanel(null)
        setWeOpen(false)
      }

      /* ---- 轮播 ---- */
      const rotationCfg = cfg.rotation || {}
      const rotationItems = Array.isArray(rotationCfg.items) ? rotationCfg.items : []
      const rotationPool = rotationCfg.poolSize || 0

      const addToPlaylist = (file, kind, title) => {
        if (!file) return
        const items = rotationItems.slice()
        if (items.some((it) => it.file === file)) {
          setNotice('这张已经在轮播列表里了')
          return
        }
        items.push({ file, title: title || baseName(file), kind: kind === 'video' ? 'video' : 'image' })
        patch({ rotation: { items } }, '已加入轮播列表 · 刷新页面生效')
      }

      const removeFromPlaylist = (file) => {
        const items = rotationItems.filter((it) => it.file !== file)
        patch({ rotation: { items } }, '已移出轮播列表 · 刷新页面生效')
      }

      const pickRotationFolder = async () => {
        const result = await pickFolder()
        if (result.path) patch({ rotation: { folder: result.path } }, '已设置轮播文件夹 · 刷新页面生效')
        else setNotice(result.error || '已取消')
      }

      const toggleRotation = (on) => {
        patch({ rotation: { enabled: on } }, on ? '轮播已开启' : '轮播已关闭 · 固定用当前背景')
        try {
          if (window.__WPS__ && typeof window.__WPS__.setRotation === 'function') {
            window.__WPS__.setRotation(on)
          }
        } catch (e) {
          /* 运行时不可用就等刷新 */
        }
      }

      /** 在页面里直接预览片头（不用重启 DSH），点任意处 / Esc 关闭。 */
      const previewBoot = () => {
        const url = boot.url
        if (!url) return
        const isVideo = boot.kind === 'video'

        // 关键：预览期间把背景视频停掉。
        // 两个全屏视频同时解码 + 同时合成会互相抢 GPU，预览就一卡一卡；
        // 而真正的开机时刻应用还没起来、背景层也不存在，所以这里暂停不影响还原真实观感。
        const backdropVideo = document.querySelector('#wps-backdrop video')
        const backdropWasPlaying = !!(backdropVideo && !backdropVideo.paused)
        if (backdropWasPlaying) {
          try {
            backdropVideo.pause()
          } catch (e) {
            /* ignore */
          }
        }

        const overlay = document.createElement('div')
        overlay.setAttribute('data-wps-preview', '1')
        overlay.style.cssText =
          'position:fixed;inset:0;z-index:2147483000;background:#05070f;cursor:pointer;opacity:0;transition:opacity .3s ease'

        const media = document.createElement(isVideo ? 'video' : 'img')
        media.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0'
        if (isVideo) {
          media.muted = true
          media.playsInline = true
          media.preload = 'auto'
        }
        media.src = url

        const tip = document.createElement('div')
        tip.textContent = isVideo ? '片头预览 · 载入中…' : '片头预览 · 点击任意处关闭'
        tip.style.cssText =
          'position:absolute;right:16px;bottom:16px;font:11.5px/1 "Microsoft YaHei UI",system-ui,sans-serif;' +
          'color:rgba(255,255,255,.85);background:rgba(0,0,0,.45);padding:6px 11px;border-radius:999px'

        overlay.appendChild(media)
        overlay.appendChild(tip)

        let closed = false
        const close = () => {
          if (closed) return
          closed = true
          overlay.style.opacity = '0'
          window.setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
          }, 320)
          document.removeEventListener('keydown', onKey)
          // 恢复背景视频（只有原本在播才恢复，不改变用户的暂停状态）
          if (backdropWasPlaying && backdropVideo) {
            try {
              const p = backdropVideo.play()
              if (p && p.catch) p.catch(() => {})
            } catch (e) {
              /* ignore */
            }
          }
        }
        const onKey = (e) => {
          if (e.key === 'Escape') close()
        }

        overlay.addEventListener('click', close)
        document.addEventListener('keydown', onKey)
        document.body.appendChild(overlay)
        window.requestAnimationFrame(() => {
          overlay.style.opacity = '1'
        })

        if (isVideo) {
          media.addEventListener('ended', close)
          media.addEventListener('error', close)
          media.addEventListener(
            'playing',
            () => {
              tip.textContent = '片头预览 · 点击任意处关闭'
            },
            { once: true },
          )
          // 等能连续播了再开始，避免开头几帧卡顿看起来像"预览卡"
          const startPlay = () => {
            const p = media.play()
            if (p && p.catch) p.catch(() => close())
          }
          if (media.readyState >= 3) startPlay()
          else media.addEventListener('canplay', startPlay, { once: true })
        } else {
          window.setTimeout(close, 3000)
        }
      }

      const openFilePanel = (target, startPath) => {
        // 默认落到最可能的位置：当前文件所在目录 > 图片 > 视频 > home
        let fallback = cfg.home || ''
        const current = target === 'boot' ? boot.file : background.file
        if (current) {
          const dir = String(current).replace(/[\\/][^\\/]*$/, '')
          if (dir) fallback = dir
        } else if (cfg.folders && cfg.folders.length > 0) {
          fallback = cfg.folders[0].path
        }
        setFilePanel({ target, startPath: startPath !== undefined ? startPath : fallback })
      }

      /** 打开系统文件夹选择器；返回 { path } 或 { error }。 */
      const pickFolder = async () => {
        try {
          const remote = remoteRef.current
          const picker = remote && remote.directoryPicker
          if (picker && typeof picker.pick === 'function') {
            const picked = await picker.pick()
            if (picked) return { path: picked }
            return { error: '已取消选择' }
          }
        } catch (e) {
          /* 落到宿主兜底 */
        }
        try {
          const capRes = await fetch(BASE + '/pick-capability', { credentials: 'same-origin' })
          const cap = await capRes.json().catch(() => null)
          if (!cap || !cap.available) {
            return {
              error:
                '这个版本没有可用的系统文件夹选择器：直接在上面输入框粘贴路径，或用「图片 / 视频 / 桌面 / 下载」快捷入口',
            }
          }
          const res = await fetch(BASE + '/pick', { method: 'POST', credentials: 'same-origin' })
          const json = await res.json().catch(() => null)
          if (json && json.ok && json.path) return { path: json.path }
          return { error: (json && json.error) || '已取消选择' }
        } catch (e) {
          return { error: '打开系统选择器失败：' + errText(e) + '（可以直接粘贴路径）' }
        }
      }

      const browseDir = async (target) => {
        setBrowseHint('')
        const result = await pickFolder()
        if (result.path) {
          setFilePanel({ target, startPath: result.path })
        } else {
          setBrowseHint(result.error || '没能打开选择器')
        }
      }

      const panelFor = (target) =>
        filePanel && filePanel.target === target
          ? h(
              React.Fragment,
              null,
              browseHint
                ? h(
                    'div',
                    {
                      style: {
                        marginTop: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        lineHeight: 1.7,
                        color: '#d97706',
                        background: 'rgba(217,119,6,0.10)',
                        border: '1px solid rgba(217,119,6,0.28)',
                      },
                    },
                    browseHint,
                  )
                : null,
              h(FileBrowser, {
                key: filePanel.startPath || 'root',
                startPath: filePanel.startPath,
                quickFolders: cfg.folders || [],
                onBrowse: () => browseDir(target),
                onPick: target === 'boot' ? pickBoot : pickBackground,
                onClose: () => setFilePanel(null),
              }),
            )
          : null

      return h(
        'div',
        { style: { padding: '6px 2px 48px', color: T.text, maxWidth: 880 } },
        h('h2', { style: { margin: '0 0 6px', fontSize: 20, fontWeight: 650 } }, '壁纸与片头'),
        h(
          'p',
          { style: { margin: '0 0 4px', fontSize: 13, lineHeight: 1.7, color: T.muted } },
          '给界面铺一张底图或一段动态壁纸，并在启动时播放一段片头。壁纸支持本机图片/视频，以及 Wallpaper Engine 的视频壁纸。',
        ),
        h('p', { style: { margin: '0 0 18px', fontSize: 11, color: T.muted } },
          VERSION + (notice ? ' · ' + notice : '')),

        error ? h('div', { style: { marginBottom: 12, fontSize: 12, color: T.danger } }, error) : null,

        /* ---- 背景 ---- */
        h(Section, { title: '当前背景' },
          h(
            'div',
            {
              style: {
                display: 'flex',
                gap: 16,
                padding: 14,
                border: '1px solid ' + T.border,
                borderRadius: 12,
                background: T.card,
              },
            },
            h('div', { style: { width: 220, flex: 'none' } },
              h(Thumb, { url: background.url, kind: background.kind })),
            h(
              'div',
              { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } },
              h(
                'div',
                { style: { fontSize: 15, fontWeight: 600, marginBottom: 6 } },
                background.title || (background.file ? baseName(background.file) : '未设置背景'),
              ),
              h(
                'div',
                { style: { fontSize: 12, lineHeight: 1.8, color: T.muted, wordBreak: 'break-all' } },
                background.file
                  ? (background.kind === 'video' ? '视频 · 静音循环' : '图片') + ' · ' + background.file
                  : '选一张图或一段视频，铺在聊天界面背后。',
              ),
              background.missing
                ? h('div', { style: { fontSize: 12, color: T.danger, marginTop: 6 } },
                    '文件不见了（可能被移动或删除），重新选一张。')
                : null,
              h('div', { style: { flex: 1 } }),
              h(
                'div',
                { style: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' } },
                h(Btn, { primary: true, onClick: () => openFilePanel('background') }, '选择本机文件'),
                h(Btn, { onClick: () => setWeOpen((v) => !v) }, weOpen ? '收起 Wallpaper Engine' : 'Wallpaper Engine'),
                background.file
                  ? h(
                      Btn,
                      {
                        danger: true,
                        onClick: () => {
                          patch({ background: { enabled: false, file: '', title: '' } }, '背景已移除')
                          window.setTimeout(refreshBackdrop, 900)
                        },
                      },
                      '移除',
                    )
                  : null,
              ),
            ),
          ),
          panelFor('background'),
          weOpen
            ? h(WeBrowser, {
                onPick: pickBackground,
                onClose: () => setWeOpen(false),
                onAddItem: addToPlaylist,
              })
            : null,
        ),

        /* ---- 轮播 ---- */
        h(Section, { title: '轮播' },
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: 14,
                border: '1px solid ' + T.border,
                borderRadius: 12,
                background: T.card,
              },
            },
            h(Check, {
              label: '启用轮播（关闭后固定使用上面的背景）',
              checked: rotationCfg.enabled === true,
              onChange: toggleRotation,
            }),
            h(
              'div',
              { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('span', { style: { fontSize: 12, color: T.muted, width: 72, flex: 'none' } }, '素材来源'),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => patch({ rotation: { source: 'list' } }, '已保存 · 刷新页面生效'),
                  style: segStyle(rotationCfg.source !== 'folder'),
                },
                'WE 播放列表',
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => patch({ rotation: { source: 'folder' } }, '已保存 · 刷新页面生效'),
                  style: segStyle(rotationCfg.source === 'folder'),
                },
                '文件夹',
              ),
              h('div', { style: { flex: 1 } }),
              h(
                'span',
                { style: { fontSize: 11.5, color: T.muted } },
                rotationPool > 0 ? '壁纸池 ' + rotationPool + ' 张' : '壁纸池为空',
              ),
            ),

            rotationCfg.source === 'folder'
              ? h(
                  'div',
                  { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                  h(
                    'span',
                    {
                      style: {
                        fontSize: 11.5,
                        color: T.muted,
                        flex: 1,
                        minWidth: 160,
                        wordBreak: 'break-all',
                      },
                    },
                    rotationCfg.folder || '还没有选择文件夹（只看一层，图片和视频都会收）',
                  ),
                  h(Btn, { small: true, onClick: pickRotationFolder }, '选择文件夹'),
                )
              : h(
                  'div',
                  { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                  h(
                    'div',
                    { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                    h('span', { style: { fontSize: 11.5, color: T.muted } }, '已选 ' + rotationItems.length + ' 张'),
                    h(Btn, {
                      small: true,
                      onClick: () => {
                        setWeOpen(true)
                        setNotice('在下面的 Wallpaper Engine 面板里点卡片右上角「＋」加入')
                      },
                    }, '去 Wallpaper Engine 里挑'),
                    rotationItems.length > 0
                      ? h(Btn, {
                          small: true,
                          danger: true,
                          onClick: () => patch({ rotation: { items: [] } }, '已清空轮播列表'),
                        }, '清空')
                      : null,
                  ),
                  rotationItems.length > 0
                    ? h(
                        'div',
                        { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                        ...rotationItems.slice(0, 12).map((item) =>
                          h(
                            'span',
                            {
                              key: item.file,
                              style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: T.sunken,
                                border: '1px solid ' + T.border,
                              },
                            },
                            (item.title || baseName(item.file)).slice(0, 18),
                            h(
                              'span',
                              {
                                onClick: () => removeFromPlaylist(item.file),
                                style: { cursor: 'pointer', opacity: 0.6 },
                              },
                              '✕',
                            ),
                          ),
                        ),
                      )
                    : h(
                        'div',
                        { style: { fontSize: 11.5, color: T.muted } },
                        '列表是空的：在 Wallpaper Engine 面板里点卡片右上角「＋」加入。',
                      ),
                ),

            h(Slider, {
              label: '切换间隔',
              value: rotationCfg.intervalMin || 30,
              min: 1,
              max: 240,
              step: 1,
              onChange: (v) => patch({ rotation: { intervalMin: v } }, '已保存 · 刷新页面生效'),
              format: (v) => v + ' 分钟',
              hint: '到点自动换下一张',
            }),
            h(
              'div',
              { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              h('span', { style: { fontSize: 12, color: T.muted, width: 72, flex: 'none' } }, '切换方式'),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => patch({ rotation: { mode: 'sequential' } }, '已保存 · 刷新页面生效'),
                  style: segStyle(rotationCfg.mode !== 'random'),
                },
                '顺序',
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => patch({ rotation: { mode: 'random' } }, '已保存 · 刷新页面生效'),
                  style: segStyle(rotationCfg.mode === 'random'),
                },
                '随机',
              ),
            ),
            h(Slider, {
              label: '切换淡入',
              value: typeof rotationCfg.fadeMs === 'number' ? rotationCfg.fadeMs : 700,
              min: 0,
              max: 2000,
              step: 100,
              onChange: (v) => patch({ rotation: { fadeMs: v } }, '已保存 · 刷新页面生效'),
              format: (v) => v + ' ms',
              hint: '交叉淡入，避免硬切',
            }),
          ),
        ),

        /* ---- 外观 ---- */
        h(Section, { title: '外观（拖动即时生效）' },
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h(
              'div',
              {
                style: {
                  padding: '2px 16px',
                  border: '1px solid ' + T.border,
                  borderRadius: 12,
                  background: T.card,
                },
              },
              h(Slider, {
                label: '蒙版浓度',
                value: appearance.veil,
                min: 0,
                max: 1,
                step: 0.01,
                onChange: (v) => setLook('veil', v),
                format: (v) => Math.round(v * 100) + '%',
                hint: '压暗画面，越大字越清楚',
              }),
              h(Slider, {
                label: '背景模糊',
                value: appearance.blur,
                min: 0,
                max: 24,
                step: 1,
                onChange: (v) => setLook('blur', v),
                format: (v) => v + ' px',
                hint: '只糊壁纸，不碰文字',
              }),
              h(Slider, {
                label: '画布不透明度',
                value: appearance.surface,
                min: 0,
                max: 1,
                step: 0.01,
                onChange: (v) => setLook('surface', v),
                format: (v) => Math.round(v * 100) + '%',
                hint: '暗色主题下的画布/侧栏',
              }),
              h(Slider, {
                label: '画布不透明度（亮）',
                value: appearance.surfaceLight,
                min: 0,
                max: 1,
                step: 0.01,
                onChange: (v) => setLook('surfaceLight', v),
                format: (v) => Math.round(v * 100) + '%',
                hint: '亮色主题下单独一套',
              }),
            ),
            h(LookPreview, {
              url: background.url,
              kind: background.kind,
              veil: appearance.veil,
              blur: appearance.blur,
              surface: appearance.surface,
            }),
            h(
              'div',
              { style: { fontSize: 11.5, lineHeight: 1.7, color: runtimeLive ? T.muted : '#d97706' } },
              runtimeLive
                ? '上面这块就是聊天区的实际观感；拖动滑杆会同时作用到这个预览和主界面。'
                : '⚠ 页面里的运行时是旧版本：改动已用兼容方式直接生效，建议刷新一次页面（F5）恢复正常链路。',
            ),
          ),
          h('div', { style: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 } },
            h(Check, {
              label: '检测到其他壁纸插件时自动让路',
              checked: cfg.autoYield !== false,
              onChange: (v) => patch({ we: { autoYield: v } }, '已保存'),
            }),
            h(Check, {
              label: '显示右下角快捷面板',
              checked: !cfg.overlay || cfg.overlay.enabled !== false,
              onChange: (v) => patch({ overlay: { enabled: v } }, '已保存 · 刷新页面生效'),
            })),
        ),

        /* ---- 片头 ---- */
        h(Section, { title: '片头' },
          h(
            'div',
            {
              style: {
                display: 'flex',
                gap: 16,
                padding: 14,
                border: '1px solid ' + T.border,
                borderRadius: 12,
                background: T.card,
              },
            },
            h('div', { style: { width: 220, flex: 'none' } },
              h(Thumb, { url: boot.url, kind: boot.kind, h: 110 })),
            h(
              'div',
              { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' } },
              h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 8 } },
                boot.file ? baseName(boot.file) : '未设置片头（走 DSH 原生启动页）'),
              h(
                'div',
                { style: { display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 } },
                h(Check, {
                  label: '启用片头',
                  checked: boot.enabled !== false,
                  onChange: (v) => patch({ boot: { enabled: v } }, '已保存 · 完全重启 DSH 后生效'),
                }),
                h(Check, {
                  label: '带声音',
                  checked: boot.sound !== false,
                  onChange: (v) => patch({ boot: { sound: v } }, '已保存 · 完全重启 DSH 后生效'),
                }),
              ),
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', marginBottom: 8 } },
                h(Slider, {
                  label: '展示时长',
                  value: boot.durationSec || 0,
                  min: 0,
                  max: 30,
                  step: 1,
                  onChange: (v) => patch({ boot: { durationSec: v } }, '已保存 · 完全重启 DSH 后生效'),
                  format: (v) => (v > 0 ? v + ' 秒' : '随素材'),
                  hint: '0 = 播完自然结束',
                }),
                h(Slider, {
                  label: '淡出时长',
                  value: boot.fadeMs,
                  min: 0,
                  max: 3000,
                  step: 50,
                  onChange: (v) => patch({ boot: { fadeMs: v } }, '已保存 · 完全重启 DSH 后生效'),
                  format: (v) => v + ' ms',
                  hint: '固定值，不会缩成硬切',
                }),
              ),
              h('div', { style: { flex: 1 } }),
              h(
                'div',
                { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 } },
                boot.url ? h(Btn, { onClick: previewBoot }, '▶ 预览片头') : null,
                h(Btn, { primary: true, onClick: () => openFilePanel('boot') }, '选择片头文件'),
                boot.file
                  ? h(
                      Btn,
                      {
                        danger: true,
                        onClick: () => patch({ boot: { file: '' } }, '片头已移除 · 完全重启 DSH 后生效'),
                      },
                      '移除',
                    )
                  : null,
              ),
            ),
          ),
          panelFor('boot'),
          h(
            'div',
            {
              style: {
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 9,
                fontSize: 11.5,
                lineHeight: 1.7,
                color: T.muted,
                border: '1px dashed ' + T.border2,
              },
            },
            '片头走的是 DSH 启动期的一次性注入表，改完必须完全退出并重新打开 DSH 才生效（刷新页面不够）。背景改完刷新页面即可。',
          ),
        ),
      )
    }

    /* ---------------- 右下角快捷面板 ---------------- */

    function MiniSlider(props) {
      const { label, value, onChange, format } = props
      return h(
        'div',
        { style: { marginBottom: 9 } },
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'rgba(255,255,255,0.62)',
              marginBottom: 4,
            },
          },
          h('span', null, label),
          h('b', { style: { fontWeight: 500, color: 'rgba(255,255,255,0.92)' } }, format(value)),
        ),
        h('input', {
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          value,
          onChange: (e) => onChange(Number(e.target.value)),
          style: { width: '100%', accentColor: '#4d6bfe', cursor: 'pointer' },
        }),
      )
    }

    const FAB_STYLE = {
      position: 'fixed',
      right: 20,
      bottom: 84, // 让开右下角的小鲸鱼挂件
      width: 46,
      height: 46,
      borderRadius: '50%',
      background: 'rgba(26,27,33,0.92)',
      border: '1px solid rgba(255,255,255,0.16)',
      boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: 2147482000,
    }

    const PANEL_STYLE = {
      position: 'fixed',
      right: 20,
      bottom: 140,
      width: 296,
      borderRadius: 14,
      overflow: 'hidden',
      background: 'rgba(26,27,33,0.94)',
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
      color: '#eef0f4',
      zIndex: 2147482000,
      fontFamily: '"Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif',
    }

    function QuickPanel() {
      const [cfg, setCfg] = React.useState(null)
      const [open, setOpen] = React.useState(false)
      const [paused, setPaused] = React.useState(false)
      const saveTimer = React.useRef(0)

      const load = React.useCallback(async () => {
        try {
          setCfg(await api('/config.json'))
        } catch (e) {
          /* 宿主不可达就保持上次的值 */
        }
      }, [])

      React.useEffect(() => {
        load()
      }, [])

      // 旧宿主没有 overlay 字段 → 视为开启
      if (!cfg || (cfg.overlay && cfg.overlay.enabled === false)) return null

      const look = cfg.appearance || {}
      const bg = cfg.background || {}
      const title = bg.title || (bg.file ? baseName(bg.file) : '未设置背景')

      const commit = (key, value) => {
        const next = Object.assign({}, look, { [key]: value })
        setCfg((prev) => (prev ? Object.assign({}, prev, { appearance: next }) : prev))
        pushLook(next)
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
          api('/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appearance: { [key]: value } }),
          }).catch(() => {})
        }, 260)
      }

      const togglePause = () => {
        try {
          if (window.__WPS__ && typeof window.__WPS__.togglePause === 'function') {
            setPaused(!!window.__WPS__.togglePause())
            return
          }
        } catch (e) {
          /* ignore */
        }
        setPaused((v) => !v)
      }

      const toggle = () => {
        const next = !open
        setOpen(next)
        if (next) load()
      }

      const rot = cfg.rotation || {}
      const rotEnabled = !!rot.enabled
      const rotPool = rot.poolSize || 0

      const toggleRotation = () => {
        const on = !rotEnabled
        setCfg((prev) =>
          prev ? Object.assign({}, prev, { rotation: Object.assign({}, prev.rotation || {}, { enabled: on }) }) : prev,
        )
        try {
          if (window.__WPS__ && typeof window.__WPS__.setRotation === 'function') window.__WPS__.setRotation(on)
        } catch (e) {
          /* ignore */
        }
        fetch(BASE + '/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rotation: { enabled: on } }),
          credentials: 'same-origin',
        }).catch(() => {})
      }

      const nextOne = () => {
        try {
          if (window.__WPS__ && typeof window.__WPS__.nextWallpaper === 'function') window.__WPS__.nextWallpaper()
        } catch (e) {
          /* ignore */
        }
        window.setTimeout(load, 500)
      }

      return h(
        React.Fragment,
        null,
        open
          ? h(
              'div',
              { style: PANEL_STYLE },
              h(
                'div',
                {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '11px 13px',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 12.5,
                    fontWeight: 600,
                  },
                },
                '壁纸',
                h(
                  'span',
                  {
                    style: {
                      fontSize: 10,
                      fontWeight: 500,
                      padding: '2px 6px',
                      borderRadius: 5,
                      background: 'rgba(74,222,128,0.16)',
                      color: '#4ade80',
                    },
                  },
                  paused ? '已暂停' : '运行中',
                ),
                h('div', { style: { flex: 1 } }),
                h(
                  'span',
                  {
                    onClick: () => setOpen(false),
                    style: { opacity: 0.45, fontSize: 12, cursor: 'pointer', padding: '0 2px' },
                  },
                  '✕',
                ),
              ),
              h(
                'div',
                { style: { padding: '11px 13px 4px' } },
                h(
                  'div',
                  { style: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 } },
                  h('div', { style: { width: 68, flex: 'none' } }, h(Thumb, {
                    url: bg.url,
                    kind: bg.kind,
                    h: 40,
                  })),
                  h(
                    'div',
                    { style: { minWidth: 0 } },
                    h(
                      'div',
                      {
                        style: {
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        },
                      },
                      title,
                    ),
                    h(
                      'div',
                      { style: { fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 2 } },
                      (bg.kind === 'video' ? '视频 · 循环' : bg.kind === 'image' ? '图片' : '未设置') +
                        (rotPool > 0 ? ' · 轮播池 ' + rotPool + ' 张' : ''),
                    ),
                  ),
                ),
                h(MiniSlider, {
                  label: '蒙版',
                  value: look.veil,
                  onChange: (v) => commit('veil', v),
                  format: (v) => Math.round(v * 100) + '%',
                }),
                h(MiniSlider, {
                  label: '画布不透明度',
                  value: look.surface,
                  onChange: (v) => commit('surface', v),
                  format: (v) => Math.round(v * 100) + '%',
                }),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, marginTop: 10 } },
                  h(
                    'button',
                    { type: 'button', onClick: togglePause, style: panelButtonStyle },
                    paused ? '继续播放' : '暂停背景',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: nextOne,
                      style: Object.assign({}, panelButtonStyle, {
                        opacity: !rotEnabled || rotPool < 2 ? 0.45 : 1,
                        cursor: !rotEnabled || rotPool < 2 ? 'not-allowed' : 'pointer',
                      }),
                    },
                    '下一张',
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 6, marginTop: 6, marginBottom: 12 } },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: toggleRotation,
                      style: Object.assign({}, panelButtonStyle, {
                        color: rotEnabled ? '#4ade80' : 'rgba(255,255,255,0.88)',
                      }),
                    },
                    rotEnabled ? '轮播：开 · 点此关闭' : '轮播：关 · 点此开启',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      title: '重新加载页面：运行时（壁纸/片头渲染）的改动靠它生效。正式版没有 F5，客户端改动仍需重启。',
                      onClick: () => {
                        try {
                          window.location.reload()
                        } catch (e) {
                          /* ignore */
                        }
                      },
                      style: Object.assign({}, panelButtonStyle, { flex: '0 0 96px' }),
                    },
                    '重载页面',
                  ),
                ),
              ),
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            style: FAB_STYLE,
            title: open ? '收起壁纸面板' : '壁纸快速设置',
            onClick: toggle,
          },
          h(
            'svg',
            {
              width: 20,
              height: 20,
              viewBox: '0 0 16 16',
              fill: 'none',
              stroke: '#e8eaf2',
              strokeWidth: 1.3,
            },
            h('rect', { x: 1.8, y: 3, width: 12.4, height: 10, rx: 2 }),
            h('path', { d: 'M4.2 10.4l2.3-2.6 1.5 1.6 1.9-2.5 1.9 3.5' }),
            h('circle', { cx: 10.6, cy: 5.9, r: 1 }),
          ),
        ),
      )
    }

    const panelButtonStyle = {
      flex: 1,
      height: 28,
      borderRadius: 7,
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: 'rgba(255,255,255,0.88)',
      fontSize: 11.5,
      fontFamily: 'inherit',
      cursor: 'pointer',
    }



    /* ---------------- 装配 ---------------- */

    let remoteRef = { current: null }

    return {
      inject: ['slots', 'remote'],
      apply(ctx) {
        remoteRef.current = ctx.remote
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'wallpaper-intro',
              order: 47,
              label: () => '壁纸与片头',
            },
            () => {
              try {
                return h(SettingsPage)
              } catch (error) {
                return h(
                  'pre',
                  { style: { padding: 20, fontSize: 12, whiteSpace: 'pre-wrap', color: '#dc2626' } },
                  '壁纸与片头渲染失败：' + errText(error),
                )
              }
            },
          ),
        )

        // 右下角快捷面板（可在设置里关掉）
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'wallpaper-intro-quick',
              order: 60,
            },
            () => {
              try {
                return h(QuickPanel)
              } catch (error) {
                return null
              }
            },
          ),
        )
      },
    }
  },
})
