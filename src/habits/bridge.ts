// Client for the local device bridge (hardware/bridge/ting_bridge.py), which reads
// Oral-B brushes over Bluetooth and accepts posts from DIY devices (ESP32).

import type { BridgeEvent } from './types';

export const BRIDGE_URL = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? 'http://localhost:8787';

export interface BridgeConnection {
  close: () => void;
}

export function connectBridge(handlers: {
  onEvent: (e: BridgeEvent) => void;
  onOpen: () => void;
  onError: (message: string) => void;
}): BridgeConnection {
  const source = new EventSource(`${BRIDGE_URL}/events`);
  source.onopen = () => handlers.onOpen();
  source.onerror = () =>
    handlers.onError(`Can't reach the device bridge at ${BRIDGE_URL}. Start it with: python hardware/bridge/ting_bridge.py --oralb`);
  source.onmessage = (msg) => {
    try {
      handlers.onEvent(JSON.parse(msg.data) as BridgeEvent);
    } catch {
      // Ignore malformed events.
    }
  };
  return { close: () => source.close() };
}

/** Ask a bridge started with --simulate to play a session (for testing the full path). */
export async function startBridgeSimulation(speed = 10): Promise<void> {
  const res = await fetch(`${BRIDGE_URL}/simulate/start?speed=${speed}`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
}
