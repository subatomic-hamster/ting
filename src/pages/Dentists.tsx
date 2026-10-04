import { useState } from 'react';
import { DemoDataPill } from '../components/DemoDataPill';
import { DentistList } from '../components/DentistList';
import { DentistMap } from '../components/DentistMap';
import { DENTISTS, FEE_ZIP } from '../hooks/useDentistQuotes';
import { NetworkCompare } from '../components/NetworkCompare';
import { PageHeader, Section } from '../components/Section';
import { PERSONAS } from '../data/personas';
import { useAppStore } from '../store';

export default function Dentists() {
  const persona = useAppStore((s) => PERSONAS[s.personaId]);
  const [keep, setKeep] = useState(false);
  const mine = DENTISTS.find((d) => d.id === persona.currentDentistId);

  return (
    <div className="space-y-5">
      <PageHeader title="Find a dentist" subtitle={`Sorted by what your current treatment plan would cost you. Greensboro, NC ${FEE_ZIP}.`}>
        <DemoDataPill label="Demo dentists & fees" />
      </PageHeader>

      {mine && (
        <Section
          title={`Your dentist: ${mine.name}`}
          id="mine"
          actions={
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep my dentist
            </label>
          }
        >
          <NetworkCompare dentistId={mine.id} />
        </Section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Section className="lg:col-span-2" title="Dentists near you" id="list">
          <DentistList pinnedId={keep ? mine?.id : undefined} />
        </Section>
        <Section title="Map" id="map" actions={<DemoDataPill />}>
          <DentistMap />
        </Section>
      </div>
    </div>
  );
}
