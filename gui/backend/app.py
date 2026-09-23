"""ABCurves Flask backend — includes MAKCU serial port integration."""

import json
import math
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

        if pipeline is None:
            return jsonify({'error': 'Pipeline not ready — model weights not loaded'}), 503

        t0 = time.time()
        renderer_profile = None
        if data.get('profile'):
            prof = np.array(data['profile'], dtype=np.int16)
            if prof.shape == (256, 2):
                renderer_profile = pipeline.prepare_renderer_profile(prof)
        counts = pipeline.generate(
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

        if pipeline is None:
            return jsonify({'error': 'Pipeline not ready — model weights not loaded'}), 503

        results = []
        for i in range(n):
            t0 = time.time()
            counts = pipeline.generate(
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


@app.route('/api/warmup', methods=['POST'])
def warmup():
    """Run a throwaway inference to warm up the pipeline and GPU kernels."""
    if pipeline is None:
        return jsonify({'ok': False, 'error': 'Pipeline not ready'}), 503
    try:
        np.random.seed(0)
        prefix = np.random.randn(20, 2).astype(np.float32) * 3
        raw_profile = np.random.randint(-10, 10, (256, 2)).astype(np.int16)
        renderer_profile = pipeline.prepare_renderer_profile(raw_profile)
        t0 = time.time()
        pipeline.generate(prefix, renderer_profile=renderer_profile,
                          target_rel_at_B=(50, 0), target_radius=10, progress_center=0.5, seed=1)
        ms = round((time.time() - t0) * 1000, 1)
        return jsonify({'ok': True, 'latency_ms': ms})
    except Exception as exc:
        logger.warning("Warmup error: %s", exc)
        return jsonify({'ok': False, 'error': str(exc)}), 500


# Shared live target pushed by external processes
_live_target: dict = {}

@app.route('/api/target/push', methods=['POST'])
def push_target():
    """Accept pixel coordinates (from an overlay/script), convert to counts, and emit via WebSocket."""
    global _live_target
    d = request.json or {}
    px_x = float(d.get('px_x', 0))
    px_y = float(d.get('px_y', 0))
    fov_config = d.get('fov_config')  # optional: {dpi, sensitivity, fovH, screenW}
    if fov_config:
        dpi, sens = float(fov_config['dpi']), float(fov_config['sensitivity'])
        fovH, screenW = float(fov_config['fovH']), float(fov_config['screenW'])
        cpp = (dpi / 400) / (sens * 0.022) * (fovH / screenW)
    else:
        # Default CS2 @ 400 DPI, 3.2554 sens, 106.26 FOV, 2560 wide
        cpp = (400 / 400) / (3.2554 * 0.022) * (106.26 / 2560)
    cx = round(px_x * cpp)
    cy = round(px_y * cpp)
    _live_target = {'x': cx, 'y': cy, 'px_x': px_x, 'px_y': px_y}
    socketio.emit('target_update', _live_target)
    return jsonify({'ok': True, 'counts': [cx, cy]})


# ── AIM MODE PRESETS ─────────────────────────────────────────────────────────
#
#  snap   — hard instant snap, short burst, 40ms travel, very tight radius
#  track  — continuous follow, velocity-predicted, 80ms travel, medium radius
#  smooth — gradual human-looking arc, 160ms travel, relaxed radius
#
AIM_MODES: dict[str, dict] = {
    'snap': {
        'max_movement_ms': 40,
        'interval_ms':     0.5,
        'cooldown_ms':     80,
        'target_radius':   4,
        'progress_center': 0.25,   # front-loaded curve → arrives early
        'aim_height':      0.10,   # head level
        'desc':            'Instant hard snap — fastest, most mechanical',
    },
    'track': {
        'max_movement_ms': 80,
        'interval_ms':     1.0,
        'cooldown_ms':     150,
        'target_radius':   8,
        'progress_center': 0.40,
        'aim_height':      0.12,
        'desc':            'Continuous tracking with velocity prediction',
    },
    'smooth': {
        'max_movement_ms': 160,
        'interval_ms':     2.0,
        'cooldown_ms':     350,
        'target_radius':   14,
        'progress_center': 0.55,   # symmetric, natural-looking arc
        'aim_height':      0.15,   # upper chest
        'desc':            'Gradual human-like arc — least mechanical',
    },
}

# ── Vision auto-detection ─────────────────────────────────────────────────────
_det_state: dict = {
    'running':    False,
    'fps':        0.0,
    'hits':       0,
    'last_px':    None,
    'thread':     None,
    'classes':    [],
    'last_error': None,
    'velocity':   None,   # [vx_px_per_s, vy_px_per_s]
    'mode':       'track',
    'config':     {},
}
_det_lock = threading.Lock()


def _run_detection(
    classes: list,
    confidence: float,
    cooldown_ms: float,
    fov_config: dict | None,
    max_movement_ms: float,
    interval_ms: float,
    aim_height: float,
    mode: str,
    lead_ms: float,
    rcs_strength: float,
    target_radius: float,
    progress_center: float,
):
    from collections import deque

    try:
        import torch
        from ultralytics import YOLOWorld
    except ImportError as exc:
        msg = f"Detection deps missing: {exc}"
        logger.error(msg)
        with _det_lock:
            _det_state['running'] = False
            _det_state['last_error'] = msg
        return

    device   = 'cuda' if torch.cuda.is_available() else 'cpu'
    use_fp16 = device == 'cuda'
    logger.info("Detection device: %s%s  mode=%s", device.upper(), " (FP16)" if use_fp16 else "", mode)

    logger.info("Loading YOLO-World…")
    try:
        model = YOLOWorld('yolov8s-worldv2.pt')
        model.set_classes(classes)
        model.to(device)
        if use_fp16:
            model.model.half()
    except Exception as exc:
        msg = f"YOLO-World load failed: {exc}"
        logger.error(msg)
        with _det_lock:
            _det_state['running'] = False
            _det_state['last_error'] = msg
        return

    logger.info("YOLO-World ready — classes=%s  mode=%s — warming up…", classes, mode)
    try:
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        with torch.no_grad():
            for _ in range(3):
                model(dummy, conf=0.1, verbose=False)
        if device == 'cuda':
            torch.cuda.synchronize()
        logger.info("Warmup done")
    except Exception as exc:
        logger.warning("Warmup failed (non-fatal): %s", exc)

    try:
        import dxcam
        _use_dxcam = True
    except ImportError:
        _use_dxcam = False
    logger.info("Screen capture: %s", "dxcam (DirectX)" if _use_dxcam else "mss (fallback)")

    renderer_profile = None
    if pipeline is not None:
        try:
            rng = np.random.default_rng(0)
            raw = rng.integers(-10, 10, (256, 2), dtype=np.int16)
            renderer_profile = pipeline.prepare_renderer_profile(raw)
        except Exception as exc:
            logger.warning("Renderer profile prep failed: %s", exc)

    if fov_config:
        dpi  = float(fov_config.get('dpi', 400))
        sens = float(fov_config.get('sensitivity', 3.2554))
        fovH = float(fov_config.get('fovH', 106.26))
        sw   = float(fov_config.get('screenW', 2560))
    else:
        dpi, sens, fovH, sw = 400.0, 3.2554, 106.26, 2560.0
    cpp = (dpi / 400) / (sens * 0.022) * (fovH / sw)

    max_reps     = math.ceil(max_movement_ms / max(interval_ms, 0.5))
    last_fire    = 0.0
    frame_ts:    list  = []
    pos_history: deque = deque(maxlen=8)   # (time, px_x, px_y)
    crop         = 640

    # ── inner frame processor — shared by dxcam + mss paths ───────────────────
    def process_frame(frame: np.ndarray, cx_rel: int, cy_rel: int) -> None:
        nonlocal last_fire
        import torch as _torch

        with _torch.no_grad():
            results = model(frame, conf=confidence, iou=0.4, verbose=False)[0]

        boxes     = results.boxes
        best_px, best_dist = None, float('inf')
        if boxes is not None and len(boxes):
            for box in boxes.xyxy.cpu().numpy():
                bx   = (box[0] + box[2]) / 2
                by   = box[1] + (box[3] - box[1]) * aim_height
                dist = ((bx - cx_rel) ** 2 + (by - cy_rel) ** 2) ** 0.5
                if dist < best_dist:
                    best_dist, best_px = dist, (bx - cx_rel, by - cy_rel)

        now = time.time()

        if best_px:
            px_x, px_y = best_px

            # velocity tracking: weighted average of last 3 deltas (newest = highest weight)
            pos_history.append((now, px_x, px_y))
            vx = vy = 0.0
            n = len(pos_history)
            if n >= 3:
                w_vx, w_vy, total_w = 0.0, 0.0, 0.0
                for i in range(n - 1, max(n - 4, 0), -1):
                    dt = pos_history[i][0] - pos_history[i - 1][0]
                    if dt > 0.001:
                        w     = 2.0 ** (n - 1 - i)
                        w_vx += (pos_history[i][1] - pos_history[i - 1][1]) / dt * w
                        w_vy += (pos_history[i][2] - pos_history[i - 1][2]) / dt * w
                        total_w += w
                if total_w > 0:
                    vx, vy = w_vx / total_w, w_vy / total_w

            # target lead: project aim forward by lead_ms only when target is actually moving
            if lead_ms > 0 and (abs(vx) > 8 or abs(vy) > 8):
                px_x += vx * (lead_ms / 1000.0)
                px_y += vy * (lead_ms / 1000.0)

            with _det_lock:
                _det_state['last_px']  = [round(px_x, 1), round(px_y, 1)]
                _det_state['velocity'] = [round(vx, 1), round(vy, 1)]
            socketio.emit('detection_update', {
                'px_x': px_x, 'px_y': px_y,
                'dist': round(best_dist, 1),
                'vx':   round(vx, 1), 'vy': round(vy, 1),
            })

            if (now - last_fire) * 1000 >= cooldown_ms and pipeline is not None and serial_mgr.is_connected:
                cx_c = round(px_x * cpp)
                cy_c = round(px_y * cpp)
                try:
                    rng2    = np.random.default_rng(int(now * 1000) & 0xFFFF)
                    prefix  = rng2.standard_normal((20, 2)).astype(np.float32) * 2
                    reports = pipeline.generate(
                        prefix,
                        renderer_profile=renderer_profile,
                        target_rel_at_B=(cx_c, cy_c),
                        target_radius=target_radius,
                        progress_center=progress_center,
                        seed=int(now * 1000) % 10000,
                    ).tolist()[:max_reps]
                    if reports:
                        serial_mgr.send_reports(reports, interval_ms, on_progress=lambda s, t: None)
                        last_fire = now
                        with _det_lock:
                            _det_state['hits'] += 1

                        # recoil control: push mouse down after movement to counter upward camera kick
                        # rcs_strength 0-1; ~4 counts per shot at full strength
                        if rcs_strength > 0:
                            rcs_counts = round(4.0 * rcs_strength)
                            if rcs_counts > 0:
                                _delay = max_movement_ms / 1000.0 * 0.8
                                def _do_rcs(c=rcs_counts, d=_delay):
                                    time.sleep(d)
                                    serial_mgr.send_single(0, c)
                                threading.Thread(target=_do_rcs, daemon=True).start()
                except Exception as exc:
                    logger.debug("Auto-fire error: %s", exc)
        else:
            with _det_lock:
                _det_state['last_px']  = None
                _det_state['velocity'] = None
            pos_history.clear()

    # ── capture + inference loop ───────────────────────────────────────────────
    try:
        if _use_dxcam:
            import ctypes, dxcam as _dxcam
            mw = ctypes.windll.user32.GetSystemMetrics(0)
            mh = ctypes.windll.user32.GetSystemMetrics(1)
            region = (mw // 2 - crop // 2, mh // 2 - crop // 2,
                      mw // 2 + crop // 2, mh // 2 + crop // 2)
            cx_rel = cy_rel = crop // 2
            cam = _dxcam.create(output_color="BGR")
            import mss as _mss_seed
            with _mss_seed.MSS() as _sct:
                _mon = _sct.monitors[1]
                _seed_cap = {
                    'left': _mon['left'] + mw // 2 - crop // 2,
                    'top':  _mon['top']  + mh // 2 - crop // 2,
                    'width': crop, 'height': crop,
                }
                last_frame = np.array(_sct.grab(_seed_cap))[:, :, :3]

            while True:
                with _det_lock:
                    if not _det_state['running']:
                        break
                t0 = time.time()
                grabbed = cam.grab(region=region)
                if grabbed is not None:
                    last_frame = grabbed
                process_frame(last_frame, cx_rel, cy_rel)

                elapsed = time.time() - t0
                frame_ts.append(elapsed)
                if len(frame_ts) > 30:
                    frame_ts.pop(0)
                with _det_lock:
                    _det_state['fps'] = round(1.0 / (sum(frame_ts) / len(frame_ts)), 1) if frame_ts else 0.0

            del cam
        else:
            import mss as _mss_mod
            with _mss_mod.MSS() as sct:
                mon  = sct.monitors[1]
                mw, mh = mon['width'], mon['height']
                cap  = {
                    'left':   mon['left'] + mw // 2 - crop // 2,
                    'top':    mon['top']  + mh // 2 - crop // 2,
                    'width':  crop, 'height': crop,
                }
                cx_rel = cy_rel = crop // 2
                while True:
                    with _det_lock:
                        if not _det_state['running']:
                            break
                    t0 = time.time()
                    frame = np.array(sct.grab(cap))[:, :, :3]
                    process_frame(frame, cx_rel, cy_rel)

                    elapsed = time.time() - t0
                    frame_ts.append(elapsed)
                    if len(frame_ts) > 30:
                        frame_ts.pop(0)
                    with _det_lock:
                        _det_state['fps'] = round(1.0 / (sum(frame_ts) / len(frame_ts)), 1) if frame_ts else 0.0

    except Exception as exc:
        msg = f"Detection loop crashed: {exc}"
        logger.error(msg, exc_info=True)
        with _det_lock:
            _det_state['running']    = False
            _det_state['last_error'] = msg

    with _det_lock:
        _det_state['running'] = False
        _det_state['thread']  = None
    logger.info("Detection loop stopped")


@app.route('/api/detection/modes')
def detection_modes_route():
    return jsonify(AIM_MODES)


@app.route('/api/detection/last-error')
def detection_last_error():
    with _det_lock:
        return jsonify({'error': _det_state.get('last_error')})


@app.route('/api/detection/start', methods=['POST'])
def detection_start():
    with _det_lock:
        if _det_state['running']:
            return jsonify({'ok': False, 'error': 'Already running'})
    d      = request.json or {}
    mode   = d.get('mode', 'track')
    preset = AIM_MODES.get(mode, AIM_MODES['track']).copy()

    classes         = d.get('classes',         ['person', 'head'])
    confidence      = float(d.get('confidence',      0.25))
    cooldown_ms     = float(d.get('cooldown_ms',     preset['cooldown_ms']))
    fov_config      = d.get('fov_config')
    max_mvmt_ms     = float(d.get('max_movement_ms', preset['max_movement_ms']))
    interval_ms     = float(d.get('interval_ms',     preset['interval_ms']))
    aim_height      = float(d.get('aim_height',      preset['aim_height']))
    lead_ms         = float(d.get('lead_ms',         0.0))
    rcs_strength    = float(d.get('rcs_strength',    0.0))
    target_radius   = float(d.get('target_radius',   preset['target_radius']))
    progress_center = float(d.get('progress_center', preset['progress_center']))

    with _det_lock:
        _det_state.update({
            'running': True, 'hits': 0, 'fps': 0.0,
            'last_px': None, 'velocity': None,
            'classes': classes, 'mode': mode,
            'config': {
                'mode': mode, 'confidence': confidence, 'cooldown_ms': cooldown_ms,
                'max_movement_ms': max_mvmt_ms, 'interval_ms': interval_ms,
                'aim_height': aim_height, 'lead_ms': lead_ms,
                'rcs_strength': rcs_strength, 'target_radius': target_radius,
                'progress_center': progress_center,
            },
            'last_error': None,
        })
    t = threading.Thread(
        target=_run_detection,
        args=(classes, confidence, cooldown_ms, fov_config,
              max_mvmt_ms, interval_ms, aim_height, mode,
              lead_ms, rcs_strength, target_radius, progress_center),
        daemon=True,
    )
    with _det_lock:
        _det_state['thread'] = t
    t.start()
    return jsonify({'ok': True, 'classes': classes, 'mode': mode})


@app.route('/api/detection/stop', methods=['POST'])
def detection_stop():
    with _det_lock:
        _det_state['running'] = False
    return jsonify({'ok': True})


@app.route('/api/detection/status')
def detection_status():
    with _det_lock:
        return jsonify({
            'running':  _det_state['running'],
            'fps':      _det_state['fps'],
            'hits':     _det_state['hits'],
            'last_px':  _det_state['last_px'],
            'velocity': _det_state['velocity'],
            'mode':     _det_state['mode'],
            'config':   _det_state['config'],
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
            # Emit every 10 reports (smooth progress for 256-report sequences) + always on last
            if sent % 10 == 0 or sent == total:
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


@app.route('/api/serial/test', methods=['POST'])
def serial_test():
    """Send a tiny jog (5 right, then 5 left) to physically verify the MAKCU responds."""
    if not serial_mgr.is_connected:
        return jsonify({'ok': False, 'error': 'MAKCU not connected'}), 400
    d = request.json or {}
    jog = int(d.get('jog', 5))
    r1 = serial_mgr.send_single(jog, 0)
    if not r1['ok']:
        return jsonify({'ok': False, 'error': f'Send failed: {r1.get("error", "unknown")}'})
    time.sleep(0.025)
    r2 = serial_mgr.send_single(-jog, 0)
    ok = r1['ok'] and r2['ok']
    return jsonify({'ok': ok, 'message': 'Test jog sent — cursor moved right then left', 'error': r2.get('error')})


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

_training_config = {
    'planner':  {'epochs': 100, 'batch_size': 32, 'learning_rate': 0.001, 'heads': 16},
    'renderer': {'epochs': 50,  'batch_size': 64,  'learning_rate': 0.0005, 'hidden_size': 128},
}

@app.route('/api/training/config', methods=['GET', 'POST'])
def training_config():
    global _training_config
    if request.method == 'GET':
        return jsonify(_training_config)
    payload = request.json or {}
    # Accept either a full wrapper {"planner":{...},"renderer":{...}} or a single model dict
    if 'planner' in payload or 'renderer' in payload:
        _training_config.update(payload)
    else:
        # Single-model update: merge into whichever key the caller intends
        for key in ('planner', 'renderer'):
            if any(k in payload for k in _training_config.get(key, {})):
                _training_config[key].update(payload)
                break
    return jsonify({'success': True, 'config': _training_config})


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
