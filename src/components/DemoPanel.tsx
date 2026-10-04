import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, USE_MOCKS } from "../api";
import { PERSONA_IDS, PERSONAS } from "../data/personas";
import { yearOf } from "../lib/dates";
import { formatDate } from "../lib/format";
import { useHabitStore } from "../habits/store";
import { useAppStore } from "../store";
import { EmailDemoControls } from "./demo/EmailDemoControls";
import { HabitsDemoControls } from "./demo/HabitsDemoControls";
import { CloseIcon } from "./Icons";

const GROUP_TITLE = "mb-1 text-xs font-semibold text-amber-900";

/** A collapsible group of demo controls; open by default on the page it drives. */
function Group({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="mt-2 border-t border-amber-200 pt-2">
      <summary className={`${GROUP_TITLE} cursor-pointer`}>{title}</summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}

function initiallyOpen() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("demo") === "1";
}

export function DemoPanel() {
  // `open`: the panel is on the page at all (?demo=1 or Ctrl+Shift+D). `expanded`: the full controls, not just the pill.
  const [open, setOpen] = useState(initiallyOpen);
  // ?demo=1 is the presenter asking for the controls; the page is padded below them, so nothing hides behind it.
  const [expanded, setExpanded] = useState(initiallyOpen);
  const panelRef = useRef<HTMLElement>(null);
  const personaId = useAppStore((s) => s.personaId);
  const asOf = useAppStore((s) => s.profile.asOf);
  const today = useAppStore((s) => s.today);
  const loadPersona = useAppStore((s) => s.loadPersona);
  const simulateDec1 = useAppStore((s) => s.simulateDec1);
  const setAsOf = useAppStore((s) => s.setAsOf);
  const reset = useAppStore((s) => s.reset);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const fire = useMutation({
    mutationFn: () => api.fireMockClaim(useAppStore.getState().profile),
  });
  const underpaid = useMutation({
    mutationFn: () =>
      api.fireMockClaim(useAppStore.getState().profile, { underpay: 90 }),
  });
  const brushNow = useHabitStore((s) => s.brushNow);
  const brushing = useHabitStore((s) => s.live?.state === "running");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((o) => !o);
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While expanded, leave room under the page for the panel so no control stays hidden behind it.
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !expanded || !el) return;
    const pad = () => {
      document.body.style.paddingBottom = `${el.offsetHeight + 24}px`;
    };
    pad();
    const ro = new ResizeObserver(pad);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [open, expanded]);

  if (!open) return null;

  if (!expanded)
    return (
      <div className="no-print fixed right-3 bottom-3 z-30 flex items-center overflow-hidden rounded-full border border-amber-300 bg-amber-50/95 text-xs font-semibold text-amber-900 shadow-md">
        <button
          type="button"
          className="px-3 py-1.5 hover:bg-amber-100"
          onClick={() => setExpanded(true)}
          aria-label="Show demo controls"
        >
          Demo
        </button>
        <button
          type="button"
          className="border-l border-amber-300 px-2 py-1.5 hover:bg-amber-100"
          onClick={() => setOpen(false)}
          aria-label="Hide demo panel"
        >
          ×
        </button>
      </div>
    );

  return (
    <aside
      ref={panelRef}
      aria-label="Demo controls"
      className="no-print fixed right-3 bottom-3 left-3 z-30 max-h-[50vh] overflow-y-auto rounded-2xl border border-amber-300 bg-amber-50/95 p-3 shadow-xl backdrop-blur sm:left-auto sm:w-80"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-amber-900">Demo panel</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
            onClick={() => setExpanded(false)}
            aria-label="Collapse demo panel"
          >
            Collapse
          </button>
          <button
            type="button"
            className="rounded p-1 text-amber-900 hover:bg-amber-100"
            onClick={() => setOpen(false)}
            aria-label="Hide demo panel"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-amber-900">
        As of <strong>{formatDate(asOf, { year: true })}</strong>
        {asOf !== today && " (simulated)"} ·{" "}
        {USE_MOCKS ? "mock API" : "live API"}
      </p>

      <fieldset className="mb-3">
        <legend className={GROUP_TITLE}>Persona</legend>
        <div className="grid grid-cols-3 gap-1">
          {PERSONA_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={personaId === id}
              onClick={() => loadPersona(id)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                personaId === id
                  ? "border-amber-600 bg-amber-200 text-amber-950"
                  : "border-amber-300 bg-white text-amber-900"
              }`}
              title={PERSONAS[id].blurb}
            >
              {PERSONAS[id].name}, {PERSONAS[id].age}
            </button>
          ))}
        </div>
      </fieldset>

      <p className={GROUP_TITLE}>Time and claims</p>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          onClick={() => setAsOf(`${yearOf(today)}-11-01`)}
        >
          Simulate Nov 1
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          onClick={simulateDec1}
        >
          Simulate Dec 1
        </button>
        <button
          type="button"
          className="btn-primary px-2 py-1.5 text-xs"
          disabled={fire.isPending}
          onClick={() => fire.mutate()}
        >
          {fire.isPending
            ? "Sending…"
            : fire.isError
              ? "Nothing left to claim"
              : USE_MOCKS
                ? "Fire mock claim"
                : "Dentist visit"}
        </button>
        <button
          type="button"
          className="btn-secondary px-2 py-1.5 text-xs"
          disabled={underpaid.isPending}
          onClick={() => underpaid.mutate()}
          title="The insurer pays $90 less than Ting estimated, to show the EOB check"
        >
          {underpaid.isPending ? "Sending…" : "Underpaid EOB"}
        </button>
      </div>

      <Group
        key={`email-${pathname}`}
        title="Email"
        open={pathname.startsWith("/email")}
      >
        <EmailDemoControls />
      </Group>

      <Group
        key={`habits-${pathname}`}
        title="SmileStreak"
        open={pathname.startsWith("/habits")}
      >
        <button
          type="button"
          className="btn-secondary w-full px-2 py-1.5 text-xs"
          disabled={brushing}
          onClick={brushNow}
        >
          {brushing ? "Brushing…" : "Brush now"}
        </button>
        <HabitsDemoControls />
      </Group>

      <button
        type="button"
        className="btn-secondary mt-3 w-full px-2 py-1.5 text-xs"
        onClick={() => {
          reset();
          void api.resetDemo().finally(() => queryClient.invalidateQueries());
          navigate("/");
        }}
      >
        Reset demo
      </button>
      <p className="mt-2 text-xs text-amber-800">
        Ctrl+Shift+D toggles this panel.
      </p>
    </aside>
  );
}
