import { QUADRANTS } from "../../habits/program";
import { useHabitStore } from "../../habits/store";
import { formatDuration } from "../../lib/format";
import { CheckIcon, InfoIcon } from "../Icons";
import { QuadrantMap } from "./QuadrantMap";

const TARGET_SEC = 120;
const R = 52;
const C = 2 * Math.PI * R;

function Ring({ elapsed }: { elapsed: number }) {
  const done = Math.min(1, elapsed / TARGET_SEC);
  return (
    <svg
      viewBox="0 0 128 128"
      width={128}
      height={128}
      role="img"
      aria-label={`${formatDuration(elapsed)} of 2:00`}
    >
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="10"
      />
      <circle
        cx="64"
        cy="64"
        r={R}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - done)}
        transform="rotate(-90 64 64)"
        className="transition-[stroke-dashoffset] duration-200"
      />
      <text
        x="64"
        y="62"
        textAnchor="middle"
        className="fill-current text-2xl font-semibold tabular"
      >
        {formatDuration(elapsed)}
      </text>
      <text
        x="64"
        y="80"
        textAnchor="middle"
        className="fill-current text-xs text-muted"
      >
        goal 2:00
      </text>
    </svg>
  );
}

export function LiveBrushPanel() {
  const live = useHabitStore((s) => s.live);
  const last = useHabitStore((s) => s.lastSession);
  const running = live?.state === "running";

  if (running && live) {
    return (
      <div className="flex flex-wrap items-center gap-6" aria-live="polite">
        <Ring elapsed={live.elapsedSec} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Brushing now · {live.deviceName}</p>
          <p className="mt-1 text-lg font-semibold">
            {QUADRANTS[live.sector - 1] ?? "Starting"}
          </p>
          <QuadrantMap active={live.sector} size={180} />
          {live.pressureHigh ? (
            <p className="mt-1 inline-flex rounded-full bg-cost/10 px-2.5 py-1 text-sm font-semibold text-cost">
              Too much pressure: ease up
            </p>
          ) : (
            <p className="mt-1 text-sm text-save">Pressure OK</p>
          )}
        </div>
      </div>
    );
  }

  if (last) {
    const s = last.session;
    const covered = s.sectorSeconds.filter((x) => x >= 10).length;
    const minIndex = s.sectorSeconds.indexOf(Math.min(...s.sectorSeconds));
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="eyebrow">Last session</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Stat label="Time" value={formatDuration(s.durationSec)} />
          <Stat
            label="Areas covered"
            value={`${covered} of ${s.sectorCount}`}
          />
          <Stat label="Pressure warnings" value={String(s.pressureWarnings)} />
        </div>
        <p
          className={`flex items-start gap-1.5 text-sm ${last.check.verified ? "text-save" : "text-warn"}`}
        >
          {last.check.verified ? (
            <CheckIcon className="mt-0.5" />
          ) : (
            <InfoIcon className="mt-0.5" />
          )}
          {last.check.verified
            ? "Session qualifies for rewards"
            : `Not counted: ${last.check.reason}`}
          {" · "}
          {last.saved
            ? "saved to your SmileStreak"
            : "not saved (you haven’t opted in)"}
        </p>
        {s.sectorCount === 4 &&
          s.sectorSeconds[minIndex] < s.durationSec / 4 - 5 && (
            <p className="text-sm text-muted">
              Tip: {QUADRANTS[minIndex].toLowerCase()} got{" "}
              {s.sectorSeconds[minIndex]}s. Aim for about{" "}
              {Math.round(TARGET_SEC / 4)}s in each area.
            </p>
          )}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted">
      Connect a brush, then brush. Each area of your mouth lights up as you go;
      the session is checked and saved when you stop.
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular text-xl font-semibold">{value}</div>
    </div>
  );
}
