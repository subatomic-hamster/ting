import { BRIDGE_URL } from "../../habits/bridge";
import { useHabitStore } from "../../habits/store";
import type { DeviceKind } from "../../habits/types";

const OPTIONS: { kind: DeviceKind; title: string; detail: string }[] = [
  {
    kind: "simulated",
    title: "Simulated brush (sample data)",
    detail: "No brush? Try the flow with a built-in simulated one.",
  },
  {
    kind: "oralb",
    title: "Oral-B smart brush",
    detail:
      "Compatible smart brushes connect through the local Bluetooth bridge.",
  },
  {
    kind: "esp32",
    title: "DIY clip",
    detail:
      "A motion sensor that clips onto any toothbrush and sends sessions over Wi-Fi.",
  },
];

const STATUS: Record<string, string> = {
  connected: "bg-save/10 text-save border-save/30",
  connecting: "bg-amber-50 text-warn border-amber-200",
  error: "bg-cost/10 text-cost border-cost/30",
  disconnected: "bg-paper text-muted border-line",
};

export function DeviceCard() {
  const device = useHabitStore((s) => s.device);
  const connect = useHabitStore((s) => s.connect);
  const disconnect = useHabitStore((s) => s.disconnect);
  const bridgeMode = useHabitStore((s) => s.bridgeMode);
  const viaBridge = device.kind === "oralb" || device.kind === "esp32";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[device.status]}`}
        >
          {device.status}
        </span>
        <span className="min-w-0 text-muted">
          {device.name ?? "No device connected"}
        </span>
        {viaBridge && bridgeMode.length > 0 && (
          <span className="text-xs text-muted">
            bridge: {bridgeMode.join(", ")}
          </span>
        )}
      </div>

      <fieldset className="min-w-0 divide-y divide-line rounded-xl border border-line">
        <legend className="sr-only">Brush to connect</legend>
        {OPTIONS.map((o) => {
          const selected = device.kind === o.kind;
          return (
            <div
              key={o.kind}
              className={`flex flex-col items-start justify-between gap-3 p-3 md:flex-row md:items-center ${selected ? "bg-brand-50" : ""}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{o.title}</p>
                <p className="text-xs text-muted">{o.detail}</p>
              </div>
              {selected ? (
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={disconnect}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => connect(o.kind)}
                >
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </fieldset>

      {device.error && <p className="text-sm text-cost">{device.error}</p>}
      {viaBridge && device.status === "connected" && (
        <p className="text-xs text-muted">
          Listening on {BRIDGE_URL}. Just brush.
        </p>
      )}
    </div>
  );
}
