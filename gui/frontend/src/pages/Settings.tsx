import React, { useEffect, useState, useMemo } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Sliders, Terminal, CheckCircle2, Crosshair } from 'lucide-react'

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

  const [fovConfig, setFovConfig] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fov_config') || 'null')
      if (saved) return saved
    } catch {}
    const defaults = defaultFovConfig()
    try { localStorage.setItem('fov_config', JSON.stringify(defaults)) } catch {}
    return defaults
  })

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

      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Appearance */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><SettingsIcon size={13} /> Appearance</div>
          <div className="form-group">
            <label className="form-label">Theme</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {(['dark', 'light'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`btn ${theme === t ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {t === 'dark' ? <Moon size={13} /> : <Sun size={13} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)' }}>
              {theme === 'light' ? 'Light mode active — reduced eye strain in bright environments' : 'Dark mode active — default cyberpunk theme'}
            </span>
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
                  {b.toLocaleString()}{b === 115200 ? ' (common)' : b === 9600 ? ' (slow)' : b >= 460800 ? ' (fast)' : ''}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)' }}>
              Used as the pre-selected baud rate when opening the Device page
            </span>
          </div>
        </div>

        {/* FOV Scale */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Crosshair size={13} /> FOV Scale &amp; Sensitivity</div>
          <p style={{ fontSize: 11, color: 'rgba(126,200,227,0.4)', marginBottom: 14, lineHeight: 1.6 }}>
            Converts screen pixels ↔ mouse counts for tracking prediction. Trained model baseline: CS2 sens 3.2554 @ 400 DPI.
          </p>

          {/* Game presets */}
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

        {/* Python path */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Terminal size={13} /> Python Environment</div>
          <div className="form-group">
            <label className="form-label">Python Executable Path</label>
            <input className="form-input" type="text" value={pythonPath}
              onChange={e => setPythonPath(e.target.value)}
              placeholder="C:\Users\...\Python313\python.exe"
              style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }} />
            <span style={{ fontSize: 11, color: 'rgba(126,200,227,0.35)' }}>
              Used when launching the Flask backend from <code style={{ color: '#00d4ff' }}>gui/start.ps1</code>
            </span>
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
              ['R', 'Replay movement animation'],
            ].map(([key, desc]) => (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '8px 0', borderBottom: '1px solid rgba(0,212,255,0.06)',
              }}>
                <code style={{
                  background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 4, padding: '2px 8px', fontFamily: 'JetBrains Mono',
                  fontSize: 12, color: '#00d4ff', minWidth: 60, textAlign: 'center',
                }}>{key}</code>
                <span style={{ fontSize: 12, color: 'rgba(126,200,227,0.5)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header">About</div>
          <div style={{ fontSize: 12, color: 'rgba(126,200,227,0.5)', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: 'rgba(0,212,255,0.7)', marginBottom: 4 }}>ABCurves GUI v1.6.0</div>
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
