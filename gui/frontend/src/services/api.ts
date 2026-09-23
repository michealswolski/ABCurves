const BASE = '/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InferenceRequest {
  prefix: [number, number][]
  target: [number, number]
  target_radius: number
  progress_center: number
  seed: number
  profile?: number[][]
}

export interface InferenceResult {
  success: boolean
  continuation: [number, number][]
  stats: { prefix_length: number; continuation_length: number; total_length: number }
}

export interface HealthResponse {
  status: string
  pipeline_ready: boolean
  serial: SerialStatus
  timestamp: string
}

export interface SerialPort {
  device:        string
  description:   string
  hwid:          string
  vid:           number | null
  pid:           number | null
  manufacturer:  string
  serial_number: string
  likely_makcu:  boolean
}

export interface SerialStats {
  bytes_sent:   number
  reports_sent: number
  errors:       number
  rate_bps:     number
}

export interface SerialStatus {
  connected: boolean
  port:      string
  baud:      number
  protocol:  string
  stats:     SerialStats
}

export interface SerialConnectRequest {
  port:     string
  baud:     number
  protocol: 'text' | 'ch9329' | 'raw_binary'
}

export interface TrainingConfig {
  epochs: number
  batch_size: number
  learning_rate: number
  dataset_path?: string
  model_output?: string
  sequence_length?: number
}

export interface BenchmarkResult {
  renderer_profile?: { median_ms: number; p99_ms: number }
  first_report?:     { median_ms: number; p99_ms: number }
  [key: string]: unknown
}

export interface DetectionStudy {
  cold_test: { caught: number; total: number; detection_rate: number }
  warm_test: { caught: number; total: number; detection_rate: number; false_positive: number }
  texture_distances: Record<string, number>
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  // General
  health:      () => get<HealthResponse>('/health'),
  models:      () => get<{ planners: unknown[]; renderers: unknown[] }>('/models'),
  exampleData: () => get<{
    prefix: [number, number][]; profile: number[][]
    target: [number, number]; target_radius: number
    progress_center: number; seed: number
  }>('/example-data'),

  // Inference
  runInference:     (req: InferenceRequest) => post<InferenceResult>('/inference', req),
  inferenceHistory: (limit = 10) => get<{ count: number; history: unknown[] }>(`/inference-history?limit=${limit}`),

  // Serial / MAKCU
  serial: {
    ports:       () => get<{ ports: SerialPort[] }>('/serial/ports'),
    status:      () => get<SerialStatus>('/serial/status'),
    connect:     (req: SerialConnectRequest) => post<{ ok: boolean; error?: string }>('/serial/connect', req),
    disconnect:  () => post<{ ok: boolean }>('/serial/disconnect'),
    sendReports: (reports: [number, number][], interval_ms = 1.0) =>
                   post<{ ok: boolean; message: string; total: number }>(
                     '/serial/send-reports', { reports, interval_ms }),
    sendSingle:  (dx: number, dy: number) =>
                   post<{ ok: boolean; error?: string }>('/serial/send-single', { dx, dy }),
    click:       (button: 'left' | 'right' | 'middle' = 'left') =>
                   post<{ ok: boolean }>('/serial/click', { button }),
    resetStats:  () => post<{ ok: boolean }>('/serial/reset-stats'),
  },

  // Training
  trainingConfig:     () => get<{ planner: TrainingConfig; renderer: TrainingConfig }>('/training/config'),
  saveTrainingConfig: (cfg: unknown) => post<{ success: boolean }>('/training/config', cfg),

  // Results
  benchmarks:     () => get<BenchmarkResult>('/benchmarks'),
  detectionStudy: () => get<DetectionStudy>('/detection-study'),
}
