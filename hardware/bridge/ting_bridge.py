#!/usr/bin/env python3
"""Ting device bridge: physical toothbrushes -> the Ting web app.

The browser can't read Bluetooth advertisements reliably, so this small local
service does it and re-publishes brushing data as Server-Sent Events that the
web app subscribes to (VITE_BRIDGE_URL, default http://localhost:8787).

Sources (any combination):
  --oralb      Scan for Oral-B Smart/Genius/iO brushes. They broadcast their state
               in BLE manufacturer data (company 0x00DC), so no pairing is needed.
  --simulate   No hardware: POST /simulate/start plays a compressed 2-minute session.
  (always on)  POST /live and POST /sessions accept data from DIY devices such as
               the ESP32 sketch in ../esp32-brush/.

Endpoints:
  GET  /health            bridge status and devices seen
  GET  /events            SSE stream of {"type": "brush.live" | "brush.session" | "bridge.status", ...}
  POST /live              one live reading   (LiveBrushState JSON)
  POST /sessions          one finished session (BrushSession JSON)
  POST /simulate/start    start a simulated session (only with --simulate)

Privacy: the bridge keeps nothing on disk. It only forwards to the local web app.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from aiohttp import web

log = logging.getLogger("ting-bridge")

# --- Oral-B advertisement decoding ------------------------------------------
# Byte layout follows the MIT-licensed oralb-ble parser used by Home Assistant
# (https://github.com/Bluetooth-Devices/oralb-ble):
#   [1] model  [3] state  [4] pressure/status bit field  [5..6] brush time (m, s)
#   [7] mode   [8] sector [9] sector timer (11-byte form) [10] sector count

ORALB_MANUFACTURER = 0x00DC

STATES = {
    0: "unknown", 1: "initializing", 2: "idle", 3: "running", 4: "charging", 5: "setup",
    6: "flight menu", 8: "selection menu", 9: "off", 10: "post brushing statistics",
    113: "final test", 114: "pcb test", 115: "sleeping", 116: "transport",
}

MODEL_NAMES = {
    0: "Triumph D36", 1: "Triumph D36", 2: "Triumph D36",
    32: "Genius D701", 33: "Genius D701", 34: "Genius D701",
    39: "Smart Series D700", 40: "Smart Series D700", 41: "Smart Series D700",
    48: "iO Series", 49: "iO Series", 50: "iO Series", 52: "iO Series 4", 53: "iO Series 5", 54: "iO Series",
    112: "Genius X D706", 113: "Genius X D706", 114: "Genius X D706",
}


def decode_oralb(data: bytes) -> dict | None:
    """Decode Oral-B manufacturer data. Returns None for unsupported payloads."""
    if len(data) not in (9, 11):
        return None
    state_code = data[3]
    pressure = data[4]
    sector_count = (data[10] & 0x07) if len(data) == 11 else 4
    sector_count = sector_count or 4
    quadrant = data[8] & 0x07
    if quadrant == 7:  # "last sector" sentinel
        quadrant = sector_count
    state = STATES.get(state_code, f"unknown state {state_code}")
    return {
        "model": MODEL_NAMES.get(data[1], "Oral-B brush"),
        "state": state,
        "running": state_code == 3,
        # Button flags take precedence over the high-pressure bit (bit 7).
        "pressureHigh": bool(pressure & 0x80) and not (pressure & 0x0C),
        "elapsedSec": data[5] * 60 + data[6],
        "mode": data[7],
        "sector": quadrant if state_code == 3 else 0,
        "sectorCount": sector_count,
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


# --- session tracking ---------------------------------------------------------


@dataclass
class SessionTracker:
    """Turns a stream of live readings from one brush into finished sessions."""

    device_id: str
    device_name: str
    source: str
    min_session_sec: int = 10
    max_gap_sec: float = 5.0  # gaps longer than this (radio dropouts) aren't credited
    running: bool = False
    started_at: str = ""
    last_elapsed: int = 0
    last_sector: int = 0
    last_ts: float = 0.0
    sector_count: int = 4
    sector_seconds: list[float] = field(default_factory=list)
    pressure_warnings: int = 0
    pressure_was_high: bool = False
    samples: int = 0

    def update(self, reading: dict, ts: float | None = None) -> dict | None:
        """Feed one reading; returns a finished BrushSession dict when a session ends."""
        ts = time.monotonic() if ts is None else ts
        if reading["running"]:
            if not self.running:
                self._start(reading, ts)
            else:
                self._credit(ts)
            if reading["pressureHigh"] and not self.pressure_was_high:
                self.pressure_warnings += 1
            self.pressure_was_high = reading["pressureHigh"]
            self.last_elapsed = max(self.last_elapsed, int(reading["elapsedSec"]))
            self.last_sector = int(reading["sector"])
            self.last_ts = ts
            self.samples += 1
            return None
        if not self.running:
            return None
        self._credit(ts)
        return self.finish()

    def _credit(self, ts: float) -> None:
        """Credit the time since the last sample to the sector we were in."""
        dt = max(0.0, min(ts - self.last_ts, self.max_gap_sec))
        if 1 <= self.last_sector <= self.sector_count:
            self.sector_seconds[self.last_sector - 1] += dt

    def timed_out(self, ts: float, after_sec: float = 6.0) -> dict | None:
        """End a session if the brush stopped advertising (out of range, battery)."""
        if self.running and ts - self.last_ts > after_sec:
            return self.finish()
        return None

    def _start(self, reading: dict, ts: float) -> None:
        self.running = True
        self.started_at = now_iso()
        self.sector_count = int(reading.get("sectorCount") or 4)
        self.sector_seconds = [0.0] * self.sector_count
        self.pressure_warnings = 0
        self.pressure_was_high = False
        self.samples = 0
        self.last_elapsed = int(reading["elapsedSec"])
        self.last_sector = int(reading["sector"])
        self.last_ts = ts

    def finish(self) -> dict | None:
        self.running = False
        duration = self.last_elapsed or int(sum(self.sector_seconds))
        if duration < self.min_session_sec:
            return None
        return {
            "id": f"s-{uuid.uuid4().hex[:10]}",
            "deviceId": self.device_id,
            "source": self.source,
            "startedAt": self.started_at,
            "durationSec": duration,
            "sectorCount": self.sector_count,
            "sectorSeconds": [round(s) for s in self.sector_seconds],
            "pressureWarnings": self.pressure_warnings,
            "liveSamples": self.samples,
        }


# --- event hub (SSE fan-out) -----------------------------------------------------


class Hub:
    def __init__(self) -> None:
        self.queues: set[asyncio.Queue] = set()
        self.devices: dict[str, dict] = {}

    def publish(self, event: dict) -> None:
        for q in list(self.queues):
            if q.qsize() < 500:
                q.put_nowait(event)

    def live(self, device_id: str, name: str, source: str, reading: dict) -> None:
        self.devices[device_id] = {"name": name, "source": source, "lastSeen": now_iso()}
        self.publish({
            "type": "brush.live",
            "live": {
                "deviceId": device_id,
                "deviceName": name,
                "source": source,
                "state": reading["state"] if reading["state"] in ("running", "idle", "off", "charging") else "unknown",
                "elapsedSec": int(reading["elapsedSec"]),
                "sector": int(reading["sector"]),
                "sectorCount": int(reading["sectorCount"]),
                "pressureHigh": bool(reading["pressureHigh"]),
                "mode": str(reading.get("mode", "")),
                "ts": now_iso(),
            },
        })

    def session(self, session: dict) -> None:
        log.info("session %s: %ss from %s", session["id"], session["durationSec"], session["deviceId"])
        self.publish({"type": "brush.session", "session": session})


# --- sources ---------------------------------------------------------------------


async def run_oralb_scanner(hub: Hub) -> None:
    try:
        from bleak import BleakScanner
    except ImportError:
        log.error("bleak is not installed: pip install -r requirements.txt")
        return

    trackers: dict[str, SessionTracker] = {}

    def on_advertisement(device, adv) -> None:
        data = adv.manufacturer_data.get(ORALB_MANUFACTURER)
        if not data:
            return
        reading = decode_oralb(bytes(data))
        if not reading:
            return
        name = f"Oral-B {reading['model']}"
        tracker = trackers.setdefault(device.address, SessionTracker(device.address, name, "oralb-ble"))
        hub.live(device.address, name, "oralb-ble", reading)
        finished = tracker.update(reading)
        if finished:
            hub.session(finished)

    scanner = BleakScanner(detection_callback=on_advertisement)
    await scanner.start()
    log.info("scanning for Oral-B brushes (manufacturer 0x%04X)", ORALB_MANUFACTURER)
    try:
        while True:
            await asyncio.sleep(1.0)
            ts = time.monotonic()
            for t in trackers.values():
                finished = t.timed_out(ts)
                if finished:
                    hub.session(finished)
    finally:
        await scanner.stop()


async def simulate_session(hub: Hub, duration: int = 120, speed: float = 10.0, sectors: int = 4) -> None:
    """Plays a brushing session at `speed`x real time (120 s at 10x = 12 s on stage)."""
    device_id, name = "sim-brush-01", "Simulated smart brush"
    tick = 0.25
    tracker = SessionTracker(device_id, name, "simulated", max_gap_sec=tick * speed + 1)
    elapsed = 0.0
    pressure_until = -1.0
    burst_at = random.uniform(duration * 0.3, duration * 0.7)
    clock = 0.0
    while elapsed < duration:
        if pressure_until < 0 and elapsed >= burst_at:
            pressure_until = elapsed + 4
        sector = min(sectors, int(elapsed / (duration / sectors)) + 1)
        reading = {
            "state": "running", "running": True, "elapsedSec": int(elapsed), "sector": sector,
            "sectorCount": sectors, "pressureHigh": 0 <= elapsed < pressure_until, "mode": "daily clean",
        }
        hub.live(device_id, name, "simulated", reading)
        tracker.update(reading, ts=clock)
        await asyncio.sleep(tick)
        elapsed += tick * speed
        clock += tick * speed
    stop = {"state": "idle", "running": False, "elapsedSec": duration, "sector": 0, "sectorCount": sectors,
            "pressureHigh": False, "mode": "daily clean"}
    tracker.last_elapsed = duration
    hub.live(device_id, name, "simulated", stop)
    finished = tracker.update(stop, ts=clock)
    if finished:
        hub.session(finished)


# --- HTTP ----------------------------------------------------------------------------

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers=CORS)
    response = await handler(request)
    response.headers.update(CORS)
    return response


def validate_session(body: dict) -> dict:
    required = {"deviceId": str, "durationSec": (int, float), "sectorCount": int, "sectorSeconds": list}
    for key, typ in required.items():
        if not isinstance(body.get(key), typ):
            raise web.HTTPBadRequest(text=f"missing or invalid field: {key}")
    if not 0 < body["durationSec"] < 30 * 60:
        raise web.HTTPBadRequest(text="durationSec out of range")
    if len(body["sectorSeconds"]) != body["sectorCount"]:
        raise web.HTTPBadRequest(text="sectorSeconds length must equal sectorCount")
    return {
        "id": str(body.get("id") or f"s-{uuid.uuid4().hex[:10]}"),
        "deviceId": body["deviceId"],
        "source": str(body.get("source") or "esp32"),
        "startedAt": str(body.get("startedAt") or now_iso()),
        "durationSec": int(body["durationSec"]),
        "sectorCount": int(body["sectorCount"]),
        "sectorSeconds": [int(x) for x in body["sectorSeconds"]],
        "pressureWarnings": int(body.get("pressureWarnings") or 0),
        "liveSamples": int(body.get("liveSamples") or 0),
    }


def make_app(hub: Hub, mode: list[str], simulate: bool) -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    sim_task: dict[str, asyncio.Task | None] = {"task": None}

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"ok": True, "mode": mode, "devices": hub.devices, "time": now_iso()})

    async def events(request: web.Request) -> web.StreamResponse:
        resp = web.StreamResponse(headers={
            **CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive",
        })
        await resp.prepare(request)
        queue: asyncio.Queue = asyncio.Queue()
        hub.queues.add(queue)
        try:
            hello = {"type": "bridge.status", "mode": mode, "devices": list(hub.devices)}
            await resp.write(f"data: {json.dumps(hello)}\n\n".encode())
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    await resp.write(f"data: {json.dumps(event)}\n\n".encode())
                except asyncio.TimeoutError:
                    await resp.write(b": keepalive\n\n")
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            hub.queues.discard(queue)
        return resp

    async def post_live(request: web.Request) -> web.Response:
        body = await request.json()
        try:
            reading = {
                "state": str(body.get("state", "running")),
                "running": body.get("state", "running") == "running",
                "elapsedSec": int(body["elapsedSec"]),
                "sector": int(body.get("sector", 0)),
                "sectorCount": int(body.get("sectorCount", 4)),
                "pressureHigh": bool(body.get("pressureHigh", False)),
                "mode": str(body.get("mode", "")),
            }
        except (KeyError, TypeError, ValueError):
            raise web.HTTPBadRequest(text="live reading needs elapsedSec") from None
        device_id = str(body.get("deviceId") or "diy-device")
        hub.live(device_id, str(body.get("deviceName") or device_id), str(body.get("source") or "esp32"), reading)
        return web.json_response({"ok": True})

    async def post_session(request: web.Request) -> web.Response:
        session = validate_session(await request.json())
        hub.session(session)
        return web.json_response({"ok": True, "id": session["id"]})

    async def simulate_start(request: web.Request) -> web.Response:
        if not simulate:
            raise web.HTTPNotFound(text="start the bridge with --simulate")
        if sim_task["task"] and not sim_task["task"].done():
            return web.json_response({"ok": False, "reason": "a session is already running"}, status=409)
        speed = float(request.query.get("speed", "10"))
        sim_task["task"] = asyncio.create_task(simulate_session(hub, speed=speed))
        return web.json_response({"ok": True, "speed": speed})

    app.add_routes([
        web.get("/health", health),
        web.get("/events", events),
        web.post("/live", post_live),
        web.post("/sessions", post_session),
        web.post("/simulate/start", simulate_start),
    ])
    return app


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--oralb", action="store_true", help="scan for Oral-B brushes over Bluetooth LE")
    parser.add_argument("--simulate", action="store_true", help="enable POST /simulate/start (no hardware)")
    parser.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 so an ESP32 on the same Wi-Fi can reach it")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(asctime)s %(message)s")

    mode = [m for m, on in (("oralb", args.oralb), ("simulate", args.simulate)) if on] + ["http-ingest"]
    hub = Hub()
    runner = web.AppRunner(make_app(hub, mode, args.simulate))
    await runner.setup()
    await web.TCPSite(runner, args.host, args.port).start()
    log.info("Ting bridge on http://%s:%d  mode=%s", args.host, args.port, ",".join(mode))

    tasks = [asyncio.create_task(run_oralb_scanner(hub))] if args.oralb else []
    try:
        await asyncio.Event().wait()
    finally:
        for t in tasks:
            t.cancel()
        await runner.cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
