"""MAKCU serial port manager.

Handles connecting to the MAKCU device, sending mouse movement
reports, and streaming real-time TX stats back to the frontend.

Supported protocols
-------------------
makcu     : km.move(x,y)\\r\\n  — official MAKCU Native API (v3.2 / v3.7 firmware)
text      : "M {dx} {dy}\\n"   — generic Arduino / Pico text firmwares
ch9329    : 8-byte binary CH9329 packet
raw_binary: 4-byte little-endian int16 pairs [dx, dy] per report
"""

import struct
import threading
import time
import logging
from dataclasses import dataclass, field
from typing import Optional

import serial
import serial.tools.list_ports

logger = logging.getLogger(__name__)

# Binary frame that switches a MAKCU device from 115200 → 4 Mbaud
# Format: DE AD | payload_len(u16-LE) | cmd=0xA5 | baud(u32-LE=4000000=0x003D0900)
MAKCU_BAUD_CHANGE_FRAME = bytes([0xDE, 0xAD, 0x05, 0x00, 0xA5, 0x00, 0x09, 0x3D, 0x00])
MAKCU_OPERATING_BAUD = 4_000_000


# ── CH9329 constants ──────────────────────────────────────────────────────────
CH9329_HEAD = 0x57
CH9329_ADDR = 0xAB
CH9329_CMD_MOUSE_REL = 0x05


def _ch9329_packet(dx: int, dy: int) -> bytes:
    """Build an 8-byte CH9329 relative-mouse packet."""
    dx_b = struct.pack("<h", max(-127, min(127, dx)))[0]
    dy_b = struct.pack("<h", max(-127, min(127, dy)))[0]
    data = bytes([0x00, dx_b, dy_b, 0x00])   # buttons, X, Y, wheel
    length = len(data)
    checksum = (CH9329_HEAD + CH9329_ADDR + CH9329_CMD_MOUSE_REL + length
                + sum(data)) & 0xFF
    return bytes([CH9329_HEAD, CH9329_ADDR, CH9329_CMD_MOUSE_REL,
                  length, *data, checksum])


def _makcu_packet(dx: int, dy: int) -> bytes:
    """Official MAKCU Native API: km.move(x,y)\r\n  Range: -32767..+32767."""
    dx = max(-32767, min(32767, dx))
    dy = max(-32767, min(32767, dy))
    return f"km.move({dx},{dy})\r\n".encode()


def _text_packet(dx: int, dy: int) -> bytes:
    return f"M {dx} {dy}\n".encode()


def _raw_packet(dx: int, dy: int) -> bytes:
    return struct.pack("<hh", dx, dy)


PROTOCOLS = {
    "makcu":      _makcu_packet,
    "text":       _text_packet,
    "ch9329":     _ch9329_packet,
    "raw_binary": _raw_packet,
}


@dataclass
class SerialStats:
    bytes_sent: int = 0
    reports_sent: int = 0
    errors: int = 0
    start_time: float = field(default_factory=time.time)

    def rate_bps(self) -> float:
        elapsed = time.time() - self.start_time or 1e-9
        return self.bytes_sent / elapsed

    def to_dict(self) -> dict:
        return {
            "bytes_sent":   self.bytes_sent,
            "reports_sent": self.reports_sent,
            "errors":       self.errors,
            "rate_bps":     round(self.rate_bps(), 1),
        }


class SerialManager:
    def __init__(self) -> None:
        self._port: Optional[serial.Serial] = None
        self._lock = threading.Lock()
        self._stats = SerialStats()
        self._protocol: str = "text"
        self._port_name: str = ""
        self._baud: int = 115200
        self._macro_events: list[dict] = []

    # ── port enumeration ──────────────────────────────────────────────────────

    @staticmethod
    def list_ports() -> list[dict]:
        ports = []
        for p in serial.tools.list_ports.comports():
            ports.append({
                "device":       p.device,
                "description":  p.description,
                "hwid":         p.hwid,
                "vid":          p.vid,
                "pid":          p.pid,
                "manufacturer": p.manufacturer or "",
                "serial_number": p.serial_number or "",
                # Best-guess: flag likely MAKCU / HID-bridge chips
                "likely_makcu": _is_likely_makcu(p),
            })
        return ports

    # ── connection ────────────────────────────────────────────────────────────

    def connect(self, port: str, baud: int = 115200,
                protocol: str = "text") -> dict:
        with self._lock:
            if self._port and self._port.is_open:
                self._port.close()
            try:
                self._port = serial.Serial(port, baud,
                                           timeout=0.1, write_timeout=1.0)
                self._port_name = port
                self._baud = baud
                self._protocol = protocol
                self._stats = SerialStats()
                logger.info("Connected to %s @ %d baud (%s)", port, baud, protocol)
                return {"ok": True, "port": port, "baud": baud, "protocol": protocol}
            except serial.SerialException as exc:
                logger.error("Connect failed: %s", exc)
                return {"ok": False, "error": str(exc)}

    def connect_makcu(self, port: str) -> dict:
        """Full MAKCU baud-negotiation sequence (per official docs).

        1. Try 4 Mbaud — if km.version() returns km.MAKCU we're done.
        2. Else open at 115200, send the 9-byte baud-change frame, wait, reopen at 4 Mbaud.
        Sets protocol to 'makcu' on success.
        """
        with self._lock:
            if self._port and self._port.is_open:
                self._port.close()
            self._port = None

        def _try_at_baud(baud: int, flush_wait: float = 0) -> bool:
            try:
                s = serial.Serial(port, baud, timeout=0.5, write_timeout=1.0)
                if flush_wait:
                    time.sleep(flush_wait)
                    s.reset_input_buffer()
                s.write(b"km.version()\r\n")
                resp = b""
                deadline = time.time() + 0.5
                while time.time() < deadline:
                    resp += s.read(64)
                    if b"km.MAKCU" in resp:
                        with self._lock:
                            self._port = s
                            self._port_name = port
                            self._baud = baud
                            self._protocol = "makcu"
                            self._stats = SerialStats()
                        logger.info("MAKCU connected on %s @ %d baud", port, baud)
                        return True
                s.close()
            except serial.SerialException:
                pass
            return False

        # Step 1: try operating baud first (device may already be switched)
        if _try_at_baud(MAKCU_OPERATING_BAUD):
            return {"ok": True, "port": port, "baud": MAKCU_OPERATING_BAUD, "protocol": "makcu"}

        # Step 2: switch from default baud via binary frame
        try:
            s = serial.Serial(port, 115200, timeout=0.1, write_timeout=1.0)
            s.write(MAKCU_BAUD_CHANGE_FRAME)
            time.sleep(0.1)
            s.close()
        except serial.SerialException as exc:
            return {"ok": False, "error": f"Baud-change frame failed: {exc}"}

        if _try_at_baud(MAKCU_OPERATING_BAUD, flush_wait=0.05):
            return {"ok": True, "port": port, "baud": MAKCU_OPERATING_BAUD, "protocol": "makcu"}

        return {"ok": False, "error": "MAKCU not detected — check port and firmware version"}

    def disconnect(self) -> dict:
        with self._lock:
            if self._port and self._port.is_open:
                self._port.close()
                logger.info("Disconnected from %s", self._port_name)
            self._port = None
            return {"ok": True}

    @property
    def is_connected(self) -> bool:
        return self._port is not None and self._port.is_open

    @property
    def status(self) -> dict:
        return {
            "connected":  self.is_connected,
            "port":       self._port_name if self.is_connected else "",
            "baud":       self._baud,
            "protocol":   self._protocol,
            "stats":      self._stats.to_dict(),
        }

    # ── transmission ─────────────────────────────────────────────────────────

    def send_reports(self, reports: list[list[int]],
                     report_interval_ms: float = 1.0,
                     on_progress=None) -> dict:
        """Send a sequence of [dx, dy] integer reports to the MAKCU.

        Args:
            reports:             List of [dx, dy] int16 pairs.
            report_interval_ms:  Spacing between reports (default 1 ms = 1 kHz).
            on_progress:         Optional callback(sent, total) per report.
        """
        if not self.is_connected:
            return {"ok": False, "error": "Not connected"}

        encoder = PROTOCOLS.get(self._protocol, _text_packet)
        sleep_s  = report_interval_ms / 1000.0
        errors   = 0

        with self._lock:
            for i, (dx, dy) in enumerate(reports):
                try:
                    pkt = encoder(int(dx), int(dy))
                    self._port.write(pkt)
                    self._stats.bytes_sent   += len(pkt)
                    self._stats.reports_sent += 1
                except serial.SerialException as exc:
                    logger.warning("TX error at report %d: %s", i, exc)
                    self._stats.errors += 1
                    errors += 1

                if on_progress:
                    on_progress(i + 1, len(reports))

                if sleep_s > 0:
                    time.sleep(sleep_s)

        return {
            "ok":           errors == 0,
            "reports_sent": len(reports),
            "errors":       errors,
            "stats":        self._stats.to_dict(),
        }

    def send_single(self, dx: int, dy: int) -> dict:
        """Send a single mouse-move report (for manual control / testing)."""
        if not self.is_connected:
            return {"ok": False, "error": "Not connected"}
        encoder = PROTOCOLS.get(self._protocol, _text_packet)
        try:
            with self._lock:
                pkt = encoder(int(dx), int(dy))
                self._port.write(pkt)
                self._stats.bytes_sent   += len(pkt)
                self._stats.reports_sent += 1
            return {"ok": True}
        except serial.SerialException as exc:
            self._stats.errors += 1
            return {"ok": False, "error": str(exc)}

    def click(self, button: str = "left") -> dict:
        """Send a mouse click (press + release)."""
        if not self.is_connected:
            return {"ok": False, "error": "Not connected"}
        try:
            with self._lock:
                if self._protocol == "makcu":
                    # Official MAKCU Native API: km.left(1)\r\n then km.left(0)\r\n
                    btn = {"left": "left", "right": "right", "middle": "middle"}.get(button, "left")
                    self._port.write(f"km.{btn}(1)\r\n".encode())
                    time.sleep(0.01)
                    self._port.write(f"km.{btn}(0)\r\n".encode())
                else:
                    cmd_map = {"left": "CL\n", "right": "CR\n", "middle": "CM\n"}
                    self._port.write(cmd_map.get(button, "CL\n").encode())
            return {"ok": True}
        except serial.SerialException as exc:
            return {"ok": False, "error": str(exc)}

    def reset_stats(self) -> None:
        self._stats = SerialStats()

    # ── reconnect ─────────────────────────────────────────────────────────────

    def reconnect(self) -> dict:
        """Re-connect using the last known port, baud rate, and protocol."""
        if not self._port_name:
            return {"ok": False, "error": "No previous connection — connect manually first"}
        return self.connect(self._port_name, self._baud, self._protocol)

    # ── macro replay ──────────────────────────────────────────────────────────

    def replay_macro_events(self, events: list[dict], on_progress=None) -> dict:
        """Replay a sequence of macro events through the connected port.

        Event shapes:
          {"type": "move",  "dx": int, "dy": int}
          {"type": "click", "button": "left"|"right"|"middle"}
          {"type": "pause", "ms": float}
        """
        if not self.is_connected:
            return {"ok": False, "error": "Not connected"}
        encoder = PROTOCOLS.get(self._protocol, _text_packet)
        errors = 0
        total = len(events)
        for i, ev in enumerate(events):
            etype = ev.get("type", "")
            try:
                if etype == "move":
                    pkt = encoder(int(ev.get("dx", 0)), int(ev.get("dy", 0)))
                    with self._lock:
                        self._port.write(pkt)
                        self._stats.bytes_sent += len(pkt)
                        self._stats.reports_sent += 1
                elif etype == "click":
                    btn = ev.get("button", "left")
                    with self._lock:
                        if self._protocol == "makcu":
                            b = {"left": "left", "right": "right", "middle": "middle"}.get(btn, "left")
                            self._port.write(f"km.{b}(1)\r\n".encode())
                            time.sleep(0.01)
                            self._port.write(f"km.{b}(0)\r\n".encode())
                        else:
                            cmd_map = {"left": "CL\n", "right": "CR\n", "middle": "CM\n"}
                            self._port.write(cmd_map.get(btn, "CL\n").encode())
                elif etype == "pause":
                    time.sleep(float(ev.get("ms", 50)) / 1000.0)
            except serial.SerialException as exc:
                logger.warning("Macro replay error at event %d: %s", i, exc)
                self._stats.errors += 1
                errors += 1
            if on_progress:
                on_progress(i + 1, total)
        return {"ok": errors == 0, "errors": errors, "events_replayed": total}


# ── helper ────────────────────────────────────────────────────────────────────

_MAKCU_VIDS = {0x1A86, 0x0483, 0x2341, 0x239A, 0x2E8A, 0x1209, 0x04B3}
_MAKCU_KEYWORDS = ("ch9329", "makcu", "hid", "usb serial", "uart", "pro micro",
                   "arduino", "pico", "rp2040", "cp2102", "ch340", "ft232")


def _is_likely_makcu(port_info) -> bool:
    if port_info.vid in _MAKCU_VIDS:
        return True
    desc = (port_info.description or "").lower()
    mfr  = (port_info.manufacturer or "").lower()
    return any(kw in desc or kw in mfr for kw in _MAKCU_KEYWORDS)
