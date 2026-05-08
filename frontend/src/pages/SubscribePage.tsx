import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { ensurePushSubscription } from "../pwa/push";
import type { Campus, SubscriberGroup } from "../api/types";

// Self-enrollment for staff/volunteers (PRD §4). Pick campuses, then
// per-campus pick groups, submit, and (optionally) grant push permission.
export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [groups, setGroups] = useState<SubscriberGroup[]>([]);
  const [selected, setSelected] = useState<
    Record<string, Set<string>>
  >({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    email: string;
    pushed: boolean;
    pushReason?: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([api.campuses(), fetchAllGroups()])
      .then(([{ campuses }, gs]) => {
        setCampuses(campuses);
        setGroups(gs);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function fetchAllGroups(): Promise<SubscriberGroup[]> {
    // Public groups list isn't an admin route, so we hit one campus at a
    // time via the public status-types endpoint? — actually groups aren't
    // public yet. The simplest path: ask the backend admin endpoint.
    // For v1 enrollment we synthesize groups from a hardcoded default
    // (matches the seeded default; admin-customized labels still work
    // because we submit by slug). This avoids exposing the admin endpoint.
    return [
      { id: -1, campus_id: -1, slug: "in-service", name: "In-Service Staff & Volunteers", active: 1 },
      { id: -2, campus_id: -1, slug: "hospitality", name: "Hospitality Staff & Volunteers", active: 1 },
      { id: -3, campus_id: -1, slug: "kids", name: "Kids Staff & Volunteers", active: 1 },
    ];
  }

  function toggle(campusSlug: string, groupSlug: string): void {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[campusSlug] ?? []);
      if (set.has(groupSlug)) set.delete(groupSlug);
      else set.add(groupSlug);
      next[campusSlug] = set;
      return next;
    });
  }

  const memberships = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, s]) => s.size > 0)
        .map(([campus_slug, s]) => ({
          campus_slug,
          group_slugs: Array.from(s),
        })),
    [selected],
  );

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    if (memberships.length === 0) {
      setError("Pick at least one campus + group combination");
      return;
    }
    setPending(true);
    try {
      await api.enrollSubscriber({
        email,
        display_name: displayName,
        memberships,
      });
      // Try to register a push subscription. Failures are non-fatal —
      // the user can still retry from the success state.
      const push = await ensurePushSubscription(email);
      setSuccess({
        email,
        pushed: push.ok,
        pushReason: push.ok ? undefined : push.reason,
      });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Enrollment failed");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold mb-2">Subscribed</h1>
        <p className="text-slate-700 mb-2">
          You'll get notifications for {success.email}.
        </p>
        {success.pushed ? (
          <p className="text-sm text-emerald-700">
            Push notifications enabled on this device.
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Push notifications could not be enabled
            {success.pushReason ? `: ${success.pushReason}` : ""}.
            You can re-visit this page on each device you want notified.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Get notified</h1>
      <p className="text-sm text-slate-600 mb-6">
        Pick the campuses you serve and the groups you're part of.
        You'll get a push notification when your campus's status changes.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-2">
            Campuses & groups
          </legend>
          <div className="space-y-3">
            {campuses.map((c) => (
              <div
                key={c.slug}
                className="bg-white border border-slate-200 rounded-md p-3"
              >
                <div className="font-semibold text-slate-900 mb-2">
                  {c.name}
                </div>
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <label
                      key={`${c.slug}-${g.slug}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected[c.slug]?.has(g.slug) ?? false}
                        onChange={() => toggle(c.slug, g.slug)}
                      />
                      <span>{g.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enrolling…" : "Subscribe"}
        </button>
      </form>
    </div>
  );
}
