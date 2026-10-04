import { useId, useRef, useState, type ReactNode } from "react";
import glossary from "../fixtures/glossary.json";
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
    <span className="inline-block">
      <button
        ref={ref}
        type="button"
        className="cursor-help border-b border-dotted border-current"
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
