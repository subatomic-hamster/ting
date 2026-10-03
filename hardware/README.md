# SmileStreak hardware

Brushing data reaches Ting through a small local **bridge**, because browsers can't reliably read Bluetooth advertisements. The web app subscribes to the bridge's Server-Sent Events at `VITE_BRIDGE_URL` (default `http://localhost:8787`).

```
Oral-B smart brush ──BLE advertisements──┐
DIY ESP32 clip ──────Wi-Fi HTTP POST────┤──► ting_bridge.py ──SSE /events──► Ting web app (/habits)
curl / anything else ──HTTP POST────────┘        (nothing stored on disk)
```

## 1. The bridge (`bridge/ting_bridge.py`)

```bash
cd hardware/bridge
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python ting_bridge.py --oralb            # real Oral-B brush over Bluetooth LE
python ting_bridge.py --simulate         # no hardware: POST /simulate/start plays a session
python ting_bridge.py --host 0.0.0.0     # let an ESP32 on the same Wi-Fi reach it
python -m unittest test_bridge.py        # decoder + session tracker tests (no Bluetooth needed)
```

In the app, open **SmileStreak → Your brush** and connect **Oral-B** or **DIY clip**. With `--simulate`, the **Test with bridge simulator** button runs the whole path without a brush.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Mode and devices seen |
| `GET /events` | SSE: `brush.live`, `brush.session`, `bridge.status` |
| `POST /live` | One live reading from a DIY device |
| `POST /sessions` | One finished session (validated) |
| `POST /simulate/start?speed=10` | Simulated session (only with `--simulate`) |

### Oral-B
Oral-B Smart, Genius and iO brushes broadcast their state in BLE manufacturer data (company `0x00DC`), so no pairing or app is needed. The decoder follows the MIT-licensed [oralb-ble](https://github.com/Bluetooth-Devices/oralb-ble) parser used by Home Assistant: state, pressure flags, brush time, mode, sector and sector count. The bridge turns those readings into sessions with per-sector seconds and pressure-warning counts.

**Status:** the decoder and session tracker are unit-tested against the documented byte layout, but **not yet tested with a physical brush**. Bring one to verify before the demo. Check that the model is in the supported list.

## 2. DIY clip (`esp32-brush/esp32-brush.ino`)

ESP32 + MPU-6050 accelerometer (+ optional force-sensitive resistor), clipped to any toothbrush:
- brushing is detected from motion variance
- the quadrant is estimated from the handle's tilt (approximate)
- pressure warnings come from the force sensor
- it posts `/live` every second and `/sessions` when you stop

Libraries: *Adafruit MPU6050*, *Adafruit Unified Sensor*. Set Wi-Fi and the bridge IP at the top of the sketch.

**Status: untested sketch.** It has not been flashed yet. Expect to tune `MOTION_THRESHOLD` and `PRESSURE_THRESHOLD` using the Serial output.

## Data shapes
`BrushSession` and `LiveBrushState` are defined in `src/habits/types.ts` and mirrored by the bridge. Any device can join by posting those shapes.
