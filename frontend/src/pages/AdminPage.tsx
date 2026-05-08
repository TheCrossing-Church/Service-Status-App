import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type {
  ApiTokenRow,
  Campus,
  HistoryEntry,
  SubscriberRow,
} from "../api/types";

type Tab = "tokens" | "subscribers" | "history";
type AdminHistoryEntry = HistoryEntry & {
  campus_slug: string;
  campus_name: string;
  sent_by_username: string | null;
  api_token_label: string | null;
  api_token_prefix: string | null;
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("tokens");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-semibold mb-4">Admin</h1>
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(["tokens", "subscribers", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t === "tokens"
              ? "API Tokens"
              : t === "subscribers"
                ? "Subscribers"
                : "History"}
          </button>
        ))}
      </div>
      {tab === "tokens" && <TokensTab />}
      {tab === "subscribers" && <SubscribersTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

function TokensTab() {
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusId] = useState<number | "">("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: number; raw: string } | null>(
    null,
  );

  async function refresh(): Promise<void> {
    const [{ tokens }, { campuses }] = await Promise.all([
      api.adminApiTokens(),
      api.adminCampuses(),
    ]);
    setTokens(tokens);
    setCampuses(campuses);
    if (campuses[0] && campusId === "") setCampusId(campuses[0].id);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  async function handleCreate(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (typeof campusId !== "number") return;
    try {
      const result = await api.adminCreateApiToken(campusId, label);
      setRevealed({ id: result.token.id, raw: result.plaintext });
      setLabel("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  async function handleRevoke(id: number): Promise<void> {
    if (!confirm("Revoke this token? Stream Decks using it will stop working.")) {
      return;
    }
    try {
      await api.adminRevokeApiToken(id);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  return (
    <div>
      <form
        onSubmit={handleCreate}
        className="bg-white border border-slate-200 rounded-md p-4 mb-6 grid sm:grid-cols-[auto_1fr_auto] gap-2 items-end"
      >
        <label className="block">
          <span className="text-xs font-medium text-slate-700 block mb-1">
            Campus
          </span>
          <select
            value={campusId}
            onChange={(e) => setCampusId(Number(e.target.value))}
            className="rounded-md border-slate-300 border px-3 py-2 w-full"
          >
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700 block mb-1">
            Label
          </span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Stream Deck — Booth"
            className="w-full rounded-md border-slate-300 border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 text-white px-4 py-2 font-medium hover:bg-slate-800"
        >
          Create token
        </button>
      </form>

      {revealed && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900 mb-1">
            Copy this token now — it won't be shown again
          </div>
          <code className="block text-sm break-all bg-white border border-amber-200 rounded px-2 py-1">
            {revealed.raw}
          </code>
          <button
            type="button"
            className="mt-2 text-sm text-amber-900 underline"
            onClick={() => setRevealed(null)}
          >
            I copied it
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
          <tr>
            <th className="py-2">Campus</th>
            <th>Label</th>
            <th>Prefix</th>
            <th>Last used</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.id} className="border-b border-slate-100">
              <td className="py-2">{t.campus_name}</td>
              <td>{t.label}</td>
              <td className="font-mono text-xs">{t.prefix}…</td>
              <td className="text-slate-500">
                {t.last_used_at
                  ? new Date(t.last_used_at).toLocaleString()
                  : "never"}
              </td>
              <td>
                {t.revoked_at ? (
                  <span className="text-red-600">revoked</span>
                ) : (
                  <span className="text-emerald-700">active</span>
                )}
              </td>
              <td className="text-right">
                {!t.revoked_at && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(t.id)}
                    className="text-red-600 text-sm hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscribersTab() {
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminSubscribers()
      .then(({ subscribers }) => setSubscribers(subscribers))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
        <tr>
          <th className="py-2">Name</th>
          <th>Email</th>
          <th>Memberships</th>
          <th>Devices</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {subscribers.map((s) => (
          <tr key={s.id} className="border-b border-slate-100 align-top">
            <td className="py-2">{s.display_name}</td>
            <td className="text-slate-600">{s.email}</td>
            <td className="text-xs text-slate-600">
              {s.memberships.length === 0
                ? "—"
                : s.memberships
                    .map((m) => `${m.campus_slug}/${m.group_slug}`)
                    .join(", ")}
            </td>
            <td>{s.device_count}</td>
            <td>
              {s.active ? (
                <span className="text-emerald-700">active</span>
              ) : (
                <span className="text-slate-500">inactive</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryTab() {
  const [history, setHistory] = useState<AdminHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminHistory()
      .then(({ history }) => setHistory(history as AdminHistoryEntry[]))
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
        <tr>
          <th className="py-2">When</th>
          <th>Campus</th>
          <th>Status</th>
          <th>Source</th>
          <th>Sent by</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h) => (
          <tr key={h.id} className="border-b border-slate-100">
            <td className="py-2 whitespace-nowrap">
              {new Date(h.created_at).toLocaleString()}
            </td>
            <td>{h.campus_name}</td>
            <td>
              <span className="mr-1">{h.status_icon}</span>
              {h.status_label}
            </td>
            <td className="text-slate-500">{h.sent_via}</td>
            <td className="text-slate-600">
              {h.sent_by_display_name ??
                (h.api_token_label
                  ? `${h.api_token_label} (${h.api_token_prefix}…)`
                  : "—")}
            </td>
            <td className="text-slate-700 max-w-xs truncate">{h.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
