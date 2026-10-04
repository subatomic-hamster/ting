import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ReadDocument } from '../api';
import { claimsFromLedger, decideMatch, overbilling, type Invoice } from '../engine/reconcile';
import { formatDate, formatMoney } from '../lib/format';
import { useAppStore } from '../store';

/** A dentist's bill, matched to Lincoln's EOB for the same visit, then checked against what the EOB says you owe. */
const CATEGORY: Record<string, string> = {
  covered: 'dental procedure',
  missed_appointment: 'missed-appointment fee',
  cosmetic: 'cosmetic',
  finance_charge: 'finance charge',
  other: 'other charge',
};

export function InvoiceCheck({ invoice, lineChecks = [] }: { invoice: Invoice; lineChecks?: ReadDocument['lineChecks'] }) {
  // Winnow use 5: charges the plan never covers (confidently classified) are left out of the EOB comparison.
  const notCovered = (lineChecks ?? []).filter((l) => l.category !== 'covered' && !l.ask).reduce((s, l) => s + l.amount, 0);
  const odd = (lineChecks ?? []).filter((l) => l.category !== 'covered' || l.ask);
  const history = useAppStore((s) => s.profile.ledger.history);
  const claims = claimsFromLedger(history);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const match = useQuery({
    queryKey: ['invoice-match', invoice, claims.map((c) => c.claimId).join(',')],
    queryFn: () => api.matchInvoice(invoice, claims),
  });

  const decision = match.data ? decideMatch(match.data.probs) : undefined;
  const claim = decision && decision.kind !== 'unlinked' ? claims.find((c) => c.claimId === decision.claimId) : undefined;
  const linked = claim && (decision?.kind === 'linked' || confirmed === true);
  const flag = linked ? overbilling(invoice, claim, notCovered) : undefined;

  return (
    <div className="mt-2 rounded-xl border border-line bg-white p-3 text-sm">
      <p className="font-medium">
        Dentist&rsquo;s bill{invoice.serviceDate ? ` for ${formatDate(invoice.serviceDate, { year: true })}` : ''}
        {invoice.amountDue !== undefined && <> · asks for {formatMoney(invoice.amountDue)}</>}
      </p>
      {odd.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {odd.map((l) => (
            <li key={l.text}>
              {l.ask ? 'Not sure what this line is: ' : `Not covered by insurance (${CATEGORY[l.category] ?? l.category}): `}
              <span className="text-ink">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {!match.data || !decision ? (
        <p className="mt-1 text-muted">Matching it to your Lincoln claims…</p>
      ) : decision.kind === 'unlinked' || !claim ? (
        <p className="mt-1 text-muted">
          No Lincoln claim for this visit yet. When the EOB arrives, Ting links it to this bill and checks the amount. Nothing is counted twice.
        </p>
      ) : decision.kind === 'confirm' && confirmed === null ? (
        <div className="mt-1">
          <p>
            Is this the bill for your visit on {formatDate(claim.date, { year: true })} (claim {claim.claimId})?{' '}
            <span className="text-xs text-muted">{Math.round(decision.p * 100)}% sure</span>
          </p>
          <div className="mt-1.5 flex gap-2">
            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setConfirmed(true)}>
              Yes, same visit
            </button>
            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setConfirmed(false)}>
              No
            </button>
          </div>
        </div>
      ) : confirmed === false ? (
        <p className="mt-1 text-muted">Kept separate. It won&rsquo;t be counted against any claim.</p>
      ) : (
        <>
          <p className="mt-1 text-muted">
            Linked to Lincoln claim {claim.claimId} ({formatDate(claim.date, { year: true })}). The EOB says you owe {formatMoney(claim.memberOwes)}.
            <span className="ml-1 text-xs">
              {decision.kind === 'linked' ? `${Math.round(decision.p * 100)}% match` : 'you confirmed'} · {match.data.source}
            </span>
          </p>
          {flag ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 font-medium text-cost" role="alert">
              {flag.message}
            </p>
          ) : (
            <p className="mt-2 text-save">The bill matches what Lincoln says you owe.</p>
          )}
        </>
      )}
    </div>
  );
}
