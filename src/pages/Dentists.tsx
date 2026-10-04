import { useState } from "react";
import { Link } from "react-router-dom";
import { DentistList } from "../components/DentistList";
import { DentistMap } from "../components/DentistMap";
import { DENTISTS, FEE_ZIP } from "../hooks/useDentistQuotes";
import { NetworkCompare } from "../components/NetworkCompare";
import { PageHeader, Section } from "../components/Section";
import { PERSONAS } from "../data/personas";
import { useAppStore } from "../store";
export default function Dentists() {
  const persona = useAppStore((s) => PERSONAS[s.personaId]);
  const [keep, setKeep] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const mine = DENTISTS.find((d) => d.id === persona.currentDentistId);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Compare dentists"
        subtitle={`Compare the costs of your planned care near Greensboro, NC ${FEE_ZIP}.`}
      />
      <p className="text-base text-muted">
        Provider prices and participation shown here are sample comparisons.
        Confirm a real dentist’s network status with your insurer and request a
        written quote.
      </p>
      <Link to="/treatment#waterfall" className="btn-primary w-full sm:w-auto">
        Enter your dentist’s quote
      </Link>
      {mine && (
        <Section title={`Current dentist: ${mine.name}`} id="mine">
          <NetworkCompare dentistId={mine.id} />
          <label className="mt-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
            Keep this dentist first in comparisons
          </label>
        </Section>
      )}
      <Section title="Provider comparisons" id="list">
        <div
          className="mb-5 flex gap-3"
          role="group"
          aria-label="Provider view"
        >
          <button
            className="btn-secondary"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className="btn-secondary"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
          >
            Map
          </button>
        </div>
        {view === "map" ? (
          <DentistMap />
        ) : (
          <DentistList pinnedId={keep ? mine?.id : undefined} />
        )}
      </Section>
      <Section title="Published clinic fees nearby" id="clinic">
        <p>
          Cleveland Avenue Dental Center in Winston-Salem publishes procedure
          charges. They may differ from your dentist’s fees, and do not
          establish your insurer’s allowance.
        </p>
        <a
          href="https://www.forsyth.cc/hhs/cadc/"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary mt-4"
        >
          Clinic details and eligibility
        </a>
        <a href="tel:+13367033090" className="btn-ghost">
          Call the clinic: 336-703-3090
        </a>
        <Link to="/treatment#catalog" className="btn-ghost">
          Browse published procedure references
        </Link>
      </Section>
    </div>
  );
}
