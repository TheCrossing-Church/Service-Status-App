import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useUser } from "../auth/useUser";
import { StatusBadge } from "../components/StatusBadge";
import type {
  Campus,
  CurrentStatus,
  HistoryEntry,
  StatusType,
} from "../api/types";

// Mobile-first sender UI (PRD §2). Production staff hits one big button
// per status, sees a confirm step (so a Stream-Deck-adjacent fat-finger
// doesn't push a notification), and can optionally tweak the message
// before sending.
export default function SenderPage() {
  const user = useUser();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusSlug, setCampusSlug] = useState<string | null>(null);
  const [statusTypes, setStatusTypes] = useState<StatusType[]>([]);
  const [current, setCurrent] = useState<CurrentStatus | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [pending, setPending] = useState<StatusType | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick an initial campus the moment we know the user's assignments.
  // Solo-campus senders skip the picker; admins/multi-campus see all.
  useEffect(() => {
    api.campuses().then(({ campuses }) => {
      setCampuses(campuses);
      if (!user) return;
      const allowed = campuses.filter(
        (c) =>
          user.role === "admin" || user.campus_ids.includes(c.id),
      );
      const first = allowed[0];
      if (first) setCampusSlug((s) => s ?? first.slug);
    });
  }, [user]);

  // Per-campus side effects: load status types, current status, history.
  useEffect(() => {
    if (!campusSlug) return;
    let cancelled = false;
    Promise.all([
      api.campusStatusTypes(campusSlug),
      api.currentStatuses(campusSlug),
      api.campusHistory(campusSlug),
    ]).then(([types, statuses, h]) => {
      if (cancelled) return;
      setStatusTypes(types.status_types);
      setCurrent(statuses.statuses[0] ?? null);
      setHistory(h.history);
    });
    return () => {
      cancelled = true;
    };
  }, [campusSlug]);

  function handlePick(t: StatusType): void {
    setPending(t);
    setMessage(t.default_message ?? "");
    setError(null);
  }

  async function handleConfirm(): Promise<void> {
    if (!pending || !campusSlug) return;
    setSending(true);
    setError(null);
    try {
      const result = await api.sendStatus({
        campus_slug: campusSlug,
        status_slug: pending.slug,
        message: message.trim() ? message.trim() : null,
      });
      // Optimistically update the current-status display.
      setCurrent({
        campus_id: result.campus.id,
        campus_slug: result.campus.slug,
        campus_name: result.campus.name,
        campus_code: current?.campus_code ?? null,
        status_update_id: result.status_update_id,
        status_type_id: result.status_type.id,
        status_slug: result.status_type.slug,
        status_label: result.status_type.label,
        status_color: result.status_type.color,
        status_icon: result.status_type.icon,
        message: result.message,
        sent_via: result.sent_via,
        created_at: result.created_at,
      });
      setHistory((h) => [
        {
          id: result.status_update_id,
          message: result.message,
          sent_via: result.sent_via,
          created_at: result.created_at,
          status_slug: result.status_type.slug,
          status_label: result.status_type.label,
          status_color: result.status_type.color,
          status_icon: result.status_type.icon,
          sent_by_display_name: user?.display_name ?? null,
        },
        ...h,
      ]);
      setPending(null);
      setMessage("");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Failed to send");
    } finally {
      setSending(false);
    }
  }

  const allowedCampuses = campuses.filter(
    (c) => user?.role === "admin" || user?.campus_ids.includes(c.id),
  );
  const showCampusPicker = allowedCampuses.length > 1;

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      {showCampusPicker && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Campus
          </label>
          <select
            className="w-full rounded-md border-slate-300 border px-3 py-2"
            value={campusSlug ?? ""}
            onChange={(e) => setCampusSlug(e.target.value)}
          >
            {allowedCampuses.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {current && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Current
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold text-slate-900">
              {current.campus_name}
            </div>
            <StatusBadge
              label={current.status_label}
              color={current.status_color}
              icon={current.status_icon}
              empty={!current.status_label}
            />
          </div>
          {current.message && (
            <p className="mt-2 text-sm text-slate-700">{current.message}</p>
          )}
        </div>
      )}

      {!pending && (
        <div className="grid gap-3">
          {statusTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handlePick(t)}
              className="w-full text-left text-white text-lg font-semibold rounded-xl py-6 px-5 active:opacity-80 shadow-sm"
              style={{ backgroundColor: t.color ?? "#475569" }}
            >
              <span className="mr-2 text-2xl" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {pending && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              Confirm
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>
                {pending.icon}
              </span>
              <div className="text-lg font-semibold">{pending.label}</div>
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Message (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
            />
          </label>
          {error && (
            <p className="text-sm text-red-600 mt-2" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setMessage("");
                setError(null);
              }}
              disabled={sending}
              className="flex-1 rounded-md border border-slate-300 bg-white py-2.5 font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={sending}
              className="flex-1 rounded-md bg-slate-900 text-white py-2.5 font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send update"}
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Recent sends
          </h2>
          <ul className="space-y-2">
            {history.slice(0, 10).map((h) => (
              <li
                key={h.id}
                className="bg-white border border-slate-200 rounded-md p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    <span className="mr-1">{h.status_icon}</span>
                    {h.status_label}
                  </div>
                  {h.message && (
                    <div className="text-sm text-slate-600 truncate">
                      {h.message}
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(h.created_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {h.sent_via === "webhook" && " · webhook"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
