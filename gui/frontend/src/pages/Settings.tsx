import React, { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Sliders, Terminal, CheckCircle2 } from 'lucide-react'

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

export default function Settings() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('theme') || 'dark') as 'dark' | 'light'
  )
  const [defaultBaud, setDefaultBaud] = useState<number>(() =>
    Number(localStorage.getItem('defaultBaud') || 115200)
  )
  const [pythonPath, setPythonPath] = useState(() =>
    localStorage.getItem('pythonPath') || ''
  )
  const [savedFeedback, setSavedFeedback] = useState('')

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
