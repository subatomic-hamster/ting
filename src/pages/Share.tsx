import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api, USE_MOCKS } from "../api";
import { HandoffSheet } from "../components/HandoffSheet";
import { HomeCareSummary } from "../components/habits/HomeCareSummary";
import { formatDate } from "../lib/format";
export default function Share() {
  const { token = "" } = useParams();
  const shared = useQuery({
    queryKey: ["share", token],
    queryFn: () => api.getShare(token),
    retry: false,
  });
  const snap = shared.data;
  if (shared.isPending)
    return (
      <main className="page-inset mx-auto max-w-3xl">
        <h1>Shared treatment plan</h1>
        <p role="status" className="mt-5">
          Loading the shared plan…
        </p>
      </main>
    );
  if (
    !snap ||
    shared.isError ||
    snap.expiresAt < new Date().toISOString().slice(0, 10)
  )
    return (
      <main className="page-inset mx-auto max-w-3xl">
        <h1>Shared plan unavailable</h1>
        <p role="alert" className="mt-5">
          {shared.isError
            ? "Could not load this shared plan. Try again, or ask the person who shared it for a new link."
            : !snap
              ? "This link does not match a shared plan. Ask the person who shared it for a new link."
              : "This shared link has expired. Ask the person who shared it for a new link."}
        </p>
        <button
          className="btn-secondary mt-5"
          onClick={() => void shared.refetch()}
        >
          Try again
        </button>
        <Link className="btn-ghost" to="/">
          Ting home
        </Link>
      </main>
    );
  return (
    <main className="member-content page-inset mx-auto max-w-3xl">
      {USE_MOCKS && (
        <p className="mb-5 text-xs text-muted">
          This link opens only in the browser where it was created.
        </p>
      )}
      <HandoffSheet
        patientName={snap.patientName}
        procedures={snap.procedures}
        schedule={snap.schedule}
        rulesVersion={snap.rulesVersion}
      />
      <p className="mt-4 text-xs text-muted">
        Shared {formatDate(snap.sharedAt.slice(0, 10), { year: true })}. Expires{" "}
        {formatDate(snap.expiresAt, { year: true })}.
      </p>
      {snap.homeCare && (
        <section className="card mt-6">
          <h2>Home-care summary</h2>
          <HomeCareSummary
            summary={snap.homeCare}
            patientName={snap.patientName}
          />
        </section>
      )}
    </main>
  );
}
