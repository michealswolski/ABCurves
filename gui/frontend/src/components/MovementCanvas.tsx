import React, { useRef, useEffect, useCallback, useState } from 'react'

interface FovOverlay {
  dpi: number
  sensitivity: number
  fovH: number
  screenW: number
}

interface MovementCanvasProps {
  prefix: [number, number][]
  continuation: [number, number][]
  target: [number, number] | null
  targetRadius?: number
  width?: number
  height?: number
  onTargetClick?: (x: number, y: number) => void
  fovOverlay?: FovOverlay | null
  predictedTarget?: [number, number] | null
  trackingVelocityCps?: [number, number] | null
}

function integrateDeltas(deltas: [number, number][], sx = 0, sy = 0): [number, number][] {
  const pts: [number, number][] = [[sx, sy]]
  let x = sx, y = sy
  for (const [dx, dy] of deltas) { x += dx; y += dy; pts.push([x, y]) }
  return pts
}

function fitToCanvas(
  points: [number, number][],
  targetPt: [number, number] | null,
  w: number, h: number, padding = 50
): { scale: number; offsetX: number; offsetY: number } {
  const all = [...points]
  if (targetPt) all.push(targetPt)
  if (all.length === 0) return { scale: 1, offsetX: 0, offsetY: 0 }
  const xs = all.map(p => p[0]), ys = all.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const rX = maxX - minX || 1, rY = maxY - minY || 1
  const scale = Math.min((w - padding * 2) / rX, (h - padding * 2) / rY)
  const offX = padding - minX * scale + ((w - padding * 2) - rX * scale) / 2
  const offY = padding - minY * scale + ((h - padding * 2) - rY * scale) / 2
  return { scale, offsetX: offX, offsetY: offY }
}

function tc(pt: [number, number], s: number, ox: number, oy: number): [number, number] {
  return [pt[0] * s + ox, pt[1] * s + oy]
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = 'rgba(0, 3, 14, 1)'
  ctx.fillRect(0, 0, w, h)

  // Grid
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }
  for (let y = 0; y < h; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Radial ambient glow in center
  const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6)
  grd.addColorStop(0, 'rgba(0, 212, 255, 0.025)')
  grd.addColorStop(1, 'transparent')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, w, h)
}

function drawGlowLine(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  s: number, ox: number, oy: number,
  color: string, glowColor: string,
  lineWidth = 2, upTo?: number
) {
  const end = upTo !== undefined ? upTo : pts.length
  if (end < 2) return

  // Glow pass (wide, transparent)
  ctx.beginPath()
  const [sx0, sy0] = tc(pts[0], s, ox, oy)
  ctx.moveTo(sx0, sy0)
  for (let i = 1; i < end; i++) {
    const [px, py] = tc(pts[i], s, ox, oy)
    ctx.lineTo(px, py)
  }
  ctx.strokeStyle = glowColor
  ctx.lineWidth = lineWidth + 8
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // Core line
  ctx.beginPath()
  const [sx1, sy1] = tc(pts[0], s, ox, oy)
  ctx.moveTo(sx1, sy1)
  for (let i = 1; i < end; i++) {
    const [px, py] = tc(pts[i], s, ox, oy)
    ctx.lineTo(px, py)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function drawNeonDot(
  ctx: CanvasRenderingContext2D,
  pt: [number, number], s: number, ox: number, oy: number,
  color: string, label: string, r = 6
) {
  const [x, y] = tc(pt, s, ox, oy)
  // Outer glow
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, Math.PI * 2)
  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba')
  ctx.fill()
  // Core
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  ctx.fill()
  ctx.shadowBlur = 0
  // Label
  ctx.font = 'bold 11px "JetBrains Mono", monospace'
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y + 3.5)
  ctx.textAlign = 'left'
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  target: [number, number], s: number, ox: number, oy: number,
  radius: number
) {
  const [tx, ty] = tc(target, s, ox, oy)
  const r = Math.max(radius * s, 12)

  // Outer ring glow
  ctx.beginPath()
  ctx.arc(tx, ty, r + 4, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 45, 120, 0.15)'
  ctx.lineWidth = 8
  ctx.stroke()

  // Dashed border
  ctx.beginPath()
  ctx.arc(tx, ty, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 45, 120, 0.07)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 45, 120, 0.7)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([5, 4])
  ctx.stroke()
  ctx.setLineDash([])

  // Crosshair
  ctx.strokeStyle = 'rgba(255, 45, 120, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(tx - r * 1.5, ty); ctx.lineTo(tx + r * 1.5, ty); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(tx, ty - r * 1.5); ctx.lineTo(tx, ty + r * 1.5); ctx.stroke()

  // Center dot
  ctx.beginPath()
  ctx.arc(tx, ty, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ff2d78'
  ctx.shadowColor = '#ff2d78'
  ctx.shadowBlur = 10
  ctx.fill()
  ctx.shadowBlur = 0

  // Label
  ctx.font = '10px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(255, 45, 120, 0.7)'
  ctx.fillText('TARGET', tx + r + 6, ty - 2)
}

export default function MovementCanvas({
  prefix, continuation, target,
  targetRadius = 20, width = 620, height = 400,
  onTargetClick, fovOverlay, predictedTarget, trackingVelocityCps,
}: MovementCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const [animating, setAnimating] = useState(false)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })

  const drawStatic = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    drawBackground(ctx, width, height)

    const prefixPts = prefix.length > 0 ? integrateDeltas(prefix) : []
    const last = prefixPts.length > 0 ? prefixPts[prefixPts.length - 1] : [0, 0] as [number, number]
    const contPts = continuation.length > 0 ? integrateDeltas(continuation, last[0], last[1]) : []

    const all: [number, number][] = [...prefixPts, ...contPts]
    const extraTarget = predictedTarget ?? null
    const { scale: s, offsetX: ox, offsetY: oy } = fitToCanvas(
      extraTarget ? [...all, extraTarget] : all, target, width, height
    )
    transformRef.current = { scale: s, offsetX: ox, offsetY: oy }

    if (target) drawTarget(ctx, target, s, ox, oy, targetRadius)

    // FOV circle centered on B (end of prefix = takeover point)
    if (fovOverlay && prefixPts.length > 0) {
      const bPt = prefixPts[prefixPts.length - 1]
      const [bx, by] = tc(bPt, s, ox, oy)
      const countsPerDeg = (fovOverlay.dpi / 400) / (fovOverlay.sensitivity * 0.022)
      const fovRadCounts = (fovOverlay.fovH / 2) * countsPerDeg
      const fovRadPx = fovRadCounts * s
      const maxR = Math.min(width, height) * 0.9
      // Only draw if circle fits meaningfully; if huge, draw capped to show context
      const drawR = Math.min(fovRadPx, maxR)
      ctx.beginPath()
      ctx.arc(bx, by, drawR, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0,212,255,0.25)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.font = '9px "JetBrains Mono", monospace'
      ctx.fillStyle = 'rgba(0,212,255,0.45)'
      const fovLabel = fovRadPx > maxR
        ? `FOV ${fovOverlay.fovH}° (${Math.round(fovRadCounts)} ct)`
        : `FOV ${fovOverlay.fovH}°`
      // Place label near the top of the visible arc or top-left of canvas
      const labelX = Math.max(4, bx - drawR + 4)
      const labelY = Math.max(12, by - drawR + 12)
      ctx.fillText(fovLabel, labelX, labelY)
    }

    // Predicted target (tracking mode)
    if (predictedTarget && target) {
      const [ptx, pty] = tc(predictedTarget, s, ox, oy)
      const [tx, ty] = tc(target, s, ox, oy)
      const rPx = Math.max((targetRadius || 20) * s, 12)

      // Velocity arrow from target → predicted
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(ptx, pty)
      ctx.strokeStyle = 'rgba(180,74,255,0.6)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])

      // Predicted C circle
      ctx.beginPath()
      ctx.arc(ptx, pty, rPx, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(180,74,255,0.8)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(180,74,255,0.08)'
      ctx.fill()

      // Center dot
      ctx.beginPath()
      ctx.arc(ptx, pty, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#b44aff'
      ctx.shadowColor = '#b44aff'
      ctx.shadowBlur = 10
      ctx.fill()
      ctx.shadowBlur = 0

      // Label
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.fillStyle = 'rgba(180,74,255,0.7)'
      ctx.fillText('C’ pred', ptx + rPx + 6, pty - 2)
      if (trackingVelocityCps) {
        ctx.fillStyle = 'rgba(180,74,255,0.45)'
        ctx.font = '9px "JetBrains Mono", monospace'
        ctx.fillText(`v=(${trackingVelocityCps[0]},${trackingVelocityCps[1]})`, ptx + rPx + 6, pty + 11)
      }
    }

    if (prefixPts.length > 1)
      drawGlowLine(ctx, prefixPts, s, ox, oy, '#00d4ff', 'rgba(0,212,255,0.12)')

    if (contPts.length > 1)
      drawGlowLine(ctx, contPts, s, ox, oy, '#39ff14', 'rgba(57,255,20,0.12)')

    if (prefixPts.length > 0) {
      drawNeonDot(ctx, prefixPts[0], s, ox, oy, '#00d4ff', 'A')
      drawNeonDot(ctx, prefixPts[prefixPts.length - 1], s, ox, oy, '#b44aff', 'B')
    }
    if (contPts.length > 0)
      drawNeonDot(ctx, contPts[contPts.length - 1], s, ox, oy, '#39ff14', 'C')

    // Legend
    const ly = height - 18
    ctx.font = '10px "JetBrains Mono", monospace'
    ;[
      [14,  '#00d4ff', 'Prefix  A→B'],
      [160, '#39ff14', 'Generated  B→C'],
      [340, '#ff2d78', 'Target'],
    ].forEach(([lx, color, label]) => {
      ctx.fillStyle = color as string
      ctx.fillRect(lx as number, ly - 5, 22, 2)
      ctx.shadowColor = color as string
      ctx.shadowBlur = 4
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = (color as string).replace(')', ', 0.7)').replace('rgb', 'rgba') + ''
      ctx.fillStyle = 'rgba(200,230,240,0.55)'
      ctx.fillText(label as string, (lx as number) + 28, ly)
    })
  }, [prefix, continuation, target, targetRadius, width, height, fovOverlay, predictedTarget, trackingVelocityCps])

  const playAnimation = useCallback(() => {
    if (animating) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    setAnimating(true)
    cancelAnimationFrame(animRef.current)

    const prefixPts = prefix.length > 0 ? integrateDeltas(prefix) : []
    const last = prefixPts.length > 0 ? prefixPts[prefixPts.length - 1] : [0, 0] as [number, number]
    const contPts = continuation.length > 0 ? integrateDeltas(continuation, last[0], last[1]) : []
    const all = [...prefixPts, ...contPts]
    const { scale: s, offsetX: ox, offsetY: oy } = fitToCanvas(all, target, width, height)

    let frame = 0
    const total = prefixPts.length + contPts.length
    const SPEED = Math.max(2, Math.floor(total / 120))

    function draw() {
      drawBackground(ctx, width, height)
      if (target) drawTarget(ctx, target, s, ox, oy, targetRadius)

      const pEnd = Math.min(frame, prefixPts.length)
      const cEnd = Math.max(0, frame - prefixPts.length)

      if (pEnd > 1) drawGlowLine(ctx, prefixPts, s, ox, oy, '#00d4ff', 'rgba(0,212,255,0.12)', 2, pEnd)
      if (cEnd > 1) drawGlowLine(ctx, contPts, s, ox, oy, '#39ff14', 'rgba(57,255,20,0.12)', 2, cEnd)

      // Live cursor
      let cur: [number, number] | null = null
      if (frame < prefixPts.length) cur = prefixPts[Math.min(frame, prefixPts.length - 1)]
      else if (contPts.length > 0) cur = contPts[Math.min(cEnd, contPts.length - 1)]

      if (cur) {
        const [cx, cy] = tc(cur, s, ox, oy)
        ctx.beginPath()
        ctx.arc(cx, cy, 7, 0, Math.PI * 2)
        ctx.fillStyle = frame < prefixPts.length ? 'rgba(0,212,255,0.3)' : 'rgba(57,255,20,0.3)'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = frame < prefixPts.length ? '#00d4ff' : '#39ff14'
        ctx.shadowColor = frame < prefixPts.length ? '#00d4ff' : '#39ff14'
        ctx.shadowBlur = 14
        ctx.fill()
        ctx.shadowBlur = 0
      }

      frame += SPEED
      if (frame <= total + SPEED) {
        animRef.current = requestAnimationFrame(draw)
      } else {
        setAnimating(false)
        drawStatic()
      }
    }

    animRef.current = requestAnimationFrame(draw)
  }, [prefix, continuation, target, targetRadius, width, height, animating, drawStatic])

  useEffect(() => { drawStatic() }, [drawStatic])
  useEffect(() => () => cancelAnimationFrame(animRef.current), [])

  // Keyboard shortcut: R = replay animation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === 'r' || e.key === 'R') playAnimation()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [playAnimation])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onTargetClick) return
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const canvasX = (e.clientX - rect.left) * scaleX
    const canvasY = (e.clientY - rect.top) * scaleY
    const { scale: s, offsetX: ox, offsetY: oy } = transformRef.current
    const worldX = Math.round((canvasX - ox) / s)
    const worldY = Math.round((canvasY - oy) / s)
    onTargetClick(worldX, worldY)
  }, [onTargetClick])

  const isEmpty = prefix.length === 0 && continuation.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        position: 'relative',
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid rgba(0,212,255,0.15)',
        background: '#00030e',
        boxShadow: '0 0 30px rgba(0,212,255,0.06), inset 0 0 30px rgba(0,0,0,0.5)',
        cursor: onTargetClick ? 'crosshair' : 'default',
      }}>
        {onTargetClick && (
          <div style={{
            position: 'absolute', top: 8, right: 10, zIndex: 2,
            fontSize: 10, color: 'rgba(255,45,120,0.5)', fontFamily: 'JetBrains Mono',
            pointerEvents: 'none',
          }}>
            Click to set target
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', maxWidth: '100%' }}
          onClick={onTargetClick ? handleCanvasClick : undefined}
        />
        {isEmpty && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 10,
            background: 'rgba(0,3,14,0.85)',
          }}>
            <span style={{ fontSize: 36, filter: 'drop-shadow(0 0 12px rgba(0,212,255,0.5))' }}>🖱️</span>
            <span style={{ color: 'rgba(0,212,255,0.5)', fontSize: 13, letterSpacing: '0.05em' }}>
              Load example data or run inference
            </span>
            <span style={{ color: 'rgba(126,200,227,0.3)', fontSize: 11 }}>
              Movement canvas will render here
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={playAnimation}
          disabled={animating || isEmpty}
        >
          {animating
            ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Animating…</>
            : '▶  Replay'}
        </button>
        <button className="btn btn-secondary" onClick={drawStatic} disabled={animating}>
          ⊞ Reset
        </button>
      </div>
    </div>
  )
}
