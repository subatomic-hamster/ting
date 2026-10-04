import { useMemo, useState } from "react";
import { CDT } from "../engine/cdt";
import published from "../data/provider-fees.json";
import { formatMoney } from "../lib/format";
import { useAppStore } from "../store";
export function ProcedureCatalog() {
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("D8090");
  const [fee, setFee] = useState("");
  const [allowed, setAllowed] = useState("");
  const [tooth, setTooth] = useState("");
  const [reference, setReference] = useState(false);
  const [status, setStatus] = useState("");
  const network = useAppStore((s) => s.network);
  const add = useAppStore((s) => s.addProcedures);
  const matches = useMemo(
    () =>
      Object.entries(CDT).filter(([cdt, info]) =>
        `${cdt} ${info.short} ${info.category} ${info.category === "orthodontics" ? "aligners braces retainers" : ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search],
  );
  const current = CDT[code];
  const price = published.entries.find((e) => e.cdt === code);
  const isOrtho = current?.category === "orthodontics";
  return (
    <div className="space-y-5">
      <p className="text-base text-muted">
        Choose the procedure on your dentist’s plan. Enter a quote for an
        estimate. {Object.keys(CDT).length} procedures available.
      </p>
      <label className="block">
        Search procedures
        <input
          type="search"
          value={search}
          onChange={(e) => {
            const value = e.target.value;
            setSearch(value);
            if (
              !`${code} ${CDT[code]?.short} ${CDT[code]?.category} ${CDT[code]?.category === "orthodontics" ? "aligners braces retainers" : ""}`
                .toLowerCase()
                .includes(value.toLowerCase())
            ) {
              setCode("");
              setFee("");
              setAllowed("");
              setReference(false);
              setStatus("");
            }
          }}
          placeholder="Braces, dentures, gum treatment or code"
          className="mt-1 block w-full border border-line px-3 py-2"
        />
      </label>
      <label className="block">
        Procedure
        <select
          aria-label="Procedure"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setReference(false);
            setFee("");
            setAllowed("");
            setStatus("");
          }}
          className="mt-1 block w-full border border-line px-3 py-2"
        >
          <option value="" disabled>
            Choose a procedure
          </option>
          {matches.map(([cdt, info]) => (
            <option key={cdt} value={cdt}>
              {info.short} ({cdt})
            </option>
          ))}
        </select>
      </label>
      {matches.length === 0 && (
        <p role="status">
          No matching procedures. Ask your dentist for the billing code.
        </p>
      )}
      {current && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const amount = reference && price ? price.charge : Number(fee);
            const allowance =
              allowed.trim() === "" ? undefined : Number(allowed);
            if (
              !Number.isFinite(amount) ||
              amount <= 0 ||
              (allowance !== undefined &&
                (!Number.isFinite(allowance) ||
                  allowance < 0 ||
                  allowance > amount))
            )
              return;
            const error = add([
              {
                id: `catalog-${code}-${Date.now()}`,
                cdt: code,
                fee: amount,
                feeSource: reference
                  ? {
                      kind: "benchmark",
                      label: `Published ${published.provider} charge, FY ${published.fiscalYear}`,
                      zip: published.zip,
                      url: published.url,
                      retrievedAt: published.retrievedAt,
                    }
                  : { kind: "quote", label: "Dentist quote entered by you" },
                allowedFee: allowance,
                allowancePending: allowance === undefined,
                allowedFeeSource:
                  allowance === undefined
                    ? undefined
                    : {
                        kind: "contract",
                        label: "Insurer allowance entered by you",
                        planId: useAppStore.getState().profile.currentPlan.id,
                        planVersion:
                          useAppStore.getState().profile.currentPlan.version,
                        network: useAppStore.getState().network,
                      },
                inNetwork: network === "in",
                tooth: tooth ? Number(tooth) : undefined,
              },
            ]);
            setStatus(
              error
                ? `Could not add treatment: ${error}`
                : `Added ${current.short}. Your quote is used for this estimate.`,
            );
          }}
        >
          {isOrtho && (
            <p className="border-l-2 border-brand-600 pl-3 text-base">
              For braces or aligners, use the full-course fee from your
              orthodontist, including any bundled visits and retainers. Do not
              enter a monthly installment. This estimate models the fee at the
              start date; confirm installment payments, age eligibility,
              treatment in progress and your remaining lifetime benefit with
              your insurer.
            </p>
          )}
          {price && (
            <details className="border-t border-line">
              <summary className="text-brand-700">
                Published clinic price reference
              </summary>
              <p>
                {formatMoney(price.charge)} at {published.provider},{" "}
                {published.city}. FY {published.fiscalYear}. This is a provider
                charge, not your dentist’s quote or insurer’s allowance.
              </p>
              <a
                href={`${published.url}#page=${price.page}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center text-brand-700 underline"
              >
                View source fee schedule
              </a>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={reference}
                  onChange={(e) => setReference(e.target.checked)}
                />
                Use this clinic’s charge as a price reference
              </label>
            </details>
          )}
          <label className="block">
            {isOrtho
              ? "Full-course dentist fee ($)"
              : "Dentist fee for one procedure ($)"}
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              required={!reference}
              disabled={reference}
              value={reference && price ? price.charge : fee}
              onChange={(e) => setFee(e.target.value)}
              className="mt-1 block w-full border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            Insurer allowed amount ($), if confirmed
            <input
              type="number"
              min="0"
              max={reference && price ? price.charge : fee || 1000000}
              step="0.01"
              value={allowed}
              onChange={(e) => setAllowed(e.target.value)}
              className="mt-1 block w-full border border-line px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted">
            Leave the allowance blank if unknown. We budget the full fee until
            you confirm it.{" "}
            {isOrtho &&
              "Do not add adjustment visits or retainers again if already included in the course fee."}
          </p>
          <label className="block">
            Tooth number, if stated (optional)
            <input
              type="number"
              min="1"
              max="32"
              step="1"
              value={tooth}
              onChange={(e) => setTooth(e.target.value)}
              className="mt-1 block w-full border border-line px-3 py-2"
            />
          </label>
          <button type="submit" className="btn-secondary w-full sm:w-auto">
            Add selected procedure
          </button>
        </form>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
