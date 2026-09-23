import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Inference from './pages/Inference'
import Training from './pages/Training'
import Metrics from './pages/Metrics'
import About from './pages/About'
import Device from './pages/Device'
import Settings from './pages/Settings'
import Overlay from './pages/Overlay'
import { api } from './services/api'

function AppLayout() {
  const location = useLocation()
  if (location.pathname === '/overlay') {
    return <Overlay />
  }
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-primary)' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inference" element={<Inference />} />
          <Route path="/device" element={<Device />} />
          <Route path="/training" element={<Training />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/about" element={<About />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/overlay" element={<Overlay />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  useEffect(() => {
    // Warm up the inference pipeline on startup so the first real inference is fast
    api.warmup().catch(() => {})
  }, [])

  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}
