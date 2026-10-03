import { useId, useState, type ReactNode } from 'react';
import glossary from '../fixtures/glossary.json';

type Key = keyof typeof glossary;

export function GlossaryTerm({ term, children }: { term: Key; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = glossary[term];
  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cursor-help border-b border-dotted border-current leading-tight"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-full left-1/2 z-40 mt-1.5 w-60 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-left text-xs leading-snug font-normal text-white shadow-lg"
        >
          <strong className="block font-semibold">{entry.term}</strong>
          {entry.definition}
        </span>
      )}
    </span>
  );
}
