import React, { useEffect, useState, useMemo } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Sliders, Terminal, CheckCircle2, Crosshair, Target, Zap } from 'lucide-react'

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 4000000]

const FOV_PRESETS = [
  { id: 'cs2',       label: 'CS2',      sensitivity: 3.2554, fovH: 106.26 },
  { id: 'valorant',  label: 'Valorant', sensitivity: 0.5,    fovH: 103.0  },
  { id: 'apex',      label: 'Apex',     sensitivity: 3.2554, fovH: 110.0  },
  { id: 'custom',    label: 'Custom',   sensitivity: 1.0,    fovH: 106.26 },
]

const RESOLUTIONS = [
  { label: '1920×1080', w: 1920 },
  { label: '2560×1440', w: 2560 },
  { label: '1280×720',  w: 1280 },
  { label: '2560×1080', w: 2560 },
]

function defaultFovConfig() {
  return { game: 'cs2', dpi: 400, sensitivity: 3.2554, fovH: 106.26, screenW: 1920 }
}

function formatKey(key: string): string {
  const map: Record<string, string> = {
    ' ': 'Space', 'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
    'Control': 'Ctrl', 'Shift': 'Shift', 'Alt': 'Alt', 'Meta': 'Win',
  }
  return map[key] ?? key
}

function HotkeyCapture({
  label, hint, storageKey, value, onChange,
}: {
  label: string; hint: string; storageKey: string; value: string; onChange: (v: string) => void
}) {
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'Tab'].includes(e.key)) { setCapturing(false); return }
      e.preventDefault()
      const key = formatKey(e.key)
      localStorage.setItem(storageKey, key)
      onChange(key)
      setCapturing(false)
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      const labels = ['Mouse1', 'Mouse3', 'Mouse2', 'Mouse4', 'Mouse5']
      const btn = labels[e.button] ?? `Mouse${e.button + 1}`
      localStorage.setItem(storageKey, btn)
      onChange(btn)
      setCapturing(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
    }
  }, [capturing, storageKey, onChange])

  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          padding: '6px 14px', borderRadius: 6, minWidth: 60, textAlign: 'center',
          background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.22)',
          fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#00d4ff',
        }}>
          {value || '—'}
        </div>
        <button
          className={`btn ${capturing ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: 11 }}
          onClick={() => setCapturing(v => !v)}
        >
          {capturing ? '⏺ Press a key or mouse button…' : 'Set Hotkey'}
        </button>
        {value && !capturing && (
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => { localStorage.removeItem(storageKey); onChange('') }}>
            ✕
          </button>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)' }}>{hint}</span>
    </div>
  )
}

export default function Settings() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('theme') || 'dark') as 'dark' | 'light'
  )
  const [defaultBaud, setDefaultBaud] = useState<number>(() =>
    Number(localStorage.getItem('defaultBaud') || 921600)
  )
  const [pythonPath, setPythonPath] = useState(() =>
    localStorage.getItem('pythonPath') || ''
  )
  const [savedFeedback, setSavedFeedback] = useState('')

  // FOV config
  const [fovConfig, setFovConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fov_config') || 'null')
      if (saved) return saved
    } catch {}
    const defaults = defaultFovConfig()
    try { localStorage.setItem('fov_config', JSON.stringify(defaults)) } catch {}
    return defaults
  })

  // Hotkeys
  const [quickfireHotkey, setQuickfireHotkey] = useState(() =>
    localStorage.getItem('quickfire_hotkey') || 'F1')
  const [triggerbotHotkey, setTriggerbotHotkey] = useState(() =>
    localStorage.getItem('triggerbot_hotkey') || 'Mouse4')

  // Movement settings
  const [smoothness, setSmoothness] = useState(() =>
    Number(localStorage.getItem('movement_smoothness') || 1))
  const [defaultIntervalMs, setDefaultIntervalMs] = useState(() =>
    Number(localStorage.getItem('default_interval_ms') || 1.0))

  // Tracking / target settings
  const [distancePriority, setDistancePriority] = useState(() =>
    localStorage.getItem('target_distance_priority') !== 'false')
  const [switchDelayMs, setSwitchDelayMs] = useState(() =>
    Number(localStorage.getItem('target_switch_delay_ms') || 200))

  // Triggerbot settings
  const [reactionTimeMs, setReactionTimeMs] = useState(() =>
    Number(localStorage.getItem('triggerbot_reaction_ms') || 50))
  const [triggerMode, setTriggerMode] = useState<'manual' | 'magnet' | 'track'>(() =>
    (localStorage.getItem('triggerbot_mode') as any) || 'manual')

  const updateFov = (patch: Partial<typeof fovConfig>) => {
    setFovConfig((prev: typeof fovConfig) => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem('fov_config', JSON.stringify(next)) } catch {}
      flashSaved('FOV settings saved')
      return next
    })
  }

  const countsPerDegree = useMemo(() =>
    (fovConfig.dpi / 400) / (fovConfig.sensitivity * 0.022)
  , [fovConfig.dpi, fovConfig.sensitivity])

  const countsPerPixel = useMemo(() =>
    countsPerDegree * (fovConfig.fovH / fovConfig.screenW)
  , [countsPerDegree, fovConfig.fovH, fovConfig.screenW])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const saveDefaultBaud = (baud: number) => {
    setDefaultBaud(baud)
    localStorage.setItem('defaultBaud', String(baud))
    flashSaved('Baud rate saved')
  }

  const savePythonPath = () => {
    localStorage.setItem('pythonPath', pythonPath)
    flashSaved('Python path saved')
  }

  const flashSaved = (msg: string) => {
    setSavedFeedback(msg)
    setTimeout(() => setSavedFeedback(''), 2000)
  }

  const saveMovement = (s: number, i: number) => {
    try {
      localStorage.setItem('movement_smoothness', String(s))
      localStorage.setItem('default_interval_ms', String(i))
    } catch {}
    flashSaved('Movement settings saved')
  }

  const saveTracking = (dist: boolean, delay: number) => {
    try {
      localStorage.setItem('target_distance_priority', String(dist))
      localStorage.setItem('target_switch_delay_ms', String(delay))
    } catch {}
    flashSaved('Tracking settings saved')
  }

  const saveTriggerbot = (mode: string, reaction: number) => {
    try {
      localStorage.setItem('triggerbot_mode', mode)
      localStorage.setItem('triggerbot_reaction_ms', String(reaction))
    } catch {}
    flashSaved('Triggerbot settings saved')
  }

  return (
    <div className="page animate-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Application preferences — stored in browser localStorage</p>
      </div>

      {savedFeedback && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: 'rgba(57,255,20,0.06)', border: '1px solid rgba(57,255,20,0.2)',
          fontSize: 12, color: '#39ff14',
        }}>
          <CheckCircle2 size={14} />
          {savedFeedback}
        </div>
      )}

      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Appearance */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><SettingsIcon size={13} /> Appearance</div>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['dark', 'light'] as const).map(t => (
                <button key={t} onClick={() => setTheme(t)}
                  className={`btn ${theme === t ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {t === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Hotkeys */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Zap size={13} /> Hotkeys</div>
          <p style={{ fontSize: 11, color: 'rgba(126,200,227,0.4)', marginBottom: 14, lineHeight: 1.6 }}>
            Supports keyboard keys and mouse buttons (Mouse1–Mouse5). Click "Set Hotkey" then press any key or click any mouse button.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <HotkeyCapture
              label="Quick Fire Hotkey"
              hint="Triggers Run Inference + Send to MAKCU on the Device page"
              storageKey="quickfire_hotkey"
              value={quickfireHotkey}
              onChange={setQuickfireHotkey}
            />
            <HotkeyCapture
              label="Triggerbot Hotkey"
              hint="Activates the triggerbot when held (on Device page)"
              storageKey="triggerbot_hotkey"
              value={triggerbotHotkey}
              onChange={setTriggerbotHotkey}
            />
          </div>
        </div>

        {/* Movement settings */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Sliders size={13} /> Movement</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Report Interval (ms)</label>
              <input className="form-input" type="number" value={defaultIntervalMs}
                min={0.1} max={10} step={0.1}
                onChange={e => { setDefaultIntervalMs(Number(e.target.value)); saveMovement(smoothness, Number(e.target.value)) }} />
              <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                1.0 ms = 1 kHz (MAKCU max). Higher = smoother but slower.
              </span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Smoothness (interp steps)</label>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)' }}>Raw</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', fontWeight: 700 }}>{smoothness}×</span>
                <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.4)' }}>Smooth</span>
              </div>
              <input type="range" min={1} max={4} step={1} value={smoothness}
                style={{ width: '100%', accentColor: '#00d4ff' }}
                onChange={e => { setSmoothness(Number(e.target.value)); saveMovement(Number(e.target.value), defaultIntervalMs) }} />
              <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                Interpolation between generated delta pairs
              </span>
            </div>
          </div>
        </div>

        {/* Target tracking */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Target size={13} /> Target Tracking</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(0,212,255,0.7)', fontWeight: 600 }}>Distance Priority</div>
                <div style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)', marginTop: 2 }}>
                  When multiple targets are visible, prefer the nearest one. Disable to keep locking onto the first detected target.
                </div>
              </div>
              <button
                onClick={() => { const n = !distancePriority; setDistancePriority(n); saveTracking(n, switchDelayMs) }}
                style={{
                  width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                  background: distancePriority ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.05)',
                  border: `1px solid ${distancePriority ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.12)'}`,
                  cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: distancePriority ? '#00d4ff' : 'rgba(126,200,227,0.3)',
                  position: 'absolute', top: 3, left: distancePriority ? 24 : 4,
                  transition: 'all 0.2s', boxShadow: distancePriority ? '0 0 6px #00d4ff' : 'none',
                }} />
              </button>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Target Switch Delay</label>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#b44aff', fontWeight: 700 }}>
                  {switchDelayMs} ms
                </span>
              </div>
              <input type="range" min={0} max={800} step={25} value={switchDelayMs}
                style={{ width: '100%', accentColor: '#b44aff' }}
                onChange={e => { setSwitchDelayMs(Number(e.target.value)); saveTracking(distancePriority, Number(e.target.value)) }} />
              <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                Minimum delay before switching to a different target after the current one is lost. 0 = instant.
              </span>
            </div>
          </div>
        </div>

        {/* Triggerbot */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Zap size={13} /> Triggerbot</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Mode</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { value: 'manual', label: 'Manual',       desc: 'Fire only when hotkey is pressed' },
                  { value: 'magnet', label: 'Magnet',       desc: 'Auto-click when aim is on target' },
                  { value: 'track',  label: 'Track + Fire', desc: 'Run inference then click automatically' },
                ] as const).map(m => (
                  <button key={m.value}
                    className={`btn ${triggerMode === m.value ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}
                    title={m.desc}
                    onClick={() => { setTriggerMode(m.value); saveTriggerbot(m.value, reactionTimeMs) }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)', marginTop: 6 }}>
                {triggerMode === 'manual' && 'Press the triggerbot hotkey to fire a click through the MAKCU.'}
                {triggerMode === 'magnet' && 'Automatically fires a click when crosshair is on an enemy. Uses FOV detection.'}
                {triggerMode === 'track' && 'Runs inference to aim then fires a click. Fully automated shot sequence.'}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Reaction Time</label>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#ff8c00', fontWeight: 700 }}>
                  {reactionTimeMs} ms
                </span>
              </div>
              <input type="range" min={0} max={500} step={5} value={reactionTimeMs}
                style={{ width: '100%', accentColor: '#ff8c00' }}
                onChange={e => { setReactionTimeMs(Number(e.target.value)); saveTriggerbot(triggerMode, Number(e.target.value)) }} />
              <span style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)' }}>
                Delay between trigger condition detected and click sent. 0 = immediate. Human average ~150–250 ms.
              </span>
            </div>
          </div>
        </div>

        {/* FOV Scale */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Crosshair size={13} /> FOV Scale &amp; Sensitivity</div>
          <p style={{ fontSize: 11, color: 'rgba(126,200,227,0.4)', marginBottom: 14, lineHeight: 1.6 }}>
            Converts screen pixels ↔ mouse counts for tracking prediction. Trained model baseline: CS2 sens 3.2554 @ 400 DPI.
          </p>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {FOV_PRESETS.map(p => (
              <button key={p.id}
                className={`btn ${fovConfig.game === p.id ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '4px 8px', flex: 1, justifyContent: 'center' }}
                onClick={() => updateFov({ game: p.id, sensitivity: p.sensitivity, fovH: p.fovH })}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">DPI</label>
              <input className="form-input" type="number" value={fovConfig.dpi} min={100} max={25600} step={100}
                onChange={e => updateFov({ dpi: Number(e.target.value) })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">In-game Sensitivity</label>
              <input className="form-input" type="number" value={fovConfig.sensitivity} step={0.01}
                onChange={e => updateFov({ sensitivity: Number(e.target.value) })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">FOV Horizontal (°)</label>
              <input className="form-input" type="number" value={fovConfig.fovH} step={0.1} min={60} max={180}
                onChange={e => updateFov({ fovH: Number(e.target.value), game: 'custom' })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Screen Width (px)</label>
              <select className="form-input" value={fovConfig.screenW}
                onChange={e => updateFov({ screenW: Number(e.target.value) })}>
                {RESOLUTIONS.map(r => (
                  <option key={r.label} value={r.w}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: 20, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)',
            fontSize: 11, fontFamily: 'JetBrains Mono',
          }}>
            <div>
              <span style={{ color: 'rgba(126,200,227,0.4)' }}>counts/degree</span>
              <div style={{ color: '#00d4ff', fontWeight: 700 }}>{countsPerDegree.toFixed(2)}</div>
            </div>
            <div>
              <span style={{ color: 'rgba(126,200,227,0.4)' }}>counts/pixel</span>
              <div style={{ color: '#00d4ff', fontWeight: 700 }}>{countsPerPixel.toFixed(4)}</div>
            </div>
            <div>
              <span style={{ color: 'rgba(126,200,227,0.4)' }}>pixels/count</span>
              <div style={{ color: '#00d4ff', fontWeight: 700 }}>{(1 / countsPerPixel).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Serial defaults */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Sliders size={13} /> Serial Defaults</div>
          <div className="form-group">
            <label className="form-label">Default Baud Rate</label>
            <select className="form-input" value={defaultBaud}
              onChange={e => saveDefaultBaud(Number(e.target.value))}>
              {BAUDS.map(b => (
                <option key={b} value={b}>
                  {b.toLocaleString()}{b === 115200 ? ' (common)' : b === 4000000 ? ' (MAKCU 4 Mbaud)' : b >= 460800 ? ' (fast)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Python path */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Terminal size={13} /> Python Environment</div>
          <div className="form-group">
            <label className="form-label">Python Executable Path</label>
            <input className="form-input" type="text" value={pythonPath}
              onChange={e => setPythonPath(e.target.value)}
              placeholder="C:\Users\...\Python313\python.exe"
              style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
          </div>
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={savePythonPath}>
            Save Path
          </button>
        </div>

        {/* Quick reference */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header">Keyboard Shortcuts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              ['Space', 'Run Inference (on Inference page)'],
              ['R',     'Replay movement animation'],
              [quickfireHotkey || 'F1', 'Quick Fire — run inference & send to MAKCU'],
              [triggerbotHotkey || 'Mouse4', 'Triggerbot fire'],
            ].map(([key, desc]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '8px 0', borderBottom: '1px solid rgba(0,212,255,0.06)',
              }}>
                <code style={{
                  background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 4, padding: '2px 8px', fontFamily: 'JetBrains Mono',
                  fontSize: 12, color: '#00d4ff', minWidth: 70, textAlign: 'center',
                }}>{key}</code>
                <span style={{ fontSize: 12, color: 'rgba(126,200,227,0.5)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header">About</div>
          <div style={{ fontSize: 12, color: 'rgba(126,200,227,0.5)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: 'rgba(0,212,255,0.7)', marginBottom: 4 }}>ABCurves GUI v1.7.0</div>
            <div>ProDMP Neural Mouse Movement Generator</div>
            <div>Flask + React + Socket.IO</div>
            <div style={{ marginTop: 8, color: 'rgba(126,200,227,0.3)', fontSize: 11 }}>
              MIT License · Academic Research
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
