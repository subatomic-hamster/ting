import { useHabitStore } from "../../habits/store";

const BRIDGE_COMMANDS: { label: string; command: string }[] = [
  {
    label: "Oral-B over Bluetooth",
    command: "python hardware/bridge/ting_bridge.py --oralb",
  },
  {
    label: "DIY clip over Wi-Fi",
    command: "python hardware/bridge/ting_bridge.py --host 0.0.0.0",
  },
  {
    label: "No hardware",
    command: "python hardware/bridge/ting_bridge.py --simulate",
  },
];

/** SmileStreak's demo-only controls, kept out of the member's page. Mounted in the demo panel. */
export function HabitsDemoControls() {
  const device = useHabitStore((s) => s.device);
  const connect = useHabitStore((s) => s.connect);
  const brushNow = useHabitStore((s) => s.brushNow);
  const brushing = useHabitStore((s) => s.live?.state === "running");
  const dentistCheck = useHabitStore((s) => s.dentistCheck);
  const setDentistCheck = useHabitStore((s) => s.setDentistCheck);
  const viaBridge = device.kind === "oralb" || device.kind === "esp32";

  return (
    <div className="mt-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          disabled={device.kind === "simulated"}
          onClick={() => connect("simulated")}
          title="Plays a 2-minute session at 10x speed"
        >
          {device.kind === "simulated"
            ? "Simulated brush on"
            : "Use simulated brush"}
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          disabled={!viaBridge || brushing}
          onClick={brushNow}
          title={
            viaBridge
              ? "Drives a bridge started with --simulate"
              : "Connect an Oral-B or DIY clip first"
          }
        >
          Test with bridge simulator
        </button>
      </div>
      <label className="mt-1.5 flex items-start gap-2 text-xs text-amber-900">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={dentistCheck}
          onChange={(e) => setDentistCheck(e.target.checked)}
        />
        No smart brush? Dentist confirms home care
      </label>
      <details className="mt-1.5 text-xs text-amber-900">
        <summary className="cursor-pointer font-semibold">
          Hardware bridge
        </summary>
        <ul className="mt-1 space-y-1">
          {BRIDGE_COMMANDS.map((c) => (
            <li key={c.command}>
              {c.label}
              <code className="mt-0.5 block overflow-x-auto rounded bg-white px-1.5 py-1 text-xs whitespace-nowrap">
                {c.command}
              </code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
