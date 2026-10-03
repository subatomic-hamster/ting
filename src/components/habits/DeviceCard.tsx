import { BRIDGE_URL } from '../../habits/bridge';
import { useHabitStore } from '../../habits/store';
import type { DeviceKind } from '../../habits/types';

const OPTIONS: { kind: DeviceKind; title: string; detail: string; command?: string }[] = [
  {
    kind: 'simulated',
    title: 'Simulated brush',
    detail: 'For the demo: plays a 2-minute session at 10x speed.',
  },
  {
    kind: 'oralb',
    title: 'Oral-B smart brush (Bluetooth)',
    detail: 'Smart, Genius and iO brushes broadcast their state. The Ting bridge on this laptop listens; no pairing needed.',
    command: 'python hardware/bridge/ting_bridge.py --oralb',
  },
  {
    kind: 'esp32',
    title: 'DIY clip (ESP32 + motion sensor)',
    detail: 'Clips onto any toothbrush and posts sessions to the bridge over Wi-Fi.',
    command: 'python hardware/bridge/ting_bridge.py --host 0.0.0.0',
  },
];

const STATUS: Record<string, string> = {
  connected: 'bg-green-50 text-save border-green-200',
  connecting: 'bg-amber-50 text-warn border-amber-200',
  error: 'bg-red-50 text-cost border-red-200',
  disconnected: 'bg-slate-50 text-muted border-line',
};

export function DeviceCard() {
  const device = useHabitStore((s) => s.device);
  const connect = useHabitStore((s) => s.connect);
  const disconnect = useHabitStore((s) => s.disconnect);
  const brushNow = useHabitStore((s) => s.brushNow);
  const bridgeMode = useHabitStore((s) => s.bridgeMode);
  const viaBridge = device.kind === 'oralb' || device.kind === 'esp32';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[device.status]}`}>{device.status}</span>
        <span className="text-muted">{device.name ?? 'No device connected'}</span>
        {viaBridge && bridgeMode.length > 0 && <span className="text-xs text-muted">bridge: {bridgeMode.join(', ')}</span>}
      </div>

      <fieldset className="space-y-2">
        <legend className="sr-only">Brush to connect</legend>
        {OPTIONS.map((o) => {
          const selected = device.kind === o.kind;
          return (
            <div key={o.kind} className={`rounded-xl border p-3 ${selected ? 'border-brand-500 bg-brand-50' : 'border-line'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{o.title}</p>
                  <p className="text-sm text-muted">{o.detail}</p>
                  {o.command && (
                    <code className="mt-1 block overflow-x-auto rounded bg-slate-100 px-2 py-1 text-xs">{o.command}</code>
                  )}
                </div>
                {selected ? (
                  <button type="button" className="btn-ghost" onClick={disconnect}>
                    Disconnect
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={() => connect(o.kind)}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      {device.error && <p className="text-sm text-cost">{device.error}</p>}
      {viaBridge && (
        <p className="text-xs text-muted">
          Listening to {BRIDGE_URL}. Brush with the real device, or test the full path with a bridge started with <code>--simulate</code>.
        </p>
      )}
      <button type="button" className="btn-primary" onClick={brushNow} disabled={device.status === 'connecting'}>
        {viaBridge ? 'Test with bridge simulator' : 'Brush now'}
      </button>
    </div>
  );
}
