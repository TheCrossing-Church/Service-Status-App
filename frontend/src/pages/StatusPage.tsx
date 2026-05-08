import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import type { CurrentStatus, StatusUpdate } from "../api/types";

// Public live status page (PRD §5). Subscribes to the SSE stream and
// renders one card per campus with the current status, message, and time.
// Filters to a single campus when ?campus=<slug> is present (lobby screens).
export default function StatusPage() {
  const [params] = useSearchParams();
  const campusFilter = params.get("campus") ?? undefined;
  const [statuses, setStatuses] = useState<CurrentStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .currentStatuses(campusFilter)
      .then((d) => !cancelled && setStatuses(d.statuses))
      .catch((err: Error) => !cancelled && setError(err.message));

    // SSE for live updates. Browser EventSource handles reconnect; on each
    // `status` event we patch the affected campus in place.
    const url = campusFilter
      ? `/api/events?campus=${encodeURIComponent(campusFilter)}`
      : "/api/events";
    const es = new EventSource(url);

    es.addEventListener("snapshot", (e) => {
      try {
        const data = JSON.parse(
          (e as MessageEvent).data,
        ) as { statuses: CurrentStatus[] };
        if (!cancelled) setStatuses(data.statuses);
      } catch {
        /* ignore */
      }
    });

    es.addEventListener("status", (e) => {
      try {
        const update = JSON.parse((e as MessageEvent).data) as StatusUpdate;
        if (cancelled) return;
        setStatuses((prev) =>
          prev.map((s) =>
            s.campus_id === update.campus.id
              ? {
                  ...s,
                  status_update_id: update.status_update_id,
                  status_type_id: update.status_type.id,
                  status_slug: update.status_type.slug,
                  status_label: update.status_type.label,
                  status_color: update.status_type.color,
                  status_icon: update.status_type.icon,
                  message: update.message,
                  sent_via: update.sent_via,
                  created_at: update.created_at,
                }
              : s,
          ),
        );
      } catch {
        /* ignore */
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do unless we want to surface
      // a "reconnecting…" banner. Skipping for v1.
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [campusFilter]);

  const heading = useMemo(
    () => (campusFilter ? `Status: ${campusFilter}` : "Service Status"),
    [campusFilter],
  );

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold mb-4">{heading}</h1>
        <p className="text-red-600">Failed to load status: {error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-6">{heading}</h1>
      <ul className="space-y-3">
        {statuses.map((s) => (
          <li
            key={s.campus_id}
            className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">
                  {s.campus_code ?? ""}
                </div>
                <div className="text-lg font-semibold text-slate-900">
                  {s.campus_name}
                </div>
              </div>
              <StatusBadge
                label={s.status_label}
                color={s.status_color}
                icon={s.status_icon}
                empty={!s.status_label}
              />
            </div>
            {s.message && (
              <p className="mt-3 text-slate-700">{s.message}</p>
            )}
            {s.created_at && (
              <p className="mt-2 text-xs text-slate-400">
                Updated{" "}
                {new Date(s.created_at).toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  month: "short",
                  day: "numeric",
                })}
                {s.sent_via === "webhook" && " · via Stream Deck"}
              </p>
            )}
          </li>
        ))}
      </ul>
      {statuses.length === 0 && (
        <p className="text-slate-500">No campuses configured yet.</p>
      )}
    </div>
  );
}
