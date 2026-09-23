import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Inference from './pages/Inference'
import Training from './pages/Training'
import Metrics from './pages/Metrics'
import About from './pages/About'
import Device from './pages/Device'

export default function App() {
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
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
