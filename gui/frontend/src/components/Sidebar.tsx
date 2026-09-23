import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  MousePointer2,
  Cpu,
  BarChart2,
  Info,
  Zap,
  Usb,
  Settings,
} from 'lucide-react'

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/inference', icon: MousePointer2,   label: 'Inference'  },
  { to: '/device',    icon: Usb,             label: 'MAKCU Device' },
  { to: '/training',  icon: Cpu,             label: 'Training'   },
  { to: '/metrics',   icon: BarChart2,       label: 'Metrics'    },
  { to: '/about',     icon: Info,            label: 'About'      },
  { to: '/settings',  icon: Settings,        label: 'Settings'   },
]

export default function Sidebar() {
  return (
    <div style={{
      width: 220,
      minHeight: '100vh',
      background: 'rgba(3, 3, 16, 0.97)',
      borderRight: '1px solid rgba(0,212,255,0.12)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
    }}>
      {/* Glowing right edge */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0,
        width: 1,
        height: '100%',
        background: 'linear-gradient(180deg, transparent 0%, rgba(0,212,255,0.5) 35%, rgba(180,74,255,0.5) 65%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{
        padding: '28px 20px 22px',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(180,74,255,0.2))',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(0,212,255,0.2)',
          }}>
            <Zap size={14} color="#00d4ff" />
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            background: 'linear-gradient(90deg, #00d4ff, #b44aff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            ABCurves
          </div>
        </div>
        <div style={{
          fontSize: 10,
          color: 'rgba(0,212,255,0.4)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          paddingLeft: 36,
        }}>
          Movement AI
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(0,212,255,0.3)',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          padding: '4px 10px 8px',
        }}>
          Navigation
        </div>

        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.02em',
              transition: 'all 0.15s ease',
              position: 'relative',
              background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
              color: isActive ? '#00d4ff' : 'rgba(126,200,227,0.5)',
              borderLeft: isActive ? '2px solid #00d4ff' : '2px solid transparent',
              boxShadow: isActive ? 'inset 0 0 14px rgba(0,212,255,0.04)' : 'none',
              textShadow: isActive ? '0 0 8px rgba(0,212,255,0.5)' : 'none',
            })}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid rgba(0,212,255,0.08)',
        fontSize: 10,
        color: 'rgba(0,212,255,0.25)',
        letterSpacing: '0.06em',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="dot-live" style={{ width: 5, height: 5 }} />
          v1.6.0 · Academic Research
        </div>
      </div>
    </div>
  )
}
