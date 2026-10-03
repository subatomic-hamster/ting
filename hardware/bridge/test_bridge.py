"""Unit tests for the bridge's decoder and session tracker (no Bluetooth needed).

Run: python -m unittest test_bridge.py
"""

import unittest

from ting_bridge import SessionTracker, decode_oralb, validate_session


def adv(state=3, pressure=0, minutes=0, seconds=30, mode=0, sector=1, sector_count=4, model=53):
    # 11-byte form: [proto, model, ?, state, pressure, min, sec, mode, sector, sector_timer, sector_count]
    return bytes([2, model, 0, state, pressure, minutes, seconds, mode, sector, 0, sector_count])


class DecodeTests(unittest.TestCase):
    def test_running_payload(self):
        r = decode_oralb(adv(minutes=1, seconds=5, sector=3))
        self.assertTrue(r["running"])
        self.assertEqual(r["elapsedSec"], 65)
        self.assertEqual(r["sector"], 3)
        self.assertEqual(r["sectorCount"], 4)
        self.assertEqual(r["model"], "iO Series 5")

    def test_high_pressure_bit(self):
        self.assertTrue(decode_oralb(adv(pressure=0x90))["pressureHigh"])
        # A button press (bit 2) takes precedence over the pressure flag.
        self.assertFalse(decode_oralb(adv(pressure=0x96))["pressureHigh"])

    def test_idle_has_no_sector(self):
        r = decode_oralb(adv(state=2, sector=2))
        self.assertFalse(r["running"])
        self.assertEqual(r["sector"], 0)

    def test_last_sector_sentinel(self):
        self.assertEqual(decode_oralb(adv(sector=7, sector_count=6))["sector"], 6)

    def test_rejects_wrong_length(self):
        self.assertIsNone(decode_oralb(bytes(5)))

    def test_nine_byte_form_defaults_to_four_sectors(self):
        self.assertEqual(decode_oralb(adv()[:9])["sectorCount"], 4)


class TrackerTests(unittest.TestCase):
    def reading(self, running, elapsed, sector, pressure=False):
        return {"running": running, "elapsedSec": elapsed, "sector": sector, "sectorCount": 4, "pressureHigh": pressure,
                "state": "running" if running else "idle"}

    def test_session_from_readings(self):
        t = SessionTracker("aa:bb", "Oral-B", "oralb-ble")
        ts = 0.0
        for second in range(0, 121):
            sector = min(4, second // 30 + 1)
            pressure = 60 <= second < 63
            self.assertIsNone(t.update(self.reading(True, second, sector, pressure), ts=ts))
            ts += 1.0
        session = t.update(self.reading(False, 120, 0), ts=ts)
        self.assertIsNotNone(session)
        self.assertEqual(session["durationSec"], 120)
        self.assertEqual(session["pressureWarnings"], 1)
        self.assertEqual(len(session["sectorSeconds"]), 4)
        self.assertTrue(all(25 <= s <= 31 for s in session["sectorSeconds"]))
        self.assertEqual(session["liveSamples"], 121)

    def test_short_blip_is_dropped(self):
        t = SessionTracker("aa:bb", "Oral-B", "oralb-ble")
        t.update(self.reading(True, 0, 1), ts=0)
        t.update(self.reading(True, 3, 1), ts=3)
        self.assertIsNone(t.update(self.reading(False, 3, 0), ts=4))

    def test_timeout_ends_session(self):
        t = SessionTracker("aa:bb", "Oral-B", "oralb-ble")
        for s in range(0, 40):
            t.update(self.reading(True, s, 1 + s // 10), ts=float(s))
        self.assertIsNone(t.timed_out(42.0))
        self.assertIsNotNone(t.timed_out(50.0))


class ValidateTests(unittest.TestCase):
    def test_accepts_esp32_session(self):
        s = validate_session({"deviceId": "esp32-1", "durationSec": 118, "sectorCount": 4,
                              "sectorSeconds": [30, 28, 31, 29], "pressureWarnings": 2})
        self.assertEqual(s["source"], "esp32")

    def test_rejects_mismatched_sectors(self):
        from aiohttp import web
        with self.assertRaises(web.HTTPBadRequest):
            validate_session({"deviceId": "x", "durationSec": 60, "sectorCount": 4, "sectorSeconds": [1, 2]})


if __name__ == "__main__":
    unittest.main()
