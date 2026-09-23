import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import MovementCanvas from '../components/MovementCanvas'
import { api, InferenceResult, SerialStatus } from '../services/api'
import { Send, Usb, ZapOff, Download, Lock, Unlock, Layers } from 'lucide-react'

const EXAMPLE_PREFIX: [number, number][] = [
  [3,1],[4,2],[5,2],[6,3],[7,3],[8,3],[9,3],[10,4],[10,4],[11,4],
  [12,4],[12,3],[13,3],[14,3],[14,2],[15,2],[15,1],[15,1],[16,1],[16,0],
  [16,0],[16,-1],[15,-1],[15,-1],[14,-2],[13,-2],[12,-2],[11,-2],[10,-2],[9,-2],
  [8,-2],[7,-1],[6,-1],[5,-1],[4,-1],[3,0],[2,0],[1,0],[1,1],[0,1],
]
const EXAMPLE_TARGET: [number, number] = [420, 60]

function InputRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)' }}>{hint}</span>}
    </div>
  )
}

function XYInput({ label, value, onChange }: {
  label: string; value: [number, number]; onChange: (v: [number, number]) => void
}) {
  return (
    <InputRow label={label}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['X', 'Y'] as const).map((axis, i) => (
          <div key={axis} style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.4)', marginBottom: 4, letterSpacing: '0.08em' }}>{axis}</div>
            <input type="number" className="form-input" style={{ width: '100%' }}
              value={value[i]}
              onChange={e => {
                const v = [...value] as [number, number]
                v[i] = Number(e.target.value)
                onChange(v)
              }} />
          </div>
        ))}
      </div>
    </InputRow>
  )
}

export default function Inference() {
  const navigate = useNavigate()

  // Inference state
  const [target, setTarget] = useState<[number, number]>(EXAMPLE_TARGET)
  const [radius, setRadius] = useState(20)
  const [progressCenter, setProgressCenter] = useState(0.5)
  const [seed, setSeed] = useState(42)
  const [seedLocked, setSeedLocked] = useState(true)
  const [prefixText, setPrefixText] = useState(JSON.stringify(EXAMPLE_PREFIX.slice(0, 10)))
  const [prefix, setPrefix] = useState<[number, number][]>(EXAMPLE_PREFIX)
  const [prefixError, setPrefixError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<InferenceResult | null>(null)

  // Batch inference
  const [batchMode, setBatchMode] = useState(false)
  const [batchN, setBatchN] = useState(3)
  const [batchResults, setBatchResults] = useState<Array<{index: number; seed: number; latency_ms: number; continuation: [number,number][]; length: number}>>([])
  const [selectedBatch, setSelectedBatch] = useState(0)

  // MAKCU state
  const [serialStatus, setSerialStatus] = useState<SerialStatus | null>(null)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null)
  const [intervalMs, setIntervalMs] = useState(1.0)

  useEffect(() => {
    setPrefixText(JSON.stringify(EXAMPLE_PREFIX))
    setPrefix(EXAMPLE_PREFIX)
    setTarget(EXAMPLE_TARGET)
    const poll = () => api.serial.status().then(s => setSerialStatus(s)).catch(() => {})
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let sock: WebSocket | null = null
    try {
      sock = new WebSocket('ws://localhost:5000/socket.io/?EIO=4&transport=websocket')
      sock.onmessage = (e) => {
        const raw = e.data as string
        if (!raw.startsWith('42')) return
        try {
          const [event, data] = JSON.parse(raw.slice(2))
          if (event === 'serial_progress') setSendProgress({ sent: data.sent, total: data.total })
          if (event === 'serial_done') { setSendProgress(null); setSending(false) }
          if (event === 'serial_status') setSerialStatus(data)
        } catch { /* ignore */ }
      }
    } catch { /* no WS */ }
    return () => sock?.close()
  }, [])

  const parsePrefixText = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error()
      const pts = parsed.map((p: unknown) => {
        if (!Array.isArray(p) || p.length !== 2) throw new Error()
        return [Number(p[0]), Number(p[1])] as [number, number]
      })
      setPrefix(pts); setPrefixError('')
    } catch { setPrefixError('Invalid format. Use [[dx,dy], ...]') }
  }, [])

  const loadExample = useCallback(async () => {
    try {
      const data = await api.exampleData()
      setPrefix(data.prefix); setPrefixText(JSON.stringify(data.prefix))
      setTarget(data.target); setPrefixError('')
    } catch {
      setPrefix(EXAMPLE_PREFIX); setPrefixText(JSON.stringify(EXAMPLE_PREFIX)); setTarget(EXAMPLE_TARGET)
    }
  }, [])

  const runInference = useCallback(async () => {
    if (prefix.length === 0) { setError('Prefix is empty'); return }
    setLoading(true); setError('')
    setBatchResults([])

    const actualSeed = seedLocked ? seed : Math.floor(Math.random() * 100000)
    if (!seedLocked) setSeed(actualSeed)

    try {
      if (batchMode) {
        const res = await api.batchInference({
          prefix, target, target_radius: radius, progress_center: progressCenter,
          seed: actualSeed, n: batchN,
        })
        setBatchResults(res.results)
        if (res.results.length > 0) {
          setSelectedBatch(0)
          setResult({
            success: true,
            continuation: res.results[0].continuation,
            latency_ms: res.results[0].latency_ms,
            stats: {
              prefix_length: prefix.length,
              continuation_length: res.results[0].continuation.length,
              total_length: prefix.length + res.results[0].continuation.length,
            },
          })
        }
      } else {
        const res = await api.runInference({
          prefix, target, target_radius: radius, progress_center: progressCenter, seed: actualSeed,
        })
        setResult(res)
        setBatchResults([])
        try {
          localStorage.setItem('quickfire_params', JSON.stringify({
            prefix, target, radius, progressCenter, seed: actualSeed,
          }))
        } catch { /* storage unavailable */ }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inference failed')
    } finally { setLoading(false) }
  }, [prefix, target, radius, progressCenter, seed, seedLocked, batchMode, batchN])

  // Space = run inference keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        if (!loading && !prefixError) runInference()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [loading, prefixError, runInference])

  const sendToMakcu = useCallback(async () => {
    if (!result?.continuation) return
    setSending(true); setSendProgress(null)
    try {
      await api.serial.sendReports(result.continuation as [number, number][], intervalMs)
    } catch {
      setSending(false)
    }
  }, [result, intervalMs])

  const exportCSV = useCallback(() => {
    if (!result) return
    const rows = ['dx,dy', ...result.continuation.map(([dx, dy]) => `${dx},${dy}`)].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abcurves_movement_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [result])

  const exportJSON = useCallback(() => {
    if (!result) return
    const data = {
      continuation: result.continuation,
      stats: result.stats,
      latency_ms: result.latency_ms,
      parameters: { target, radius, progressCenter, seed },
      exported_at: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abcurves_movement_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [result, target, radius, progressCenter, seed])

  const selectBatchResult = (idx: number) => {
    const r = batchResults[idx]
    if (!r) return
    setSelectedBatch(idx)
    setResult({
      success: true,
      continuation: r.continuation,
      latency_ms: r.latency_ms,
      stats: {
        prefix_length: prefix.length,
        continuation_length: r.continuation.length,
        total_length: prefix.length + r.continuation.length,
      },
    })
  }

  const connected = serialStatus?.connected ?? false
  const activeContinuation = result?.continuation ?? []

  return (
    <div className="page animate-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 className="page-title">Inference</h1>
        <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.3)', fontFamily: 'JetBrains Mono' }}>
          Space = Run · R = Replay
        </div>
      </div>
      <p className="page-subtitle">Generate realistic mouse movement continuations from a recorded prefix</p>

      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 20 }}>

        {/* ── Controls ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header">Parameters</div>
            <XYInput label="Target Position" value={target} onChange={setTarget} />
            <InputRow label="Target Radius" hint="Acceptance radius in pixels">
              <input type="number" className="form-input" style={{ width: '100%' }} value={radius}
                onChange={e => setRadius(Number(e.target.value))} min={5} max={200} />
            </InputRow>
            <InputRow label="Progress Center" hint="0.0 – 1.0  (proportion at cut point B)">
              <input type="range" style={{ width: '100%', accentColor: '#00d4ff' }}
                value={progressCenter} min={0} max={1} step={0.05}
                onChange={e => setProgressCenter(Number(e.target.value))} />
              <span style={{ fontSize: 12, color: '#00d4ff', fontFamily: 'JetBrains Mono' }}>
                {progressCenter.toFixed(2)}
              </span>
            </InputRow>

            {/* Seed with lock toggle */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Random Seed</label>
                <button
                  onClick={() => setSeedLocked(v => !v)}
                  title={seedLocked ? 'Seed is locked — click to randomize each run' : 'Seed is random — click to lock'}
                  style={{
                    cursor: 'pointer', padding: '2px 6px',
                    borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 10, color: seedLocked ? '#00d4ff' : 'rgba(126,200,227,0.4)',
                    background: seedLocked ? 'rgba(0,212,255,0.08)' : 'rgba(0,212,255,0.03)',
                    border: `1px solid ${seedLocked ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.07)'}`,
                  } as React.CSSProperties}
                >
                  {seedLocked ? <Lock size={11} /> : <Unlock size={11} />}
                  {seedLocked ? 'locked' : 'random'}
                </button>
              </div>
              <input type="number" className="form-input" style={{ width: '100%', opacity: seedLocked ? 1 : 0.5 }}
                value={seed} onChange={e => setSeed(Number(e.target.value))}
                disabled={!seedLocked} />
              {!seedLocked && (
                <span style={{ fontSize: 10, color: 'rgba(255,140,0,0.6)' }}>
                  Seed will be randomized each run
                </span>
              )}
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header">Prefix Data</div>
            <div className="form-group">
              <label className="form-label">dx/dy pairs (JSON)</label>
              <textarea
                style={{
                  background: 'rgba(0,4,14,0.9)',
                  border: '1px solid rgba(0,212,255,0.12)',
                  borderRadius: 6, color: '#00ffcc',
                  padding: '8px 12px', width: '100%',
                  minHeight: 90, resize: 'vertical',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                  outline: 'none',
                }}
                value={prefixText}
                onChange={e => { setPrefixText(e.target.value); parsePrefixText(e.target.value) }}
                spellCheck={false}
              />
              {prefixError && <span style={{ color: '#ff2d78', fontSize: 11 }}>{prefixError}</span>}
              <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.4)', fontFamily: 'JetBrains Mono' }}>
                {prefix.length} points loaded
              </span>
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
              onClick={loadExample}>
              📂 Load Example Data
            </button>
          </div>

          {/* Batch mode toggle */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)', padding: '12px 16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={13} color="rgba(0,212,255,0.6)" />
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(0,212,255,0.7)', fontWeight: 600 }}>Batch Mode</div>
                  <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.3)' }}>Generate N variations, pick best</div>
                </div>
              </div>
              <button
                onClick={() => setBatchMode(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: batchMode ? 'rgba(180,74,255,0.25)' : 'rgba(0,212,255,0.08)',
                  border: `1px solid ${batchMode ? 'rgba(180,74,255,0.4)' : 'rgba(0,212,255,0.15)'}`,
                  cursor: 'pointer', position: 'relative', transition: 'all 0.2s ease',
                  boxShadow: batchMode ? '0 0 8px rgba(180,74,255,0.2)' : 'none',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: batchMode ? '#b44aff' : 'rgba(126,200,227,0.3)',
                  position: 'absolute', top: 3,
                  left: batchMode ? 24 : 4,
                  transition: 'all 0.2s ease',
                  boxShadow: batchMode ? '0 0 6px #b44aff' : 'none',
                }} />
              </button>
            </div>
            {batchMode && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Count</label>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#b44aff', fontWeight: 700 }}>{batchN}</span>
                </div>
                <input type="range" min={2} max={10} step={1}
                  value={batchN} onChange={e => setBatchN(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#b44aff' }} />
              </div>
            )}
          </div>

          {/* Run inference */}
          <button className="btn btn-primary"
            style={{ justifyContent: 'center', padding: '13px', fontSize: 13 }}
            onClick={runInference} disabled={loading || !!prefixError}>
            {loading
              ? <><span className="spinner" style={{ width: 15, height: 15 }} />
                  {batchMode ? ` Running ${batchN} inferences…` : ' Running Inference…'}</>
              : batchMode
                ? `▶  Run ${batchN} Batch Inferences`
                : '▶  Run Inference'}
          </button>

          {error && (
            <div style={{
              background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.25)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ff2d78',
            }}>
              ⚠ {error}
            </div>
          )}

          {/* ── MAKCU Send panel ── */}
          <div className="card" style={{
            background: 'rgba(5,5,18,0.9)',
            border: connected ? '1px solid rgba(57,255,20,0.2)' : '1px solid rgba(0,212,255,0.1)',
          }}>
            <div className="section-header"><Usb size={13} /> MAKCU Output</div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
              padding: '8px 12px', borderRadius: 6,
              background: connected ? 'rgba(57,255,20,0.05)' : 'rgba(255,140,0,0.05)',
              border: `1px solid ${connected ? 'rgba(57,255,20,0.15)' : 'rgba(255,140,0,0.15)'}`,
            }}>
              {connected
                ? <><span className="dot-live" /><span style={{ fontSize: 11, color: '#39ff14' }}>
                    {serialStatus!.port} · {serialStatus!.protocol}
                  </span></>
                : <><ZapOff size={12} color="#ff8c00" />
                  <span style={{ fontSize: 11, color: '#ff8c00' }}>
                    Not connected —{' '}
                    <span style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => navigate('/device')}>
                      go to Device
                    </span>
                  </span></>
              }
            </div>

            <InputRow label="Report Interval (ms)" hint="1.0 ms = 1 kHz matching real 1kHz output rate">
              <input type="number" className="form-input" style={{ width: '100%' }}
                value={intervalMs} min={0} max={100} step={0.5}
                onChange={e => setIntervalMs(Number(e.target.value))} />
            </InputRow>

            {sendProgress && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11,
                  color: 'rgba(0,212,255,0.6)', marginBottom: 6 }}>
                  <span>Transmitting…</span>
                  <span style={{ fontFamily: 'JetBrains Mono' }}>
                    {sendProgress.sent} / {sendProgress.total}
                  </span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill"
                    style={{ width: `${(sendProgress.sent / sendProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            <button className="btn btn-success"
              style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
              disabled={!connected || !result || sending}
              onClick={sendToMakcu}>
              {sending
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Sending…</>
                : <><Send size={14} /> Send to MAKCU</>}
            </button>

            {result && (
              <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)', marginTop: 8, textAlign: 'center' }}>
                {result.stats.continuation_length} reports · ~{(result.stats.continuation_length * intervalMs).toFixed(0)} ms total
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas + results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)', padding: 16 }}>
            <div className="section-header" style={{ marginBottom: 10 }}>
              Movement Visualization
              <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(255,45,120,0.4)', fontFamily: 'JetBrains Mono' }}>
                Click to set target
              </span>
            </div>
            <MovementCanvas
              prefix={prefix}
              continuation={activeContinuation}
              target={target}
              targetRadius={radius}
              width={620}
              height={380}
              onTargetClick={(x, y) => setTarget([x, y])}
            />
          </div>

          {/* Batch results picker */}
          {batchResults.length > 1 && (
            <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
              <div className="section-header"><Layers size={13} /> Batch Results — pick best</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {batchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectBatchResult(i)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                      background: selectedBatch === i ? 'rgba(180,74,255,0.12)' : 'rgba(0,212,255,0.04)',
                      border: `1px solid ${selectedBatch === i ? 'rgba(180,74,255,0.4)' : 'rgba(0,212,255,0.1)'}`,
                      color: selectedBatch === i ? '#b44aff' : 'rgba(126,200,227,0.6)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>#{i + 1}</div>
                    <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'rgba(126,200,227,0.5)' }}>
                      {r.length} pts · {r.latency_ms.toFixed(0)}ms
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(126,200,227,0.3)', marginTop: 2 }}>
                      seed {r.seed}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
              <div className="section-header" style={{ marginBottom: 12 }}>
                Inference Results
                {/* Export buttons */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={exportCSV} title="Export as CSV">
                    <Download size={12} /> CSV
                  </button>
                  <button className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={exportJSON} title="Export as JSON">
                    <Download size={12} /> JSON
                  </button>
                </div>
              </div>
              <div className="grid-3" style={{ gap: 12 }}>
                {[
                  ['Prefix Length',        result.stats.prefix_length,        '#00d4ff'],
                  ['Continuation Points',  result.stats.continuation_length,  '#39ff14'],
                  ['Total Reports',        result.stats.total_length,         '#b44aff'],
                ].map(([label, value, color]) => (
                  <div key={label as string} style={{
                    background: 'rgba(0,212,255,0.04)', borderRadius: 8,
                    padding: '12px 16px', border: '1px solid rgba(0,212,255,0.1)',
                  }}>
                    <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.4)',
                      textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: color as string,
                      fontFamily: 'JetBrains Mono', textShadow: `0 0 10px ${color as string}88` }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {result.latency_ms !== undefined && (
                <div style={{
                  marginTop: 12, padding: '8px 14px', borderRadius: 6,
                  background: 'rgba(255,140,0,0.05)', border: '1px solid rgba(255,140,0,0.12)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                }}>
                  <span style={{ color: 'rgba(126,200,227,0.4)', fontSize: 11 }}>Inference latency</span>
                  <span style={{ color: '#ff8c00', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
                    {result.latency_ms.toFixed(1)} ms
                  </span>
                  <span style={{ color: 'rgba(57,255,20,0.5)', marginLeft: 'auto', fontSize: 11 }}>
                    🛡 0/1280 caught in cold tests
                  </span>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div className="section-header">Generated Trajectory (first 16 deltas)</div>
                <div style={{
                  background: 'rgba(0,4,14,0.95)', borderRadius: 6, padding: '12px 14px',
                  fontFamily: 'JetBrains Mono', fontSize: 11, color: '#39ff14',
                  border: '1px solid rgba(57,255,20,0.1)', lineHeight: 1.8,
                }}>
                  {result.continuation.slice(0, 16).map((p, i) => (
                    <span key={i} style={{ marginRight: 10, display: 'inline-block' }}>
                      [{(p as [number,number])[0]}, {(p as [number,number])[1]}]
                    </span>
                  ))}
                  {result.continuation.length > 16 && (
                    <span style={{ color: 'rgba(126,200,227,0.3)' }}>
                      … +{result.continuation.length - 16} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {!result && (
            <div className="card" style={{
              textAlign: 'center', padding: '40px',
              background: 'rgba(5,5,18,0.9)',
              border: '1px solid rgba(0,212,255,0.07)',
            }}>
              <div style={{ fontSize: 44, marginBottom: 14,
                filter: 'drop-shadow(0 0 16px rgba(0,212,255,0.4))' }}>🎯</div>
              <div style={{ fontSize: 14, color: 'rgba(0,212,255,0.6)', marginBottom: 6 }}>
                Ready to generate
              </div>
              <div style={{ fontSize: 12, color: 'rgba(126,200,227,0.3)' }}>
                Click <b style={{ color: '#00d4ff' }}>Run Inference</b> to generate a realistic B→C movement,
                or press <b style={{ color: '#00d4ff' }}>Space</b>. Then{' '}
                <b style={{ color: '#39ff14' }}>Send to MAKCU</b> to inject it as real mouse input.
              </div>
              <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.2)', marginTop: 12 }}>
                Click on the canvas above to set the target position visually
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
