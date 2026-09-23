import React from 'react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-header">{title}</div>
      {children}
    </div>
  )
}

export default function About() {
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <h1 className="page-title">About ABCurves</h1>
      <p className="page-subtitle">Academic ML/IoT project — realistic mouse movement generation</p>

      <Section title="Project Overview">
        <div className="card">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-primary)' }}>ABCurves</strong> is an academic research project that generates
            highly realistic mouse cursor trajectories indistinguishable from real human input. It uses a two-stage
            deep learning pipeline — a <em style={{ color: 'var(--accent-blue)' }}>Planner</em> and a{' '}
            <em style={{ color: 'var(--accent-purple)' }}>Renderer</em> — to model how a human moves from a recorded
            starting segment (A→B) to a target endpoint (C).
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 12 }}>
            The key insight is that natural mouse movement has both macro-scale characteristics (overall trajectory
            shape) and micro-scale texture (velocity jitter, overshoot, correction). ABCurves captures both via
            ProDMP (Probabilistic Dynamic Movement Primitives) conditioned on the recorded prefix context.
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            The system achieves a <strong style={{ color: 'var(--accent-green)' }}>0% cold-detection rate</strong> on
            standard bot classifiers and a texture distance of{' '}
            <strong style={{ color: 'var(--accent-blue)' }}>0.263</strong> — the closest to real human samples of
            any comparable renderer.
          </p>
        </div>
      </Section>

      <Section title="Key Capabilities">
        <div className="grid-3">
          {[
            { icon: '🎯', title: 'Target-Conditioned', desc: 'Generates trajectories that precisely reach a specified target within a given radius.' },
            { icon: '🔀', title: 'Context-Aware', desc: 'Uses the recorded A→B prefix as context to produce a natural-looking B→C continuation.' },
            { icon: '⚡', title: 'Low Latency', desc: 'Sub-millisecond inference — 0.24ms median, enabling real-time use.' },
            { icon: '🛡️', title: 'Anti-Detection', desc: '0% cold-detection rate against standard ML-based bot classifiers.' },
            { icon: '🌊', title: 'Texture Fidelity', desc: 'Texture distance of 0.263 vs real human (vs 0.481+ for Bezier methods).' },
            { icon: '🎲', title: 'Seeded Sampling', desc: 'Reproducible trajectories via seed parameter for debugging and evaluation.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px',
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Publications & References">
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              borderLeft: '3px solid var(--accent-blue)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                ProDMP: A Unified Perspective on Dynamic and Probabilistic Movement Primitives
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Carvalho, J., et al. (2023). NeurIPS 2023.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                The foundational architecture for the Renderer component — probabilistic trajectory generation
                conditioned on phase and context.
              </div>
            </div>
            <div style={{
              padding: '12px 16px',
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              borderLeft: '3px solid var(--accent-purple)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                ABCurves: Realistic Mouse Movement Generation for IoT Security Research
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Academic project report, 2024.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Full architecture description, dataset curation process, evaluation methodology, and
                anti-detection benchmark results.
              </div>
            </div>
          </div>
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Technical Stack">
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
              {[
                ['ML Framework', 'PyTorch 2.1'],
                ['Architecture', 'ProDMP (Transformer + DMP)'],
                ['Serving', 'Flask REST API'],
                ['Frontend', 'React 18 + TypeScript'],
                ['Visualization', 'Recharts + Canvas API'],
                ['Language', 'Python 3.11 / TypeScript'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'Consolas, monospace', fontSize: 12 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Links">
          <div className="card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <a
                href="https://github.com/terrafirma2021/makcu-docs"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <span style={{ fontSize: 20 }}>⬡</span>
                <div>
                  <div style={{ fontWeight: 600 }}>GitHub Repository</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Source code and model weights</div>
                </div>
              </a>
              <div style={{
                padding: '10px 14px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>API Reference</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'Consolas, monospace', fontSize: 11, color: 'var(--accent-blue)' }}>
                  <span>GET  /api/health</span>
                  <span>GET  /api/models</span>
                  <span>POST /api/inference</span>
                  <span>GET  /api/benchmarks</span>
                  <span>GET  /api/detection-study</span>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 12 }}>
        ABCurves GUI v1.6.0 · Academic Research Project · Not for production use without ethics review
      </div>
    </div>
  )
}
