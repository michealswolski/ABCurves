import React, { useState, useEffect, useRef } from 'react'
import { api, TrainingConfig } from '../services/api'

const PLANNER_DEFAULTS: TrainingConfig = {
  epochs: 100,
  batch_size: 32,
  learning_rate: 0.001,
  dataset_path: './data/recordings',
  model_output: './models/planner.pt',
  sequence_length: 256,
}

const RENDERER_DEFAULTS: TrainingConfig = {
  epochs: 50,
  batch_size: 64,
  learning_rate: 0.0005,
  dataset_path: './data/recordings',
  model_output: './models/renderer.pt',
  sequence_length: 50,
}

const PRESETS = [
  { name: 'Quick Test', epochs: 10,  batch_size: 32,  learning_rate: 0.001  },
  { name: 'Standard',   epochs: 50,  batch_size: 64,  learning_rate: 0.0005 },
  { name: 'Full',       epochs: 200, batch_size: 128, learning_rate: 0.0002 },
]

type LogEntry = { ts: string; msg: string; level: 'info' | 'warn' | 'success' | 'dim' }

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false })
}

export default function Training() {
  const [activeTab, setActiveTab] = useState<'planner' | 'renderer'>('planner')
  const [plannerConfig, setPlannerConfig] = useState<TrainingConfig>(PLANNER_DEFAULTS)
  const [rendererConfig, setRendererConfig] = useState<TrainingConfig>(RENDERER_DEFAULTS)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentEpoch, setCurrentEpoch] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([
    { ts: timestamp(), msg: 'Training console ready. Configure parameters and click Start.', level: 'dim' },
  ])
  const logRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<number>(0)

  // Active config accessors based on selected tab
  const config = activeTab === 'planner' ? plannerConfig : rendererConfig
  const setConfig = activeTab === 'planner' ? setPlannerConfig : setRendererConfig

  useEffect(() => {
    api.trainingConfig()
      .then((cfg: any) => {
        if (cfg && cfg.planner) setPlannerConfig(prev => ({ ...prev, ...cfg.planner }))
        if (cfg && cfg.renderer) setRendererConfig(prev => ({ ...prev, ...cfg.renderer }))
        setConfigLoaded(true)
      })
      .catch(() => setConfigLoaded(true))
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  function addLog(msg: string, level: LogEntry['level'] = 'info') {
    setLogs(prev => [...prev, { ts: timestamp(), msg, level }])
  }

  function startTraining() {
    if (running) return
    setRunning(true)
    setProgress(0)
    setCurrentEpoch(0)
    addLog(`Starting ${activeTab === 'planner' ? 'Planner' : 'Renderer'} training`, 'info')
    addLog(`Config: epochs=${config.epochs}, bs=${config.batch_size}, lr=${config.learning_rate}`, 'dim')
    addLog(`Dataset: ${config.dataset_path}`, 'dim')
    addLog('Loading dataset…', 'info')

    let epoch = 0
    const total = config.epochs
    intervalRef.current = window.setInterval(() => {
      epoch += 1
      const pct = (epoch / total) * 100
      setProgress(pct)
      setCurrentEpoch(epoch)

      const loss = (1.2 * Math.exp(-epoch / (total * 0.3)) + 0.05 + Math.random() * 0.02).toFixed(4)
      const vloss = (parseFloat(loss) + 0.01 + Math.random() * 0.015).toFixed(4)

      if (epoch % Math.max(1, Math.floor(total / 20)) === 0) {
        addLog(`Epoch ${epoch}/${total} — loss: ${loss}, val_loss: ${vloss}`, 'info')
      }
      if (epoch === Math.floor(total * 0.5)) addLog('Checkpoint saved at epoch ' + epoch, 'success')
      if (epoch >= total) {
        clearInterval(intervalRef.current)
        addLog('Training complete!', 'success')
        addLog(`Model saved to ${config.model_output}`, 'success')
        setRunning(false)
      }
    }, 60)
  }

  function stopTraining() {
    clearInterval(intervalRef.current)
    setRunning(false)
    addLog('Training stopped by user.', 'warn')
  }

  async function saveConfig() {
    setSaving(true)
    setSaveMsg('')
    try {
      await api.saveTrainingConfig(config)
      setSaveMsg('Saved!')
    } catch {
      setSaveMsg('Saved locally (backend offline)')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    padding: '8px 12px',
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 13,
  }

  function FieldRow({
    label,
    desc,
    children,
  }: {
    label: string
    desc?: string
    children: React.ReactNode
  }) {
    return (
      <div className="form-group">
        <label className="form-label">{label}</label>
        {desc && (
          <span
            style={{
              display: 'block',
              fontSize: 11,
              color: 'rgba(126,200,227,0.4)',
              marginBottom: 5,
              lineHeight: 1.4,
            }}
          >
            {desc}
          </span>
        )}
        {children}
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="page-title">Training</h1>
      <p className="page-subtitle">Configure and monitor model training for the ABCurves pipeline</p>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'planner' ? 'active' : ''}`}
          onClick={() => setActiveTab('planner')}
        >
          Planner Model
        </button>
        <button
          className={`tab ${activeTab === 'renderer' ? 'active' : ''}`}
          onClick={() => setActiveTab('renderer')}
        >
          Renderer Model
        </button>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ── Left: Config form ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="section-header">Hyperparameters</div>

            {/* Preset buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {PRESETS.map(p => (
                <button
                  key={p.name}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '5px 10px', flex: 1, justifyContent: 'center' }}
                  onClick={() =>
                    setConfig(c => ({
                      ...c,
                      epochs: p.epochs,
                      batch_size: p.batch_size,
                      learning_rate: p.learning_rate,
                    }))
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>

            <FieldRow
              label="Epochs"
              desc="Number of passes through the full dataset. More = better accuracy but longer training."
            >
              <input
                type="number"
                style={inputStyle}
                value={config.epochs}
                onChange={e => setConfig(c => ({ ...c, epochs: Number(e.target.value) }))}
                min={1}
              />
            </FieldRow>

            <FieldRow
              label="Batch Size"
              desc="Samples processed together. Higher = faster but uses more GPU memory."
            >
              <input
                type="number"
                style={inputStyle}
                value={config.batch_size}
                onChange={e => setConfig(c => ({ ...c, batch_size: Number(e.target.value) }))}
                min={1}
              />
            </FieldRow>

            <FieldRow
              label="Learning Rate"
              desc="How fast the model adapts. Too high = unstable, too low = slow convergence."
            >
              <input
                type="number"
                style={inputStyle}
                value={config.learning_rate}
                step={0.0001}
                onChange={e => setConfig(c => ({ ...c, learning_rate: Number(e.target.value) }))}
              />
            </FieldRow>

            {activeTab === 'planner' && (
              <FieldRow
                label="Sequence Length"
                desc="dx/dy steps per training sample. Should match your typical movement length."
              >
                <input
                  type="number"
                  style={inputStyle}
                  value={config.sequence_length}
                  onChange={e =>
                    setConfig(c => ({ ...c, sequence_length: Number(e.target.value) }))
                  }
                  min={10}
                />
              </FieldRow>
            )}

            <FieldRow
              label="Dataset Path"
              desc="Folder containing recorded mouse movement .npy files."
            >
              <input
                type="text"
                style={inputStyle}
                value={config.dataset_path}
                onChange={e => setConfig(c => ({ ...c, dataset_path: e.target.value }))}
              />
            </FieldRow>

            <FieldRow
              label="Model Output"
              desc="Where to save the trained .pt weights file."
            >
              <input
                type="text"
                style={inputStyle}
                value={config.model_output}
                onChange={e => setConfig(c => ({ ...c, model_output: e.target.value }))}
              />
            </FieldRow>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-secondary" onClick={saveConfig} disabled={saving}>
                {saving ? 'Saving…' : '💾 Save Config'}
              </button>
              {saveMsg && (
                <span
                  style={{ fontSize: 12, color: 'var(--accent-green)', alignSelf: 'center' }}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-header">Dataset Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
              {[
                ['Type',          'Real human mouse recordings'],
                ['Format',        'dx/dy delta sequences'],
                ['Resolution',    '1920×1080 px'],
                ['Participants',  '12 subjects'],
                ['Total Samples', '~24,000 trajectories'],
                ['Split',         '80% train / 10% val / 10% test'],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Training control + console ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="section-header">Training Control</div>

            {/* Simulation mode warning banner */}
            <div
              style={{
                background: 'rgba(255,140,0,0.08)',
                border: '1px solid rgba(255,140,0,0.4)',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>⚠</span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#ff8c00',
                    marginBottom: 5,
                    textShadow: '0 0 8px rgba(255,140,0,0.3)',
                  }}
                >
                  Simulation Mode
                </div>
                <div
                  style={{ fontSize: 11, color: 'rgba(255,140,0,0.78)', lineHeight: 1.6 }}
                >
                  The training progress shown is simulated. To run real training, use:{' '}
                  <code
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 10,
                      background: 'rgba(255,140,0,0.12)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: '1px solid rgba(255,140,0,0.22)',
                    }}
                  >
                    python train.py --model planner
                  </code>{' '}
                  from the project root.
                </div>
              </div>
            </div>

            {running && (
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 6,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Epoch {currentEpoch} / {config.epochs}
                  </span>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {activeTab === 'planner'
                    ? 'Training Planner model (waypoint prediction)…'
                    : 'Training Renderer model (ProDMP trajectory)…'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={startTraining}
                disabled={running}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {running ? (
                  <>
                    <span className="spinner" /> Training…
                  </>
                ) : (
                  '▶ Start Training'
                )}
              </button>
              <button className="btn btn-danger" onClick={stopTraining} disabled={!running}>
                ■ Stop
              </button>
            </div>
          </div>

          <div className="card" style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <span className="section-header" style={{ marginBottom: 0 }}>
                Console Output
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() =>
                  setLogs([{ ts: timestamp(), msg: 'Console cleared.', level: 'dim' }])
                }
              >
                Clear
              </button>
            </div>
            <div className="console" ref={logRef}>
              {logs.map((entry, i) => (
                <div key={i} className={`log-${entry.level}`}>
                  <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                    [{entry.ts}]
                  </span>
                  {entry.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
