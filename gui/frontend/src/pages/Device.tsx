import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Usb, RefreshCw, Zap, ZapOff, Send, ChevronRight,
  Activity, AlertCircle, CheckCircle2, Circle,
} from 'lucide-react'
import { api, SerialPort, SerialStatus, MacroEvent } from '../services/api'

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const PROTOCOLS: { value: string; label: string; desc: string }[] = [
  { value: 'text',       label: 'Text (M dx dy)',   desc: 'ASCII "M {dx} {dy}\\n" — most Arduino / Pico firmwares' },
  { value: 'ch9329',     label: 'CH9329 Binary',    desc: '8-byte binary packet — bare MAKCU boards with CH9329 chip' },
  { value: 'raw_binary', label: 'Raw Binary',       desc: '4-byte int16 pairs [dx, dy] per report' },
]

export default function Device() {
  const navigate = useNavigate()

  const [ports, setPorts] = useState<SerialPort[]>([])
  const [status, setStatus] = useState<SerialStatus | null>(null)
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const [selectedPort, setSelectedPort] = useState('')
  const [selectedBaud, setSelectedBaud] = useState(() =>
    Number(localStorage.getItem('defaultBaud') || 921600)
  )
  const [selectedProto, setSelectedProto] = useState<'text' | 'ch9329' | 'raw_binary'>('text')

  const [log, setLog] = useState<{ ts: string; cls: string; msg: string }[]>([])
  const [txProgress, setTxProgress] = useState<{ sent: number; total: number } | null>(null)

  // Auto-reconnect
  const [autoReconnect, setAutoReconnect] = useState(false)
  const wasConnectedRef = useRef(false)
  const reconnectingRef = useRef(false)

  // Macro recorder
  const [macroRecording, setMacroRecording] = useState(false)
  const [macroEvents, setMacroEvents] = useState<MacroEvent[]>([])
  const [replayingMacro, setReplayingMacro] = useState(false)
  const macroRecordingRef = useRef(false)
  const macroEventsRef = useRef<MacroEvent[]>([])

  // Quick Fire
  const [quickfireParams, setQuickfireParams] = useState<any>(null)
  const [firing, setFiring] = useState(false)
  const [lastFiredTime, setLastFiredTime] = useState<string | null>(null)

  // Hotkey
  const [hotkeyKey, setHotkeyKey] = useState<string>(
    () => localStorage.getItem('quickfire_hotkey') || 'F1'
  )
  const [capturingHotkey, setCapturingHotkey] = useState(false)

  // Keep refs in sync
  useEffect(() => { macroRecordingRef.current = macroRecording }, [macroRecording])
  useEffect(() => { macroEventsRef.current = macroEvents }, [macroEvents])

  const logRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string, cls = 'log-info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false })
    setLog(prev => [...prev.slice(-199), { ts, cls, msg }])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  // Read quickfire params from localStorage on mount and window focus
  useEffect(() => {
    const readParams = () => {
      const raw = localStorage.getItem('quickfire_params')
      try {
        setQuickfireParams(raw ? JSON.parse(raw) : null)
      } catch {
        setQuickfireParams(null)
      }
    }
    readParams()
    window.addEventListener('focus', readParams)
    return () => window.removeEventListener('focus', readParams)
  }, [])

  // WebSocket for serial events + macro events
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
            } else if (event === 'macro_progress') {
              setTxProgress({ sent: data.done, total: data.total })
            } else if (event === 'macro_done') {
              setTxProgress(null)
              setReplayingMacro(false)
              if (data.ok) addLog(`✓ Macro replayed: ${data.events_replayed} events`, 'log-success')
              else addLog(`✗ Macro errors: ${data.errors}`, 'log-error')
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
      return s
    } catch { return null }
  }, [])

  // Initial scan + status
  useEffect(() => { scanPorts(); refreshStatus() }, [])

  // Auto-reconnect polling
  useEffect(() => {
    const poll = async () => {
      const s = await refreshStatus()
      if (!s) return
      if (wasConnectedRef.current && !s.connected && autoReconnect && !reconnectingRef.current) {
        reconnectingRef.current = true
        addLog('⚡ Device disconnected — attempting auto-reconnect…', 'log-warn')
        try {
          const r = await api.serial.reconnect()
          if (r.ok) {
            addLog('✓ Auto-reconnected!', 'log-success')
          } else {
            addLog(`Auto-reconnect failed: ${r.error}`, 'log-error')
          }
        } catch {
          addLog('Auto-reconnect attempt failed', 'log-error')
        } finally {
          reconnectingRef.current = false
        }
        await refreshStatus()
      }
      wasConnectedRef.current = s.connected
    }
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [autoReconnect, addLog, refreshStatus])

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
    wasConnectedRef.current = false
    await refreshStatus()
    addLog('Disconnected', 'log-warn')
  }

  const connected = status?.connected ?? false

  const recordEvent = useCallback((event: MacroEvent) => {
    if (macroRecordingRef.current) {
      setMacroEvents(prev => [...prev, event])
    }
  }, [])

  const startRecording = () => {
    setMacroEvents([])
    setMacroRecording(true)
    addLog('● Recording started — jog and click events are being captured', 'log-warn')
  }

  const stopRecording = () => {
    setMacroRecording(false)
    addLog(`■ Recording stopped — ${macroEventsRef.current.length} events captured`, 'log-success')
  }

  const replayMacro = async () => {
    if (!connected || macroEvents.length === 0) return
    setReplayingMacro(true)
    addLog(`▶ Replaying ${macroEvents.length} macro events…`, 'log-dim')
    try {
      await api.serial.replayMacro(macroEvents)
    } catch (e) {
      addLog(`Macro replay error: ${e}`, 'log-error')
      setReplayingMacro(false)
    }
  }

  // Quick Fire action
  const fireQuickFire = useCallback(async () => {
    const paramsStr = localStorage.getItem('quickfire_params')
    if (!paramsStr) {
      addLog('No quickfire params — run inference first on the Inference page', 'log-warn')
      return
    }
    let params: any
    try {
      params = JSON.parse(paramsStr)
    } catch {
      addLog('Invalid quickfire_params in localStorage', 'log-error')
      return
    }
    setFiring(true)
    try {
      addLog('⚡ Quick Fire: running inference…', 'log-dim')
      const result = await (api as any).runInference(params)
      if (connected) {
        addLog('Sending reports to MAKCU…', 'log-dim')
        await (api.serial as any).sendReports(result.continuation, 1.0)
        addLog('✓ Quick Fire complete!', 'log-success')
      } else {
        addLog('Inference complete but device not connected — reports not sent', 'log-warn')
      }
      setLastFiredTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    } catch (e) {
      addLog(`Quick Fire error: ${e}`, 'log-error')
    } finally {
      setFiring(false)
    }
  }, [connected, addLog])

  // Hotkey listener: capture new hotkey OR trigger Quick Fire on configured key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (capturingHotkey) {
        if (['Escape', 'Tab', 'Enter'].includes(e.key)) return
        e.preventDefault()
        localStorage.setItem('quickfire_hotkey', e.key)
        setHotkeyKey(e.key)
        setCapturingHotkey(false)
        return
      }
      if (e.key === hotkeyKey) {
        const paramsStr = localStorage.getItem('quickfire_params')
        if (connected && paramsStr) {
          e.preventDefault()
          fireQuickFire()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [connected, hotkeyKey, capturingHotkey, fireQuickFire])

  const armed = connected && quickfireParams !== null

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

            <div className="form-group">
              <label className="form-label">Baud Rate</label>
              <select className="form-input" value={selectedBaud}
                onChange={e => setSelectedBaud(Number(e.target.value))} disabled={connected}>
                {BAUDS.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
              </select>
            </div>

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

            {/* Auto-reconnect toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderTop: '1px solid rgba(0,212,255,0.07)', marginTop: 4,
            }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(0,212,255,0.7)', fontWeight: 600 }}>Auto-Reconnect</div>
                <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                  Re-connect automatically if device disconnects
                </div>
              </div>
              <button
                onClick={() => setAutoReconnect(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: autoReconnect ? 'rgba(57,255,20,0.25)' : 'rgba(0,212,255,0.08)',
                  border: `1px solid ${autoReconnect ? 'rgba(57,255,20,0.4)' : 'rgba(0,212,255,0.15)'}`,
                  cursor: 'pointer', position: 'relative', transition: 'all 0.2s ease',
                  boxShadow: autoReconnect ? '0 0 8px rgba(57,255,20,0.2)' : 'none',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: autoReconnect ? '#39ff14' : 'rgba(126,200,227,0.3)',
                  position: 'absolute', top: 3,
                  left: autoReconnect ? 24 : 4,
                  transition: 'all 0.2s ease',
                  boxShadow: autoReconnect ? '0 0 6px #39ff14' : 'none',
                }} />
              </button>
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

        {/* ── Right: Quick Fire + hotkey + macro + console ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Quick Fire card */}
          <div className="card" style={{
            background: 'rgba(5,5,18,0.9)',
            border: armed ? '1px solid rgba(0,212,255,0.25)' : undefined,
          }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡ Quick Fire</span>
              {armed && (
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(57,255,20,0.12)', color: '#39ff14',
                  border: '1px solid rgba(57,255,20,0.25)',
                  letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
                }}>ARMED</span>
              )}
            </div>

            {/* Stored params preview */}
            {quickfireParams ? (
              <div style={{
                background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)',
                borderRadius: 6, padding: '10px 12px', marginBottom: 14,
                display: 'flex', gap: 20, flexWrap: 'wrap',
              }}>
                {quickfireParams.target && (
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Target</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>
                      ({quickfireParams.target[0]}, {quickfireParams.target[1]})
                    </div>
                  </div>
                )}
                {quickfireParams.radius !== undefined && (
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Radius</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>
                      {quickfireParams.radius}px
                    </div>
                  </div>
                )}
                {quickfireParams.seed !== undefined && (
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Seed</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', fontWeight: 600 }}>
                      {quickfireParams.seed}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,140,0,0.04)', border: '1px solid rgba(255,140,0,0.12)',
                borderRadius: 6, padding: '10px 12px', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertCircle size={13} color="rgba(255,140,0,0.6)" />
                <span style={{ fontSize: 11, color: 'rgba(255,140,0,0.65)' }}>
                  No quickfire params — run inference first
                </span>
              </div>
            )}

            {/* FIRE button */}
            <button
              className="btn btn-primary"
              onClick={fireQuickFire}
              disabled={!armed || firing}
              style={{
                width: '100%', justifyContent: 'center',
                fontSize: 17, fontWeight: 700,
                padding: '14px 20px',
                letterSpacing: '0.05em',
                boxShadow: armed && !firing ? '0 0 20px rgba(0,212,255,0.25)' : 'none',
              }}
            >
              {firing
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Firing…</>
                : '⚡ FIRE'}
            </button>

            {/* Status hints */}
            {!connected && (
              <div style={{ fontSize: 11, color: 'rgba(255,140,0,0.7)', textAlign: 'center', marginTop: 7 }}>
                Connect to device first
              </div>
            )}
            {connected && !quickfireParams && (
              <div style={{ fontSize: 11, color: 'rgba(255,140,0,0.7)', textAlign: 'center', marginTop: 7 }}>
                Run inference first on the Inference page
              </div>
            )}
            {lastFiredTime && (
              <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)', textAlign: 'center', marginTop: 6 }}>
                Last fired: {lastFiredTime}
              </div>
            )}

            {/* Configure link */}
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                onClick={() => navigate('/inference')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'rgba(0,212,255,0.55)',
                  textDecoration: 'underline', padding: 0, fontFamily: 'inherit',
                }}
              >
                Configure in Inference →
              </button>
            </div>
          </div>

          {/* Activation Hotkey card */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Activation Hotkey</span>
              {armed && (
                <span style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 10,
                  background: 'rgba(57,255,20,0.12)', color: '#39ff14',
                  border: '1px solid rgba(57,255,20,0.25)',
                  letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
                }}>ARMED</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'rgba(0,212,255,0.7)', marginBottom: 3 }}>
                  Press this key to trigger Quick Fire globally
                </div>
                <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                  Active when device is connected and params are loaded
                </div>
              </div>
              {/* Current hotkey badge */}
              <div style={{
                padding: '6px 14px', borderRadius: 6,
                background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.22)',
                fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                color: '#00d4ff', minWidth: 48, textAlign: 'center',
                boxShadow: '0 0 10px rgba(0,212,255,0.08)',
              }}>
                {hotkeyKey}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              {capturingHotkey ? (
                <div style={{
                  padding: '10px 14px', borderRadius: 6,
                  background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.3)',
                  fontSize: 12, color: '#00d4ff', textAlign: 'center',
                  animation: 'pulse-dot 1s ease-in-out infinite',
                }}>
                  Press any key… (Esc / Tab / Enter to cancel)
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
                  onClick={() => setCapturingHotkey(true)}
                >
                  Set Hotkey
                </button>
              )}
            </div>
          </div>

          {/* Macro Recorder */}
          <div className="card" style={{
            background: 'rgba(5,5,18,0.9)',
            border: macroRecording ? '1px solid rgba(255,45,120,0.3)' : undefined,
          }}>
            <div className="section-header">
              <span style={{ color: macroRecording ? '#ff2d78' : undefined }}>
                {macroRecording ? '● ' : ''}Macro Recorder
              </span>
              {macroRecording && (
                <span style={{
                  marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 10,
                  background: 'rgba(255,45,120,0.15)', color: '#ff2d78',
                  border: '1px solid rgba(255,45,120,0.3)',
                  animation: 'pulse-dot 1s ease-in-out infinite',
                }}>RECORDING</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {!macroRecording ? (
                <button className="btn btn-danger"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                  onClick={startRecording} disabled={!connected}>
                  ● Record
                </button>
              ) : (
                <button className="btn btn-secondary"
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                  onClick={stopRecording}>
                  ■ Stop
                </button>
              )}
              <button className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                onClick={replayMacro}
                disabled={!connected || macroEvents.length === 0 || replayingMacro || macroRecording}>
                {replayingMacro
                  ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Replaying…</>
                  : `▶ Replay (${macroEvents.length})`}
              </button>
              <button className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
                onClick={() => { setMacroEvents([]); setMacroRecording(false) }}
                disabled={macroEvents.length === 0}
                title="Clear macro">
                ✕
              </button>
            </div>

            {macroEvents.length > 0 ? (
              <div style={{
                background: 'rgba(0,4,14,0.9)', borderRadius: 4, padding: '6px 8px',
                maxHeight: 80, overflowY: 'auto',
                border: '1px solid rgba(0,212,255,0.08)',
                fontFamily: 'JetBrains Mono', fontSize: 10,
              }}>
                {macroEvents.slice(-8).map((ev, i) => (
                  <div key={i} style={{
                    color: ev.type === 'click' ? '#ff8c00'
                           : ev.type === 'pause' ? '#b44aff'
                           : 'rgba(0,212,255,0.6)',
                    lineHeight: 1.6,
                  }}>
                    {ev.type === 'move' ? `M ${ev.dx},${ev.dy}`
                     : ev.type === 'click' ? `CLICK ${ev.button}`
                     : `PAUSE ${ev.ms}ms`}
                  </div>
                ))}
                {macroEvents.length > 8 && (
                  <div style={{ color: 'rgba(126,200,227,0.3)' }}>+{macroEvents.length - 8} more…</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.25)', textAlign: 'center', padding: '8px 0' }}>
                {connected ? 'Press Record then jog/click to capture a macro' : 'Connect device to use macro recorder'}
              </div>
            )}
          </div>

          {/* TX progress */}
          {txProgress && (
            <div className="card" style={{ background: 'rgba(5,5,18,0.9)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: 'rgba(0,212,255,0.7)' }}>
                  <Send size={12} style={{ marginRight: 6 }} />
                  {replayingMacro ? 'Replaying macro…' : 'Transmitting to MAKCU…'}
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

// ── Helpers ──────────────────────────────────────────────────────────────────────

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
