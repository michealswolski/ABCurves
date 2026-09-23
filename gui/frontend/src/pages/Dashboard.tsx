import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { Activity, Cpu, Zap, Shield, MousePointer2, BarChart2, Brain, Database } from 'lucide-react'
import { api, LatencyEntry, ModelInfo, DetectionStudy, BenchmarkResult } from '../services/api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [pipelineReady, setPipelineReady] = useState(false)
  const [latencies, setLatencies] = useState<LatencyEntry[]>([])
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [detection, setDetection] = useState<DetectionStudy | null>(null)
  const [benchmarks, setBenchmarks] = useState<BenchmarkResult | null>(null)

  useEffect(() => {
    api.health()
      .then(h => { setServerOnline(true); setPipelineReady(!!(h as any).pipeline_ready) })
      .catch(() => { setServerOnline(false); setPipelineReady(false) })

    api.modelsInfo()
      .then(info => setModelInfo(info))
      .catch(() => {})

    api.detectionStudy()
      .then(d => setDetection(d))
      .catch(() => {})

    api.benchmarks()
      .then(b => setBenchmarks(b))
      .catch(() => {})

    // Poll latency history every 5 s
    const fetchLatency = () =>
      api.latencyHistory(20).then(d => setLatencies(d.history)).catch(() => {})
    fetchLatency()
    const t = setInterval(fetchLatency, 5000)
    return () => clearInterval(t)
  }, [])

  const chartData = latencies.map((e, i) => ({
    i: i + 1,
    ms: e.ms,
  }))

  return (
    <div className="page animate-in">
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(180,74,255,0.15))',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0,212,255,0.2)',
            fontSize: 24,
          }}>
            🖱️
          </div>
          <div>
            <h1 style={{
              fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px',
              background: 'linear-gradient(90deg, #ffffff, #00d4ff, #b44aff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: 3,
            }}>
              ABCurves
            </h1>
            <p style={{ color: 'rgba(126,200,227,0.7)', fontSize: 14 }}>
              Realistic Mouse Movement Generation via ProDMP Neural Architecture
            </p>
          </div>
        </div>

        {/* Server status banner */}
        <div style={{
          background: serverOnline ? 'rgba(57,255,20,0.04)' : 'rgba(255,45,120,0.04)',
          border: `1px solid ${serverOnline ? 'rgba(57,255,20,0.2)' : 'rgba(255,45,120,0.2)'}`,
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: serverOnline ? 'rgba(57,255,20,0.8)' : 'rgba(255,45,120,0.8)',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: serverOnline === null ? '#ff8c00'
                       : serverOnline ? '#39ff14' : '#ff2d78',
            boxShadow: serverOnline ? '0 0 8px #39ff14' : undefined,
            animation: serverOnline ? 'pulse-dot 1.8s ease-in-out infinite' : undefined,
          }} />
          <span>
            {serverOnline === null ? '⟳ Connecting to backend…'
             : serverOnline
               ? `✓ Backend connected · localhost:5000 · ${pipelineReady ? 'Pipeline ready' : 'Pipeline loading…'}`
               : '✗ Backend offline · Start Flask server: python gui/backend/app.py'}
          </span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
        <StatCard
          title="Model Status"
          value={serverOnline === null ? '…' : serverOnline ? 'Online' : 'Offline'}
          subtitle="ProDMP Planner + Renderer"
          icon={<Cpu size={20} />}
          accent="#00d4ff"
        />
        <StatCard
          title="Cold Detection"
          value={detection
            ? `${detection.cold_test.caught} / ${detection.cold_test.total}`
            : '—'}
          subtitle="Undetected in cold tests"
          icon={<Shield size={20} />}
          accent="#39ff14"
          trend={detection
            ? { direction: 'down', label: `${(detection.cold_test.detection_rate * 100).toFixed(0)}% catch rate` }
            : undefined}
        />
        <StatCard
          title="Texture Distance"
          value={detection
            ? detection.texture_distances.renderer_output.toFixed(3)
            : '—'}
          subtitle={detection ? 'Inside human range' : 'Loading…'}
          icon={<Activity size={20} />}
          accent="#b44aff"
          trend={detection
            ? { direction: 'down', label: `Human avg: ${detection.texture_distances.average_different_person.toFixed(3)}` }
            : undefined}
        />
        <StatCard
          title={latencies.length > 0 ? 'Avg Latency' : 'P50 Latency'}
          value={latencies.length > 0
            ? `${(latencies.reduce((s, e) => s + e.ms, 0) / latencies.length).toFixed(0)}ms`
            : (() => {
                const median = benchmarks?.renderer_profile?.median_ms
                return median != null ? `${median.toFixed(1)}ms` : '—'
              })()}
          subtitle={latencies.length > 0 ? `avg over ${latencies.length} runs` : 'Benchmark (no runs yet)'}
          icon={<Zap size={20} />}
          accent="#ff8c00"
          trend={latencies.length > 0
            ? { direction: 'neutral', label: `last: ${latencies[latencies.length - 1].ms}ms` }
            : (() => {
                const p99 = benchmarks?.renderer_profile?.p99_ms
                return p99 != null ? { direction: 'neutral' as const, label: `p99: ${p99.toFixed(1)}ms` } : undefined
              })()}
        />
      </div>

      {/* Main grid */}
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Pipeline diagram */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header">A → B → C Pipeline</div>
          <svg viewBox="0 0 480 210" style={{ width: '100%', height: 'auto' }}>
            <defs>
              <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <marker id="arr-blue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#00d4ff" />
              </marker>
              <marker id="arr-purple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#b44aff" />
              </marker>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00d4ff"/>
                <stop offset="100%" stopColor="#b44aff"/>
              </linearGradient>
            </defs>
            <rect x="10" y="55" width="110" height="90" rx="10"
              fill="rgba(0,212,255,0.06)" stroke="#00d4ff" strokeWidth="1.2"/>
            <text x="65" y="93" textAnchor="middle" fill="#00d4ff" fontSize="28" fontWeight="800" filter="url(#glow-blue)">A</text>
            <text x="65" y="112" textAnchor="middle" fill="rgba(0,212,255,0.7)" fontSize="10" fontWeight="600">Start Point</text>
            <text x="65" y="127" textAnchor="middle" fill="rgba(0,212,255,0.4)" fontSize="9">Human prefix dx/dy</text>
            <line x1="124" y1="100" x2="180" y2="100"
              stroke="url(#lineGrad)" strokeWidth="2"
              markerEnd="url(#arr-blue)" strokeDasharray="6,4"/>
            <text x="153" y="90" textAnchor="middle" fill="rgba(0,212,255,0.5)" fontSize="9">Planner reads</text>
            <rect x="184" y="55" width="110" height="90" rx="10"
              fill="rgba(180,74,255,0.06)" stroke="#b44aff" strokeWidth="1.2"/>
            <text x="239" y="93" textAnchor="middle" fill="#b44aff" fontSize="28" fontWeight="800" filter="url(#glow-purple)">B</text>
            <text x="239" y="112" textAnchor="middle" fill="rgba(180,74,255,0.8)" fontSize="10" fontWeight="600">Waypoint</text>
            <text x="239" y="127" textAnchor="middle" fill="rgba(180,74,255,0.5)" fontSize="9">Cut &amp; plan here</text>
            <line x1="298" y1="100" x2="354" y2="100"
              stroke="#b44aff" strokeWidth="2"
              markerEnd="url(#arr-purple)" strokeDasharray="6,4"/>
            <text x="327" y="90" textAnchor="middle" fill="rgba(180,74,255,0.5)" fontSize="9">Renderer emits</text>
            <rect x="358" y="55" width="110" height="90" rx="10"
              fill="rgba(57,255,20,0.05)" stroke="#39ff14" strokeWidth="1.2"/>
            <text x="413" y="93" textAnchor="middle" fill="#39ff14" fontSize="28" fontWeight="800">C</text>
            <text x="413" y="112" textAnchor="middle" fill="rgba(57,255,20,0.8)" fontSize="10" fontWeight="600">Target</text>
            <text x="413" y="127" textAnchor="middle" fill="rgba(57,255,20,0.5)" fontSize="9">Generated 1kHz output</text>
            <text x="240" y="178" textAnchor="middle" fill="rgba(126,200,227,0.3)" fontSize="10">
              16 ProDMP heads · GRU Renderer · delta-sigma accumulator
            </text>
          </svg>
          <p style={{ fontSize: 12, color: 'rgba(126,200,227,0.4)', marginTop: 8, lineHeight: 1.6 }}>
            The Planner reads the real A→B prefix and plans the continuation. The global Renderer converts it into authentic 1kHz integer mouse reports.
          </p>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick actions */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header">Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center', padding: '13px' }}
                onClick={() => navigate('/inference')}
              >
                <MousePointer2 size={15} />
                Run Inference
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'center', padding: '13px' }}
                onClick={() => navigate('/metrics')}
              >
                <BarChart2 size={15} />
                View Metrics
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'center', padding: '13px' }}
                onClick={() => navigate('/training')}
              >
                <Brain size={15} />
                Training Config
              </button>
            </div>
          </div>

          {/* System specs */}
          <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
            <div className="section-header">System Specs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, fontSize: 12 }}>
              {[
                ['Architecture',   'Causal TCN + GRU',  '#00d4ff'],
                ['Planner Heads',  '16 ProDMP heads',   '#b44aff'],
                ['Renderer',       'GRU + δ-σ accum.',  '#39ff14'],
                ['Output Rate',    '1 kHz (1 ms/report)','#ff8c00'],
                ['Cold Detection', detection ? `${detection.cold_test.caught} / ${detection.cold_test.total} caught` : '—', '#39ff14'],
                ['License',        'MIT Open Source',   '#00d4ff'],
              ].map(([k, v, c]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid rgba(0,212,255,0.06)',
                }}>
                  <span style={{ color: 'rgba(126,200,227,0.45)', fontSize: 11, letterSpacing: '0.04em' }}>{k}</span>
                  <span style={{ color: c as string, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Latency chart + Model info row */}
      <div className="grid-2">
        {/* Live latency chart */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header">
            <Zap size={13} />
            Inference Latency
            {latencies.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(0,212,255,0.4)',
                fontFamily: 'JetBrains Mono' }}>
                {latencies.length} runs
              </span>
            )}
          </div>
          {chartData.length === 0 ? (
            <div style={{
              height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(126,200,227,0.25)', fontSize: 12, flexDirection: 'column', gap: 8,
            }}>
              <Zap size={28} color="rgba(0,212,255,0.15)" />
              Run inference to see latency data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
                <XAxis dataKey="i" tick={{ fill: 'rgba(126,200,227,0.3)', fontSize: 10 }}
                  label={{ value: 'run', position: 'insideBottom', offset: -2,
                    fill: 'rgba(126,200,227,0.2)', fontSize: 9 }} />
                <YAxis tick={{ fill: 'rgba(126,200,227,0.3)', fontSize: 10 }}
                  unit="ms" width={45} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(3,3,20,0.97)', border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: 6, fontSize: 11,
                  }}
                  labelStyle={{ color: 'rgba(0,212,255,0.6)' }}
                  itemStyle={{ color: '#ff8c00' }}
                  formatter={(v: number) => [`${v} ms`, 'Latency']}
                  labelFormatter={(l: number) => `Run #${l}`}
                />
                <Line type="monotone" dataKey="ms" stroke="#ff8c00"
                  strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: '#ff8c00', stroke: 'rgba(255,140,0,0.3)', strokeWidth: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {latencies.length > 1 && (() => {
            const vals = latencies.map(e => e.ms)
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length
            const min = Math.min(...vals)
            const max = Math.max(...vals)
            return (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                {[['Min', min, '#39ff14'], ['Avg', avg, '#ff8c00'], ['Max', max, '#ff2d78']].map(([l, v, c]) => (
                  <div key={l as string} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono', color: c as string }}>
                      {(v as number).toFixed(0)}ms
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Model info card */}
        <div className="card" style={{ background: 'rgba(5,5,18,0.9)' }}>
          <div className="section-header"><Database size={13} /> Loaded Models</div>
          {!modelInfo ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(126,200,227,0.25)', fontSize: 12 }}>
              Loading…
            </div>
          ) : modelInfo.models.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8, color: 'rgba(255,140,0,0.5)', fontSize: 12 }}>
              <Database size={28} color="rgba(255,140,0,0.15)" />
              No model files found in /models
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {modelInfo.models.map(m => (
                <div key={m.name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: '1px solid rgba(0,212,255,0.06)',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#00d4ff', fontFamily: 'JetBrains Mono', fontWeight: 600 }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(126,200,227,0.35)', marginTop: 2 }}>
                      {m.ext === '.pt' ? 'PyTorch model' : 'Binary model'}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 700,
                    color: m.size_mb > 50 ? '#b44aff' : m.size_mb > 10 ? '#ff8c00' : '#39ff14',
                  }}>
                    {m.size_mb.toFixed(1)} MB
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6,
                background: modelInfo.pipeline_ready ? 'rgba(57,255,20,0.05)' : 'rgba(255,140,0,0.05)',
                border: `1px solid ${modelInfo.pipeline_ready ? 'rgba(57,255,20,0.15)' : 'rgba(255,140,0,0.15)'}`,
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                color: modelInfo.pipeline_ready ? '#39ff14' : '#ff8c00',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%',
                  background: modelInfo.pipeline_ready ? '#39ff14' : '#ff8c00',
                  boxShadow: modelInfo.pipeline_ready ? '0 0 6px #39ff14' : undefined,
                }} />
                {modelInfo.pipeline_ready ? 'Pipeline loaded and ready' : 'Pipeline not loaded'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
