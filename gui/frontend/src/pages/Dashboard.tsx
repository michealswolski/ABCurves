import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard'
import { Activity, Cpu, Zap, Shield, MousePointer2, BarChart2, Brain } from 'lucide-react'
import { api } from '../services/api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)

  useEffect(() => {
    api.health()
      .then(() => setServerOnline(true))
      .catch(() => setServerOnline(false))
  }, [])

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
               ? '✓ Backend connected · localhost:5000 · Pipeline ready'
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
          value="0 / 1280"
          subtitle="Undetected in cold tests"
          icon={<Shield size={20} />}
          accent="#39ff14"
          trend={{ direction: 'down', label: '0% catch rate' }}
        />
        <StatCard
          title="Texture Distance"
          value="0.263"
          subtitle="Inside human range"
          icon={<Activity size={20} />}
          accent="#b44aff"
          trend={{ direction: 'down', label: 'Human avg: 0.639' }}
        />
        <StatCard
          title="P50 Latency"
          value="0.24ms"
          subtitle="Profile path, warmed"
          icon={<Zap size={20} />}
          accent="#ff8c00"
          trend={{ direction: 'neutral', label: 'p99: 0.43ms' }}
        />
      </div>

      {/* Main grid */}
      <div className="grid-2">
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

            {/* Node A */}
            <rect x="10" y="55" width="110" height="90" rx="10"
              fill="rgba(0,212,255,0.06)" stroke="#00d4ff" strokeWidth="1.2"/>
            <text x="65" y="93" textAnchor="middle" fill="#00d4ff" fontSize="28" fontWeight="800" filter="url(#glow-blue)">A</text>
            <text x="65" y="112" textAnchor="middle" fill="rgba(0,212,255,0.7)" fontSize="10" fontWeight="600">Start Point</text>
            <text x="65" y="127" textAnchor="middle" fill="rgba(0,212,255,0.4)" fontSize="9">Human prefix dx/dy</text>

            {/* Arrow A→B */}
            <line x1="124" y1="100" x2="180" y2="100"
              stroke="url(#lineGrad)" strokeWidth="2"
              markerEnd="url(#arr-blue)" strokeDasharray="6,4"/>
            <text x="153" y="90" textAnchor="middle" fill="rgba(0,212,255,0.5)" fontSize="9">Planner reads</text>

            {/* Node B */}
            <rect x="184" y="55" width="110" height="90" rx="10"
              fill="rgba(180,74,255,0.06)" stroke="#b44aff" strokeWidth="1.2"/>
            <text x="239" y="93" textAnchor="middle" fill="#b44aff" fontSize="28" fontWeight="800" filter="url(#glow-purple)">B</text>
            <text x="239" y="112" textAnchor="middle" fill="rgba(180,74,255,0.8)" fontSize="10" fontWeight="600">Waypoint</text>
            <text x="239" y="127" textAnchor="middle" fill="rgba(180,74,255,0.5)" fontSize="9">Cut &amp; plan here</text>

            {/* Arrow B→C */}
            <line x1="298" y1="100" x2="354" y2="100"
              stroke="#b44aff" strokeWidth="2"
              markerEnd="url(#arr-purple)" strokeDasharray="6,4"/>
            <text x="327" y="90" textAnchor="middle" fill="rgba(180,74,255,0.5)" fontSize="9">Renderer emits</text>

            {/* Node C */}
            <rect x="358" y="55" width="110" height="90" rx="10"
              fill="rgba(57,255,20,0.05)" stroke="#39ff14" strokeWidth="1.2"/>
            <text x="413" y="93" textAnchor="middle" fill="#39ff14" fontSize="28" fontWeight="800">C</text>
            <text x="413" y="112" textAnchor="middle" fill="rgba(57,255,20,0.8)" fontSize="10" fontWeight="600">Target</text>
            <text x="413" y="127" textAnchor="middle" fill="rgba(57,255,20,0.5)" fontSize="9">Generated 1kHz output</text>

            {/* Bottom label */}
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
                ['Cold Detection', '0 / 1,280 caught',  '#39ff14'],
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
    </div>
  )
}
