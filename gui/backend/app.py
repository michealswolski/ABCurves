"""ABCurves Flask backend — includes MAKCU serial port integration."""

import json
import time
import threading
import numpy as np
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import logging
from datetime import datetime

from abcurves import Pipeline
from serial_manager import SerialManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ── Singletons ────────────────────────────────────────────────────────────────
serial_mgr = SerialManager()
pipeline = None
inference_history: list[dict] = []
latency_history: list[dict] = []   # rolling last 100 inference latencies
training_logs: list[dict] = []


def init_pipeline():
    global pipeline
    try:
        pipeline = Pipeline.from_pretrained()
        logger.info("Pipeline initialised")
        return True
    except Exception as exc:
        logger.error("Pipeline init failed: %s", exc)
        return False


# ═══════════════════════════════════════════════════════════════════════════════
#  Health / general
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'pipeline_ready': pipeline is not None,
        'serial': serial_mgr.status,
        'timestamp': datetime.now().isoformat(),
    })


@app.route('/api/models')
def get_models():
    return jsonify({
        'planners':  [
            {'name': 'Planner Seed 7',  'path': 'models/planner_seed7.pt'},
            {'name': 'Planner Seed 23', 'path': 'models/planner_seed23.pt'},
        ],
        'renderers': [
            {'name': 'Renderer Global H80',       'path': 'models/renderer_global_h80.bin'},
            {'name': 'Renderer Global H80 Float', 'path': 'models/renderer_global_h80_float.pt'},
        ],
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  Inference
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/inference', methods=['POST'])
def run_inference():
    try:
        data = request.json
        if not data.get('prefix'):
            return jsonify({'error': 'No prefix data provided'}), 400

        prefix = np.array(data['prefix'], dtype=np.float32)
        if prefix.ndim != 2 or prefix.shape[1] != 2:
            return jsonify({'error': 'Prefix must have shape (N, 2)'}), 400
        if len(prefix) < 10:
            return jsonify({'error': 'Prefix too short (minimum 10 samples)'}), 400

        target_rel   = tuple(data.get('target', [100, 0]))
        target_radius = float(data.get('target_radius', 18.0))
        prog_center   = float(data.get('progress_center', 0.72))
        seed          = int(data.get('seed', 2026))

        t0 = time.time()
        with Pipeline.from_pretrained() as pipe:
            renderer_profile = None
            if data.get('profile'):
                prof = np.array(data['profile'], dtype=np.int16)
                if prof.shape == (256, 2):
                    renderer_profile = pipe.prepare_renderer_profile(prof)
            counts = pipe.generate(
                prefix,
                renderer_profile=renderer_profile,
                target_rel_at_B=target_rel,
                target_radius=target_radius,
                progress_center=prog_center,
                seed=seed,
            )
        latency_ms = round((time.time() - t0) * 1000, 2)

        entry = {
            'timestamp':           datetime.now().isoformat(),
            'prefix_length':       len(prefix),
            'continuation_length': len(counts),
            'continuation':        counts.tolist(),
            'latency_ms':          latency_ms,
            'parameters': {
                'target': list(target_rel), 'target_radius': target_radius,
                'progress_center': prog_center, 'seed': seed,
            },
        }
        inference_history.append(entry)
        latency_history.append({'t': entry['timestamp'], 'ms': latency_ms})
        if len(latency_history) > 100:
            latency_history.pop(0)
        return jsonify({
            'success': True,
            'continuation': counts.tolist(),
            'latency_ms': latency_ms,
            'stats': {
                'prefix_length':       len(prefix),
                'continuation_length': len(counts),
                'total_length':        len(prefix) + len(counts),
            },
        })

    except Exception as exc:
        logger.error("Inference error: %s", exc)
        return jsonify({'error': str(exc)}), 500


@app.route('/api/inference-history')
def get_inference_history():
    limit = request.args.get('limit', 10, type=int)
    return jsonify({'count': len(inference_history), 'history': inference_history[-limit:]})


@app.route('/api/inference/latency-history')
def inference_latency_history():
    limit = request.args.get('limit', 50, type=int)
    return jsonify({'history': latency_history[-limit:]})


@app.route('/api/inference/batch', methods=['POST'])
def run_inference_batch():
    """Run N inferences with different seeds; return all continuations."""
    try:
        data = request.json or {}
        n = min(max(int(data.get('n', 3)), 1), 10)
        if not data.get('prefix'):
            return jsonify({'error': 'No prefix data provided'}), 400

        prefix = np.array(data['prefix'], dtype=np.float32)
        target_rel    = tuple(data.get('target', [100, 0]))
        target_radius = float(data.get('target_radius', 18.0))
        prog_center   = float(data.get('progress_center', 0.72))
        base_seed     = int(data.get('seed', 2026))

        results = []
        with Pipeline.from_pretrained() as pipe:
            for i in range(n):
                t0 = time.time()
                counts = pipe.generate(
                    prefix,
                    target_rel_at_B=target_rel,
                    target_radius=target_radius,
                    progress_center=prog_center,
                    seed=base_seed + i,
                )
                results.append({
                    'index':        i,
                    'seed':         base_seed + i,
                    'latency_ms':   round((time.time() - t0) * 1000, 2),
                    'continuation': counts.tolist(),
                    'length':       len(counts),
                })
        return jsonify({'success': True, 'n': n, 'results': results})
    except Exception as exc:
        logger.error("Batch inference error: %s", exc)
        return jsonify({'error': str(exc)}), 500


@app.route('/api/models/info')
def models_info():
    """Return loaded model files with sizes."""
    model_dir = Path(__file__).parent.parent.parent / 'models'
    models = []
    try:
        for pat in ('*.pt', '*.bin'):
            for f in sorted(model_dir.glob(pat)):
                size_mb = f.stat().st_size / 1024 / 1024
                models.append({'name': f.name, 'size_mb': round(size_mb, 2), 'ext': f.suffix})
    except FileNotFoundError:
        pass
    return jsonify({
        'models':        models,
        'count':         len(models),
        'pipeline_ready': pipeline is not None,
    })


@app.route('/api/example-data')
def get_example_data():
    np.random.seed(42)
    prefix = np.random.randn(50, 2).astype(np.float32) * 5
    return jsonify({
        'prefix':          prefix.tolist(),
        'profile':         np.random.randint(-10, 10, (256, 2)).astype(np.int16).tolist(),
        'target':          [100, -20],
        'target_radius':   18.0,
        'progress_center': 0.72,
        'seed':            2026,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  Serial / MAKCU endpoints
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/serial/ports')
def serial_ports():
    """List all available COM ports with MAKCU likelihood flags."""
    return jsonify({'ports': serial_mgr.list_ports()})


@app.route('/api/serial/status')
def serial_status():
    return jsonify(serial_mgr.status)


@app.route('/api/serial/connect', methods=['POST'])
def serial_connect():
    d    = request.json or {}
    port = d.get('port', '')
    baud = int(d.get('baud', 115200))
    proto = d.get('protocol', 'text')
    if not port:
        return jsonify({'ok': False, 'error': 'port is required'}), 400
    result = serial_mgr.connect(port, baud, proto)
    if result['ok']:
        socketio.emit('serial_status', serial_mgr.status)
    return jsonify(result)


@app.route('/api/serial/connect-makcu', methods=['POST'])
def serial_connect_makcu():
    """Auto-negotiate baud rate and connect using the MAKCU Native API protocol."""
    d = request.json or {}
    port = d.get('port', '')
    if not port:
        return jsonify({'ok': False, 'error': 'port is required'}), 400
    result = serial_mgr.connect_makcu(port)
    if result['ok']:
        socketio.emit('serial_status', serial_mgr.status)
    return jsonify(result)


@app.route('/api/serial/disconnect', methods=['POST'])
def serial_disconnect():
    result = serial_mgr.disconnect()
    socketio.emit('serial_status', serial_mgr.status)
    return jsonify(result)


@app.route('/api/serial/send-reports', methods=['POST'])
def serial_send_reports():
    """Send a full inference continuation to the MAKCU.

    Body: { reports: [[dx,dy],...], interval_ms: 1.0 }
    Streams progress events via WebSocket while sending.
    """
    if not serial_mgr.is_connected:
        return jsonify({'ok': False, 'error': 'MAKCU not connected'}), 400

    d        = request.json or {}
    reports  = d.get('reports', [])
    interval = float(d.get('interval_ms', 1.0))

    if not reports:
        return jsonify({'ok': False, 'error': 'No reports provided'}), 400

    # Run transmission in a background thread so we can stream progress.
    def do_send():
        def progress(sent, total):
            if sent % 50 == 0 or sent == total:
                socketio.emit('serial_progress', {
                    'sent': sent, 'total': total,
                    'pct': round(sent / total * 100, 1),
                })

        result = serial_mgr.send_reports(reports, interval, on_progress=progress)
        socketio.emit('serial_done', result)

    threading.Thread(target=do_send, daemon=True).start()
    return jsonify({'ok': True, 'message': 'Transmission started', 'total': len(reports)})


@app.route('/api/serial/send-single', methods=['POST'])
def serial_send_single():
    """Send one dx/dy report — for manual jog control."""
    d  = request.json or {}
    dx = int(d.get('dx', 0))
    dy = int(d.get('dy', 0))
    return jsonify(serial_mgr.send_single(dx, dy))


@app.route('/api/serial/click', methods=['POST'])
def serial_click():
    button = (request.json or {}).get('button', 'left')
    return jsonify(serial_mgr.click(button))


@app.route('/api/serial/reset-stats', methods=['POST'])
def serial_reset_stats():
    serial_mgr.reset_stats()
    return jsonify({'ok': True})


@app.route('/api/serial/reconnect', methods=['POST'])
def serial_reconnect():
    result = serial_mgr.reconnect()
    if result['ok']:
        socketio.emit('serial_status', serial_mgr.status)
    return jsonify(result)


@app.route('/api/serial/macro/replay', methods=['POST'])
def serial_macro_replay():
    """Replay a sequence of macro events through the connected MAKCU."""
    if not serial_mgr.is_connected:
        return jsonify({'ok': False, 'error': 'MAKCU not connected'}), 400

    events = (request.json or {}).get('events', [])
    if not events:
        return jsonify({'ok': False, 'error': 'No events provided'}), 400

    def do_replay():
        def progress(done, total):
            socketio.emit('macro_progress', {'done': done, 'total': total})
        result = serial_mgr.replay_macro_events(events, on_progress=progress)
        socketio.emit('macro_done', result)

    threading.Thread(target=do_replay, daemon=True).start()
    return jsonify({'ok': True, 'message': 'Macro replay started', 'total': len(events)})


# ═══════════════════════════════════════════════════════════════════════════════
#  Training config
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/training/config', methods=['GET', 'POST'])
def training_config():
    if request.method == 'GET':
        return jsonify({
            'planner':  {'epochs': 100, 'batch_size': 32,
                         'learning_rate': 0.001, 'heads': 16},
            'renderer': {'epochs': 50,  'batch_size': 64,
                         'learning_rate': 0.0005, 'hidden_size': 128},
        })
    return jsonify({'success': True, 'config': request.json})


# ═══════════════════════════════════════════════════════════════════════════════
#  Benchmarks / detection
# ═══════════════════════════════════════════════════════════════════════════════

@app.route('/api/benchmarks')
def get_benchmarks():
    bfile = Path(__file__).parent.parent.parent / 'results' / 'inference' / 'benchmark_this_machine.json'
    try:
        return jsonify(json.loads(bfile.read_text()))
    except FileNotFoundError:
        return jsonify({
            'renderer_profile': {'median_ms': 0.240, 'p99_ms': 0.434},
            'first_report':     {'median_ms': 0.276, 'p99_ms': 0.547},
        })


@app.route('/api/detection-study')
def get_detection_study():
    return jsonify({
        'cold_test':  {'caught': 0,  'total': 1280, 'detection_rate': 0.0},
        'warm_test':  {'caught': 36, 'total': 40,   'detection_rate': 0.9,
                       'false_positive': 0.05},
        'texture_distances': {
            'two_real_samples':              0.150,
            'same_person_different_session': 0.240,
            'renderer_output':               0.263,
            'closest_different_person':      0.280,
            'average_different_person':      0.639,
        },
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  WebSocket events
# ═══════════════════════════════════════════════════════════════════════════════

@socketio.on('connect')
def on_connect():
    emit('connection_response', {
        'status': 'connected',
        'serial': serial_mgr.status,
    })


@socketio.on('disconnect')
def on_disconnect():
    logger.info("WebSocket client disconnected")


@socketio.on('request_serial_status')
def on_request_serial_status():
    emit('serial_status', serial_mgr.status)


# ═══════════════════════════════════════════════════════════════════════════════
#  Startup
# ═══════════════════════════════════════════════════════════════════════════════

@app.before_request
def ensure_pipeline():
    global pipeline
    if pipeline is None:
        init_pipeline()


if __name__ == '__main__':
    init_pipeline()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, use_reloader=False)
