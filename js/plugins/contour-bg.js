// 等高线背景：离屏渲染一次并缓存，尺寸/主题变化时才重新生成
(function () {
  const canvas = document.getElementById('background-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  // 渲染到离屏画布，主画布直接 drawImage —— 这就是"缓存"
  const offscreen = document.createElement('canvas')
  let offCtx = offscreen.getContext('2d')
  let lastKey = '' // 尺寸+主题 组成缓存 key，变了才重新生成

  const contourLevels = 12
  const minCellSize = 3 // 单元格最小边长，控制计算量

  const mediaDark = window.matchMedia('(prefers-color-scheme: dark)')

  function isDark() {
    const t = document.documentElement.getAttribute('data-theme')
    if (t === 'dark') return true
    if (t === 'light') return false
    return mediaDark.matches
  }

  function renderToOffscreen(w, h) {
    offscreen.width = w
    offscreen.height = h
    offCtx = offscreen.getContext('2d')
    if (typeof SimplexNoise === 'undefined') return

    const simplex = new SimplexNoise()
    const cellSize = Math.max(minCellSize, Math.min(w, h) / 320)
    const cols = Math.ceil(w / cellSize)
    const rows = Math.ceil(h / cellSize)

    // 用主题的 --background 变量填充底色，与主题深浅色保持一致
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    if (bg) {
      offCtx.fillStyle = bg
      offCtx.fillRect(0, 0, w, h)
    }

    // 深色模式用白线，浅色模式用黑线
    const lineColor = isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
    offCtx.strokeStyle = lineColor
    offCtx.lineWidth = 1

    // 生成高度图（按 cell 采样，不是按像素）
    const heightMap = []
    for (let y = 0; y <= rows; y++) {
      heightMap[y] = []
      for (let x = 0; x <= cols; x++) {
        heightMap[y][x] = simplex.noise2D((x / cols) * 3, (y / rows) * 3)
      }
    }

    function drawSmoothLine(points) {
      if (points.length < 2) return
      offCtx.beginPath()
      offCtx.moveTo(points[0][0], points[0][1])
      for (let i = 1; i < points.length - 2; i++) {
        const xc = (points[i][0] + points[i + 1][0]) / 2
        const yc = (points[i][1] + points[i + 1][1]) / 2
        offCtx.quadraticCurveTo(points[i][0], points[i][1], xc, yc)
      }
      const n = points.length
      offCtx.quadraticCurveTo(points[n - 2][0], points[n - 2][1], points[n - 1][0], points[n - 1][1])
      offCtx.stroke()
    }

    function drawContour(level) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const tl = heightMap[y][x]
          const tr = heightMap[y][x + 1]
          const br = heightMap[y + 1][x + 1]
          const bl = heightMap[y + 1][x]
          const sx = x * cellSize
          const sy = y * cellSize

          const interpolate = (v1, v2, p1, p2) => {
            const t = (level - v1) / (v2 - v1)
            return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t]
          }
          const points = []
          if ((tl - level) * (tr - level) < 0) points.push(interpolate(tl, tr, [sx, sy], [sx + cellSize, sy]))
          if ((tr - level) * (br - level) < 0) points.push(interpolate(tr, br, [sx + cellSize, sy], [sx + cellSize, sy + cellSize]))
          if ((br - level) * (bl - level) < 0) points.push(interpolate(br, bl, [sx + cellSize, sy + cellSize], [sx, sy + cellSize]))
          if ((bl - level) * (tl - level) < 0) points.push(interpolate(bl, tl, [sx, sy + cellSize], [sx, sy]))
          if (points.length >= 2) drawSmoothLine(points)
        }
      }
    }

    for (let i = 0; i < contourLevels; i++) {
      drawContour(-1 + (2 * i) / contourLevels)
    }
  }

  function redraw() {
    const w = (canvas.width = window.innerWidth)
    const h = (canvas.height = window.innerHeight)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    const key = `${w}x${h}-${bg || (isDark() ? 'dark' : 'light')}`
    if (key !== lastKey) {
      lastKey = key
      renderToOffscreen(w, h) // 重新生成并更新缓存
    }
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(offscreen, 0, 0) // 从缓存绘制
  }

  // resize 防抖：停止 200ms 后才重绘，避免频繁重算
  let timer = null
  window.addEventListener('resize', () => {
    clearTimeout(timer)
    timer = setTimeout(redraw, 200)
  })
  // 系统深浅色切换时更新线条颜色
  mediaDark.addEventListener('change', redraw)
  // 主题内手动切换深浅色（data-theme 属性变化）时更新
  new MutationObserver(redraw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  redraw()
})()
