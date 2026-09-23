import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Usb, RefreshCw, Zap, ZapOff, Send, Mouse, ChevronRight,
  Activity, AlertCircle, CheckCircle2, Circle,
} from 'lucide-react'
import { api, SerialPort, SerialStatus } from '../services/api'

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const PROTOCOLS: { value: string; label: string; desc: string }[] = [
  { value: 'text',       label: 'Text (M dx dy)',   desc: 'ASCII "M {dx} {dy}\\n" — most Arduino / Pico firmwares' },
  { value: 'ch9329',     label: 'CH9329 Binary',    desc: '8-byte binary packet — bare MAKCU boards with CH9329 chip' },
  { value: 'raw_binary', label: 'Raw Binary',       desc: '4-byte int16 pairs [dx, dy] per report' },
]

const JOG_STEP = 20  // pixels per jog button press

export default function Device() {
  const [ports, setPorts] = useState<SerialPort[]>([])
  const [status, setStatus] = useState<SerialStatus | null>(null)
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const [selectedPort, setSelectedPort] = useState('')
  const [selectedBaud, setSelectedBaud] = useState(115200)
  const [selectedProto, setSelectedProto] = useState<'text' | 'ch9329' | 'raw_binary'>('text')

  const [log, setLog] = useState<{ ts: string; cls: string; msg: string }[]>([])
  const [txProgress, setTxProgress] = useState<{ sent: number; total: number } | null>(null)

  const logRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, cls = 'log-info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLog(prev => [...prev.slice(-199), { ts, cls, msg }])
  }, [])

  // Auto-scroll console
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // WebSocket for serial events
  useEffect(() => {
    let sock: WebSocket | null = null
    try {
      sock = new WebSocket('ws://localhost:5000/socket.io/?EIO=4&transport=websocket')
      sock.onmessage = (e) => {
        const raw = e.data as string
        if (raw.startsWith('42')) {
          try {
            const [event, data] = JSON.parse(raw.slice(2))
            if (event === 'serial_status') {
              setStatus(data as SerialStatus)
            } else if (event === 'serial_progress') {
              setTxProgress({ sent: data.sent, total: data.total })
            } else if (event === 'serial_done') {
              setTxProgress(null)
              if (data.ok) addLog(`✓ Sent ${data.reports_sent} reports — ${data.stats.bytes_sent} bytes`, 'log-success')
              else addLog(`✗ Transmission error: ${data.errors} errors`, 'log-error')
              refreshStatus()
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { /* WebSocket optional */ }
    return () => { sock?.close() }
  }, [addLog])

  const scanPorts = useCallback(async () => {
    setScanning(true)
    addLog('Scanning for COM ports…', 'log-dim')
    try {
      const { ports: p } = await api.serial.ports()
      setPorts(p)
      const makcu = p.filter(x => x.likely_makcu)
      if (makcu.length > 0) {
        addLog(`Found ${p.length} port(s) — ${makcu.length} likely MAKCU: ${makcu.map(x => x.device).join(', ')}`, 'log-success')
        if (!selectedPort) setSelectedPort(makcu[0].device)
      } else {
        addLog(`Found ${p.length} port(s) — no MAKCU detected`, 'log-warn')
      }
    } catch { addLog('Port scan failed — is backend running?', 'log-error') }
    setScanning(false)
  }, [addLog, selectedPort])

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.serial.status()
      setStatus(s)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { scanPorts(); refreshStatus() }, [])

  const handleConnect = async () => {
    if (!selectedPort) { addLog('Select a port first', 'log-warn'); return }
    setConnecting(true)
    addLog(`Connecting to ${selectedPort} @ ${selectedBaud} baud (${selectedProto})…`)
    const result = await api.serial.connect({ port: selectedPort, baud: selectedBaud, protocol: selectedProto })
    if (result.ok) {
      addLog(`Connected to ${selectedPort}`, 'log-success')
    } else {
      addLog(`Connection failed: ${result.error}`, 'log-error')
    }
    await refreshStatus()
    setConnecting(false)
  }

  const handleDisconnect = async () => {
    addLog('Disconnecting…', 'log-dim')
    await api.serial.disconnect()
    await refreshStatus()
    addLog('Disconnected', 'log-warn')
  }

  const jog = async (dx: number, dy: number) => {
    const r = await api.serial.sendSingle(dx, dy)
    if (r.ok) addLog(`Jog (${dx > 0 ? '+' : ''}${dx}, ${dy > 0 ? '+' : ''}${dy})`, 'log-dim')
    else addLog(`Jog failed: ${r.error}`, 'log-error')
  }

  const click = async (btn: 'left' | 'right' | 'middle') => {
    const r = await api.serial.click(btn)
    if (r.ok) addLog(`Click ${btn}`, 'log-success')
    else addLog(`Click failed: ${r.error}`, 'log-error')
  }

  const connected = status?.connected ?? false

  return (
    <div className="page animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">MAKCU Device</h1>
        <p className="page-subtitle">Connect to your MAKCU hardware and stream generated movements via USB serial</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>

        {/* ── Left: Connection panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Status banner */}
          <div style={{
            background: connected ? 'rgba(57,255,20,0.05)' : 'rgba(0,212,255,0.04)',
            border: `1px solid ${connected ? 'rgba(57,255,20,0.25)' : 'rgba(0,212,255,0.12)'}`,
            borderRadius: 10, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            {connected
              ? <CheckCircle2 size={22} color="#39ff14" />
              : <Circle size={22} color="rgba(0,212,255,0.4)" />}
            <div style={{ flex: 1 }}>
              <div style={{
                fontWeight: 700, fontSize: 14,
                color: connected ? '#39ff14' : 'rgba(0,212,255,0.7)',
                textShadow: connected ? '0 0 8px rgba(57,255,20,0.5)' : undefined,
              }}>
                {connected ? `Connected · ${status!.port}` : 'Not Connected'}
              </div>
              {connected && (
                <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.5)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>
                  {status!.baud} baud · {status!.protocol} · {status!.stats.reports_sent} reports sent
                </div>
              )}
            </div>
            {connected && (
              <div style={{ display: 'flex', gap: 16, textAlign: 'center' }}>
                {[
                  ['Bytes TX', fmtBytes(status!.stats.bytes_sent)],
                  ['Reports',  status!.stats.reports_sent],
                  ['Errors',   status!.stats.errors],
                  ['Rate',     `${fmtBytes(status!.stats.rate_bps)}/s`],
                ].map(([l, v]) => (
                  <div key={l as string}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono', color: '#00d4ff' }}>{v}</div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Config card */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header"><Usb size={13} /> Connection Config</div>

            {/* Port picker */}
            <div className="form-group">
              <label className="form-label">COM Port</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="form-input"
                  style={{ flex: 1 }}
                  value={selectedPort}
                  onChange={e => setSelectedPort(e.target.value)}
                  disabled={connected}
                >
                  <option value="">— select port —</option>
                  {ports.map(p => (
                    <option key={p.device} value={p.device}>
                      {p.device}{p.likely_makcu ? ' ★' : ''} — {p.description}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" onClick={scanPorts} disabled={scanning} title="Refresh ports">
                  <RefreshCw size={14} className={scanning ? 'spin' : ''} />
                </button>
              </div>
              {ports.length === 0 && (
                <span style={{ fontSize: 11, color: 'rgba(255,140,0,0.7)' }}>
                  No ports found — plug in your MAKCU and click refresh
                </span>
              )}
            </div>

            {/* Baud */}
            <div className="form-group">
              <label className="form-label">Baud Rate</label>
              <select className="form-input" value={selectedBaud}
                onChange={e => setSelectedBaud(Number(e.target.value))} disabled={connected}>
                {BAUDS.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
              </select>
            </div>

            {/* Protocol */}
            <div className="form-group">
              <label className="form-label">Protocol</label>
              <select className="form-input" value={selectedProto}
                onChange={e => setSelectedProto(e.target.value as 'text' | 'ch9329' | 'raw_binary')}
                disabled={connected}>
                {PROTOCOLS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.4)' }}>
                {PROTOCOLS.find(p => p.value === selectedProto)?.desc}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {!connected ? (
                <button className="btn btn-primary" onClick={handleConnect} disabled={connecting || !selectedPort}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {connecting
                    ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Connecting…</>
                    : <><Zap size={14} /> Connect</>}
                </button>
              ) : (
                <button className="btn btn-danger" onClick={handleDisconnect}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  <ZapOff size={14} /> Disconnect
                </button>
              )}
              <button className="btn btn-secondary" onClick={refreshStatus}>
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Port list */}
          {ports.length > 0 && (
            <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
              <div className="section-header"><Activity size={13} /> Detected Ports</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ports.map(p => (
                  <div key={p.device}
                    onClick={() => !connected && setSelectedPort(p.device)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', borderRadius: 8, cursor: connected ? 'default' : 'pointer',
                      background: selectedPort === p.device
                        ? 'rgba(0,212,255,0.07)' : 'transparent',
                      border: selectedPort === p.device
                        ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}>
                    <div style={{ flexShrink: 0 }}>
                      {p.likely_makcu
                        ? <span style={{ color: '#39ff14', fontSize: 16, filter: 'drop-shadow(0 0 6px #39ff14)' }}>⚡</span>
                        : <span style={{ color: 'rgba(126,200,227,0.3)', fontSize: 16 }}>○</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: '#00d4ff', fontWeight: 600 }}>
                        {p.device}
                        {p.likely_makcu && (
                          <span style={{
                            marginLeft: 8, fontSize: 9, padding: '2px 6px', borderRadius: 10,
                            background: 'rgba(57,255,20,0.1)', color: '#39ff14',
                            border: '1px solid rgba(57,255,20,0.2)', fontFamily: 'inherit',
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>MAKCU</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.45)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description}
                        {p.manufacturer ? ` · ${p.manufacturer}` : ''}
                        {p.vid ? ` · VID:${p.vid.toString(16).toUpperCase().padStart(4,'0')}` : ''}
                      </div>
                    </div>
                    {selectedPort === p.device && (
                      <ChevronRight size={14} color="rgba(0,212,255,0.5)" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Manual control + console ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Jog pad */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header"><Mouse size={13} /> Manual Control</div>
            {!connected && (
              <div style={{
                padding: '16px', borderRadius: 8,
                background: 'rgba(255,140,0,0.05)', border: '1px solid rgba(255,140,0,0.15)',
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
              }}>
                <AlertCircle size={14} color="#ff8c00" />
                <span style={{ fontSize: 12, color: 'rgba(255,140,0,0.7)' }}>
                  Connect a MAKCU device to enable manual control
                </span>
              </div>
            )}

            {/* D-pad jog */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <JogBtn label="▲" onClick={() => jog(0, -JOG_STEP)} disabled={!connected} />
              <div style={{ display: 'flex', gap: 6 }}>
                <JogBtn label="◀" onClick={() => jog(-JOG_STEP, 0)} disabled={!connected} />
                <div style={{
                  width: 48, height: 48, borderRadius: 8,
                  background: 'rgba(0,212,255,0.05)',
                  border: '1px solid rgba(0,212,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(0,212,255,0.3)', fontSize: 11,
                }}>JOG</div>
                <JogBtn label="▶" onClick={() => jog(JOG_STEP, 0)} disabled={!connected} />
              </div>
              <JogBtn label="▼" onClick={() => jog(0, JOG_STEP)} disabled={!connected} />
            </div>

            <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)', textAlign: 'center', marginBottom: 16 }}>
              Step size: {JOG_STEP} px per press
            </div>

            {/* Click buttons */}
            <div className="section-header" style={{ marginTop: 8 }}>Mouse Clicks</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['left', 'middle', 'right'] as const).map(btn => (
                <button key={btn} className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                  disabled={!connected}
                  onClick={() => click(btn)}>
                  {btn.charAt(0).toUpperCase() + btn.slice(1)}
                </button>
              ))}
            </div>

            {/* Send raw */}
            <RawSender connected={connected} onSend={(dx, dy) => {
              api.serial.sendSingle(dx, dy).then(r => {
                if (r.ok) addLog(`Sent (${dx}, ${dy})`, 'log-success')
                else addLog(`Send failed: ${r.error}`, 'log-error')
              })
            }} />
          </div>

          {/* TX progress */}
          {txProgress && (
            <div className="card" style={{ background: 'rgba(5,5,18,0.9)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: 'rgba(0,212,255,0.7)' }}>
                  <Send size={12} style={{ marginRight: 6 }} />
                  Transmitting to MAKCU…
                </span>
                <span style={{ fontFamily: 'JetBrains Mono', color: '#00d4ff' }}>
                  {txProgress.sent} / {txProgress.total}
                </span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill"
                  style={{ width: `${(txProgress.sent / txProgress.total) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Console */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)', flex: 1 }}>
            <div className="section-header" style={{ marginBottom: 10 }}>
              Serial Console
              <button className="btn btn-secondary"
                style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }}
                onClick={() => setLog([])}>
                Clear
              </button>
            </div>
            <div className="console" ref={logRef}>
              {log.length === 0 && (
                <span className="log-dim">{'// Scan ports and connect to see activity here'}</span>
              )}
              {log.map((l, i) => (
                <div key={i}>
                  <span className="log-dim">[{l.ts}]</span>{' '}
                  <span className={l.cls}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Protocol reference */}
      <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
        <div className="section-header">Protocol Reference</div>
        <div className="grid-3" style={{ gap: 16 }}>
          {PROTOCOLS.map(p => (
            <div key={p.value} style={{
              padding: '14px', borderRadius: 8,
              background: selectedProto === p.value ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.3)',
              border: `1px solid ${selectedProto === p.value ? 'rgba(0,212,255,0.25)' : 'rgba(0,212,255,0.07)'}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#00d4ff', marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.5)', lineHeight: 1.6 }}>{p.desc}</div>
              {p.value === 'text'       && <code style={codeStyle}>M 15 -8\n</code>}
              {p.value === 'ch9329'     && <code style={codeStyle}>57 AB 05 04 00 0F F8 00 [sum]</code>}
              {p.value === 'raw_binary' && <code style={codeStyle}>0F 00 F8 FF  (int16 LE pairs)</code>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function JogBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 48, height: 48, borderRadius: 8, fontSize: 18,
        background: disabled ? 'rgba(0,212,255,0.03)' : 'rgba(0,212,255,0.08)',
        border: `1px solid ${disabled ? 'rgba(0,212,255,0.06)' : 'rgba(0,212,255,0.2)'}`,
        color: disabled ? 'rgba(0,212,255,0.2)' : '#00d4ff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
        boxShadow: disabled ? 'none' : '0 0 8px rgba(0,212,255,0.1)',
      }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.boxShadow = '0 0 14px rgba(0,212,255,0.3)')}
      onMouseLeave={e => !disabled && (e.currentTarget.style.boxShadow = '0 0 8px rgba(0,212,255,0.1)')}
    >
      {label}
    </button>
  )
}

function RawSender({ connected, onSend }: { connected: boolean; onSend: (dx: number, dy: number) => void }) {
  const [dx, setDx] = useState('0')
  const [dy, setDy] = useState('0')
  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-header" style={{ marginBottom: 8 }}>Raw Report</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="form-label">dx</label>
          <input className="form-input" type="number" value={dx}
            onChange={e => setDx(e.target.value)} disabled={!connected} />
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
          <label className="form-label">dy</label>
          <input className="form-input" type="number" value={dy}
            onChange={e => setDy(e.target.value)} disabled={!connected} />
        </div>
        <button className="btn btn-primary" disabled={!connected}
          onClick={() => onSend(parseInt(dx) || 0, parseInt(dy) || 0)}
          style={{ padding: '8px 14px' }}>
          <Send size={13} />
        </button>
      </div>
    </div>
  )
}

const codeStyle: React.CSSProperties = {
  display: 'block', marginTop: 8,
  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
  color: '#00ffcc', background: 'rgba(0,255,204,0.06)',
  border: '1px solid rgba(0,255,204,0.1)',
  padding: '5px 8px', borderRadius: 4,
  overflowX: 'auto', whiteSpace: 'nowrap',
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'M'
  if (n >= 1024) return (n / 1024).toFixed(1) + 'K'
  return String(Math.round(n))
}
