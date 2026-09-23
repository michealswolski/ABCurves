import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: React.ReactNode
  accent?: string
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string }
}

export default function StatCard({ title, value, subtitle, icon, accent, trend }: StatCardProps) {
  const color = accent || '#00d4ff'

  const hexToRgba = (hex: string, alpha: number) => {
    // Handle css var references gracefully
    if (hex.startsWith('var(')) return `rgba(0,212,255,${alpha})`
    const r = parseInt(hex.slice(1,3), 16)
    const g = parseInt(hex.slice(3,5), 16)
    const b = parseInt(hex.slice(5,7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  return (
    <div
      style={{
        background: 'rgba(10, 10, 28, 0.85)',
        border: `1px solid ${hexToRgba(color, 0.18)}`,
        borderRadius: 12,
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
        backdropFilter: 'blur(12px)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = hexToRgba(color, 0.45)
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 0 20px ${hexToRgba(color, 0.15)}, 0 8px 24px rgba(0,0,0,0.4)`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = hexToRgba(color, 0.18)
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: `linear-gradient(90deg, ${color}, ${hexToRgba(color, 0)})`,
        boxShadow: `0 0 10px ${hexToRgba(color, 0.5)}`,
      }} />

      {/* Corner glow */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: 80, height: 80,
        background: `radial-gradient(circle at 0 0, ${hexToRgba(color, 0.06)}, transparent)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'rgba(126,200,227,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 10,
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 30,
            fontWeight: 700,
            color: color,
            lineHeight: 1,
            marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace",
            textShadow: `0 0 14px ${hexToRgba(color, 0.4)}`,
          }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'rgba(126,200,227,0.6)', marginTop: 4 }}>
              {subtitle}
            </div>
          )}
          {trend && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 10,
              fontSize: 11,
              fontWeight: 600,
              color: trend.direction === 'up' ? '#39ff14' :
                     trend.direction === 'down' ? '#ff2d78' : 'rgba(126,200,227,0.5)',
              letterSpacing: '0.04em',
            }}>
              {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '●'}
              {trend.label}
            </div>
          )}
        </div>
        {icon && (
          <div style={{
            width: 44, height: 44,
            borderRadius: 10,
            background: hexToRgba(color, 0.08),
            border: `1px solid ${hexToRgba(color, 0.2)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
            flexShrink: 0,
            boxShadow: `0 0 12px ${hexToRgba(color, 0.12)}`,
          }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
