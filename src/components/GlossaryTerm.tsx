import { useId, useRef, useState, type ReactNode } from "react";
import glossary from "../fixtures/glossary.json";
import { InfoIcon } from "./Icons";
type Key = keyof typeof glossary;
export function GlossaryTerm({
  term,
  children,
}: {
  term: Key;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 80, width: 240 });
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const entry = glossary[term];
  const show = () => {
    const box = ref.current?.getBoundingClientRect();
    if (box) {
      const width = Math.min(320, window.innerWidth - 32);
      setPosition({
        width,
        left: Math.max(16, Math.min(window.innerWidth - width - 16, box.left)),
        top: Math.min(window.innerHeight / 2, box.bottom + 8),
      });
    }
    setOpen(true);
  };
  return (
    <span className="inline">
      <button
        ref={ref}
        type="button"
        // Inline in the sentence; the ::after box keeps a 48px tap target without pushing the text apart.
        className="relative inline-flex min-h-0 min-w-0 cursor-help items-baseline gap-0.5 p-0 align-baseline [font:inherit] text-inherit underline decoration-dotted underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {children ?? entry.term}
        <InfoIcon width={12} height={12} className="shrink-0 self-center text-muted" aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          style={position}
          className="fixed z-50 max-h-[45vh] overflow-auto border border-line bg-white px-4 py-3 text-left text-xs font-normal text-ink"
        >
          <strong className="mb-2 block">{entry.term}</strong>
          {entry.definition}
        </span>
      )}
    </span>
  );
}
