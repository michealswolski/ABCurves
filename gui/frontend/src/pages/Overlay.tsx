import React, { useEffect, useRef, useState } from 'react'

export default function Overlay() {
  const [running, setRunning]   = useState(false)
  const [locked,  setLocked]    = useState(false)
  const [fps,     setFps]       = useState(0)
  const [hits,    setHits]      = useState(0)
  const [mode,    setMode]      = useState('—')
  const [vel,     setVel]       = useState<[number, number] | null>(null)
  const [wsOk,    setWsOk]      = useState(false)
  const lockTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll detection status every 500ms for fps / hits / running state
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/detection/status')
        const s = await r.json()
        setRunning(s.running)
        setFps(s.fps)
        setHits(s.hits)
        setMode(s.mode || '—')
        if (!s.running) { setLocked(false); setVel(null) }
      } catch { /* backend may not be up yet */ }
    }
    poll()
    const t = setInterval(poll, 500)
    return () => clearInterval(t)
  }, [])

  // WebSocket for real-time lock events — auto-reconnect on close
  useEffect(() => {
    let sock: WebSocket | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      try {
        sock = new WebSocket('ws://localhost:5000/socket.io/?EIO=4&transport=websocket')
        sock.onopen  = () => setWsOk(true)
        sock.onclose = () => { setWsOk(false); if (alive) setTimeout(connect, 2000) }
        sock.onerror = () => setWsOk(false)
        sock.onmessage = (e) => {
          const raw = e.data as string
          if (raw === '2') { sock?.send('3'); return }
          if (!raw.startsWith('42')) return
          try {
            const [event, data] = JSON.parse(raw.slice(2))
            if (event === 'detection_update') {
              setLocked(true)
              if (data.vx !== undefined) setVel([data.vx, data.vy])
              if (lockTimer.current) clearTimeout(lockTimer.current)
              lockTimer.current = setTimeout(() => { setLocked(false); setVel(null) }, 250)
            }
          } catch { /* ignore parse errors */ }
        }
      } catch { if (alive) setTimeout(connect, 2000) }
    }

    connect()
    return () => {
      alive = false
      if (lockTimer.current) clearTimeout(lockTimer.current)
      sock?.close()
    }
  }, [])

  const MODE_COLOR: Record<string, string> = {
    flick: '#ff8800', snap: '#ff4444', track: '#b44aff', smooth: '#00d4ff',
  }
  const modeColor = MODE_COLOR[mode] ?? '#7ec8e3'

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden',
      background: 'rgba(0,2,10,0.94)',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid rgba(0,212,255,0.1)',
        background: 'rgba(0,4,14,0.7)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(0,212,255,0.45)' }}>
          ABCURVES
        </span>
        <div style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 700,
          letterSpacing: '0.12em', marginLeft: 'auto',
          background: running ? 'rgba(180,74,255,0.15)' : 'rgba(126,200,227,0.04)',
          border: `1px solid ${running ? 'rgba(180,74,255,0.35)' : 'rgba(126,200,227,0.08)'}`,
          color: running ? '#b44aff' : 'rgba(126,200,227,0.25)',
        }}>
          {running ? 'LIVE' : 'IDLE'}
        </div>
        {/* WS connection dot */}
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: wsOk ? '#39ff14' : 'rgba(255,80,80,0.45)',
          boxShadow: wsOk ? '0 0 5px #39ff14' : 'none',
          flexShrink: 0,
        }} title={wsOk ? 'WS connected' : 'WS disconnected'} />
      </div>

      {/* Lock indicator + velocity */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        padding: '10px 14px', gap: 14,
      }}>
        {/* Pulsing dot */}
        <div style={{
          width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
          background: locked ? 'rgba(0,255,136,0.12)' : 'rgba(126,200,227,0.03)',
          border: `2px solid ${locked ? '#00ff88' : 'rgba(126,200,227,0.1)'}`,
          boxShadow: locked ? '0 0 18px rgba(0,255,136,0.35), inset 0 0 10px rgba(0,255,136,0.12)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.1s ease',
        }}>
          <div style={{
            width: 18, height: 18, borderRadius: '50%',
            background: locked ? '#00ff88' : 'rgba(126,200,227,0.12)',
            boxShadow: locked ? '0 0 10px #00ff88' : 'none',
            transition: 'all 0.1s ease',
          }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
            color: locked ? '#00ff88' : 'rgba(126,200,227,0.28)',
            marginBottom: 3, transition: 'color 0.1s',
          }}>
            {locked ? 'TARGET LOCKED' : running ? 'SCANNING…' : 'OFFLINE'}
          </div>
          {vel && locked ? (
            <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.5)' }}>
              {vel[0] >= 0 ? '→' : '←'} {Math.abs(Math.round(vel[0]))}
              {'  '}
              {vel[1] >= 0 ? '↓' : '↑'} {Math.abs(Math.round(vel[1]))} px/s
            </div>
          ) : (
            <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.18)' }}>
              velocity: —
            </div>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid rgba(0,212,255,0.07)',
        background: 'rgba(0,4,14,0.6)',
      }}>
        {([
          ['FPS',  String(fps),          null],
          ['HITS', String(hits),         null],
          ['MODE', mode.toUpperCase(),   modeColor],
        ] as [string, string, string | null][]).map(([l, v, c], i) => (
          <div key={l} style={{
            flex: 1, padding: '5px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid rgba(0,212,255,0.06)' : undefined,
          }}>
            <div style={{ fontSize: 8, color: 'rgba(126,200,227,0.28)', letterSpacing: '0.1em' }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: c ?? '#00d4ff' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
