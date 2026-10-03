// Ting DIY smart-brush clip: ESP32 + MPU-6050 (+ optional force sensor).
//
// Clip it to any toothbrush handle. It detects brushing from motion, estimates
// which quadrant you're brushing from the handle's tilt, counts pressure
// warnings from a force-sensitive resistor, and posts to the Ting bridge:
//   POST /live      every second while brushing
//   POST /sessions  when you stop
//
// UNTESTED PROTOTYPE: written for the codeLinc demo, not flashed on hardware yet.
// Thresholds need tuning on the real clip (see Serial output).
//
// Wiring: MPU-6050 SDA->GPIO21, SCL->GPIO22, VCC->3V3, GND->GND.
//         FSR (optional): 3V3 -> FSR -> GPIO34, plus 10k from GPIO34 to GND.
// Libraries: "Adafruit MPU6050" and "Adafruit Unified Sensor" (Library Manager).
// Start the bridge with:  python ting_bridge.py --host 0.0.0.0

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <Wire.h>

// ---- configure --------------------------------------------------------------
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* BRIDGE = "http://192.168.1.50:8787";  // the laptop running ting_bridge.py
const char* DEVICE_ID = "esp32-brush-01";

const float MOTION_THRESHOLD = 1.2;    // m/s^2 std-dev that counts as brushing
const unsigned long START_MS = 2000;   // motion needed before a session starts
const unsigned long STOP_MS = 5000;    // stillness that ends a session
const int FSR_PIN = 34;
const int PRESSURE_THRESHOLD = 2600;   // raw ADC (0-4095); set to 4096 to disable
// ------------------------------------------------------------------------------

Adafruit_MPU6050 mpu;

const int WINDOW = 25;  // 25 samples at 40 Hz = a 0.6 s window
float magnitudes[WINDOW];
int windowIndex = 0;

bool brushing = false;
unsigned long motionSince = 0, stillSince = 0, sessionStart = 0, lastLive = 0, lastSample = 0;
float sectorSeconds[4] = {0, 0, 0, 0};
int pressureWarnings = 0;
bool pressureHigh = false;
int liveSamples = 0;
int currentSector = 0;

float windowStdDev() {
  float mean = 0;
  for (int i = 0; i < WINDOW; i++) mean += magnitudes[i];
  mean /= WINDOW;
  float var = 0;
  for (int i = 0; i < WINDOW; i++) var += (magnitudes[i] - mean) * (magnitudes[i] - mean);
  return sqrt(var / WINDOW);
}

// Rough quadrant from gravity: bristles up vs down = upper vs lower jaw;
// handle tilted left vs right = which side. FDI order: 1 upper right,
// 2 upper left, 3 lower left, 4 lower right. Approximate by design.
int sectorFromTilt(const sensors_event_t& a) {
  bool upper = a.acceleration.z < 0;
  bool left = a.acceleration.y > 0;
  if (upper) return left ? 2 : 1;
  return left ? 3 : 4;
}

void postJson(const String& path, const String& body) {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(String(BRIDGE) + path);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code != 200) Serial.printf("POST %s -> %d\n", path.c_str(), code);
  http.end();
}

void sendLive(bool running) {
  unsigned long elapsed = running ? (millis() - sessionStart) / 1000 : 0;
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"deviceName\":\"DIY brush clip\",\"source\":\"esp32\"," +
                "\"state\":\"" + (running ? "running" : "idle") + "\",\"elapsedSec\":" + elapsed +
                ",\"sector\":" + (running ? currentSector : 0) + ",\"sectorCount\":4,\"pressureHigh\":" +
                (pressureHigh ? "true" : "false") + "}";
  postJson("/live", body);
}

void endSession() {
  brushing = false;
  unsigned long duration = (millis() - sessionStart - STOP_MS) / 1000;
  sendLive(false);
  if (duration < 10) return;  // ignore blips
  String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"source\":\"esp32\",\"durationSec\":" + duration +
                ",\"sectorCount\":4,\"sectorSeconds\":[" + (int)sectorSeconds[0] + "," + (int)sectorSeconds[1] + "," +
                (int)sectorSeconds[2] + "," + (int)sectorSeconds[3] + "],\"pressureWarnings\":" + pressureWarnings +
                ",\"liveSamples\":" + liveSamples + "}";
  postJson("/sessions", body);
  Serial.printf("session: %lus, warnings %d\n", duration, pressureWarnings);
}

void setup() {
  Serial.begin(115200);
  if (!mpu.begin()) {
    Serial.println("MPU-6050 not found; check wiring");
    while (true) delay(1000);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Wi-Fi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " connected" : " offline (will retry on POST)");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSample < 25) return;  // 40 Hz
  float dt = (now - lastSample) / 1000.0;
  lastSample = now;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  magnitudes[windowIndex] = sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.y * a.acceleration.y +
                                 a.acceleration.z * a.acceleration.z);
  windowIndex = (windowIndex + 1) % WINDOW;
  bool moving = windowStdDev() > MOTION_THRESHOLD;

  if (moving) {
    stillSince = 0;
    if (!motionSince) motionSince = now;
  } else {
    motionSince = 0;
    if (!stillSince) stillSince = now;
  }

  if (!brushing && motionSince && now - motionSince > START_MS) {
    brushing = true;
    sessionStart = motionSince;
    for (int i = 0; i < 4; i++) sectorSeconds[i] = 0;
    pressureWarnings = 0;
    liveSamples = 0;
    Serial.println("brushing started");
  }

  if (brushing) {
    currentSector = sectorFromTilt(a);
    if (moving) sectorSeconds[currentSector - 1] += dt;
    bool high = analogRead(FSR_PIN) > PRESSURE_THRESHOLD;
    if (high && !pressureHigh) pressureWarnings++;
    pressureHigh = high;
    if (now - lastLive > 1000) {
      lastLive = now;
      liveSamples++;
      sendLive(true);
    }
    if (stillSince && now - stillSince > STOP_MS) endSession();
  }
}
