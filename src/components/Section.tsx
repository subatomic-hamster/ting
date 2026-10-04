import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
export function Section({
  title,
  actions,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      className={`card ${className}`}
      id={id}
      aria-labelledby={id && title ? `${id}-title` : undefined}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && (
          <div className="mt-3 max-w-2xl text-base text-muted">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function DisclosureSection({
  title,
  id,
  children,
  initialOpen = false,
}: {
  title: string;
  id: string;
  children: ReactNode;
  initialOpen?: boolean;
}) {
  const { hash } = useLocation();
  const [open, setOpen] = useState(initialOpen || hash === `#${id}`);
  useEffect(() => {
    if (hash === `#${id}`) setOpen(true);
  }, [hash, id]);
  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="border-t border-line"
    >
      <summary className="text-brand-700">
        <h2>{title}</h2>
      </summary>
      <div className="py-5">{children}</div>
    </details>
  );
}
