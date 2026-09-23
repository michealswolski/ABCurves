import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Inference from './pages/Inference'
import Training from './pages/Training'
import Metrics from './pages/Metrics'
import About from './pages/About'
import Device from './pages/Device'
import Settings from './pages/Settings'
import { api } from './services/api'

export default function App() {
  useEffect(() => {
    // Warm up the inference pipeline on startup so the first real inference is fast
    api.warmup().catch(() => {})
  }, [])

  return (
    <BrowserRouter>
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
