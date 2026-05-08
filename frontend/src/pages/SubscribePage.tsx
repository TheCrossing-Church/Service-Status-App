import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { ensurePushSubscription } from "../pwa/push";
import type { Campus } from "../api/types";

type GroupRow = {
  id: number;
  slug: string;
  name: string;
  campus_slug: string;
  campus_name: string;
};

// Self-enrollment for staff/volunteers (PRD §4). Pick campuses, then
// per-campus pick groups, submit, and (optionally) grant push permission.
export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [groupsByCampus, setGroupsByCampus] = useState<
    Record<string, GroupRow[]>
  >({});
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
    Promise.all([api.campuses(), api.groups()])
      .then(([{ campuses }, { groups }]) => {
        setCampuses(campuses);
        const byCampus: Record<string, GroupRow[]> = {};
        for (const g of groups) {
          (byCampus[g.campus_slug] ??= []).push(g);
        }
        setGroupsByCampus(byCampus);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

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
        <p className="text-slate-700 mb-3">
          Subscriber set up for {success.email}.
        </p>
        {success.pushed ? (
          <>
            <p className="text-sm text-emerald-700 mb-3">
              Push notifications enabled on this device.
            </p>
            <p className="text-sm text-slate-600">
              Want notifications on your phone too? Open this page on each
              additional device you want notified and Subscribe again.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Push could not be enabled on this device
            {success.pushReason ? `: ${success.pushReason}` : ""}. You can
            re-visit this page on each device you want notified.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-2">Get notified</h1>
      <p className="text-sm text-slate-600 mb-4">
        Pick the campuses you serve and the groups you're part of. When status
        changes for one of those campuses, you'll get a push notification on
        this device.
      </p>

      <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <strong>One device at a time.</strong> Subscribing here only enables
        push for the browser you're using right now. Repeat this on every phone
        or computer you want to be notified on.
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded-md border-slate-300 border px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            How you'll appear in the admin's subscriber list.
          </span>
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
          <span className="mt-1 block text-xs text-slate-500">
            Used to link your devices into one subscriber and to identify you
            for the admins. We don't send email — push notifications only.
          </span>
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700 mb-1">
            Campuses & groups
          </legend>
          <p className="text-xs text-slate-500 mb-2">
            Tap a campus to choose your groups.
          </p>
          <div className="space-y-2">
            {campuses.map((c) => {
              const campusGroups = groupsByCampus[c.slug] ?? [];
              const selectedCount = selected[c.slug]?.size ?? 0;
              return (
                <details
                  key={c.slug}
                  className="bg-white border border-slate-200 rounded-md"
                >
                  <summary className="cursor-pointer select-none px-3 py-2.5 flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      {c.name}
                    </span>
                    {selectedCount > 0 && (
                      <span className="text-xs font-medium text-emerald-700">
                        {selectedCount} selected
                      </span>
                    )}
                  </summary>
                  <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100 pt-2">
                    {campusGroups.length === 0 && (
                      <p className="text-xs text-slate-500">
                        No groups configured.
                      </p>
                    )}
                    {campusGroups.map((g) => (
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
                </details>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-slate-500">
          After you click Subscribe, your browser will ask for permission to
          show notifications. Allow it to finish enabling push.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enrolling…" : "Subscribe"}
        </button>
      </form>

      <details className="mt-8 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <summary className="cursor-pointer select-none font-medium text-slate-900">
          Notifications not working? Help by device
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            <strong>iPhone / iPad</strong> (iOS 16.4 or later required): push
            notifications only work after installing this page to your home
            screen. Tap the Share button at the bottom of Safari, then{" "}
            <em>Add to Home Screen</em>. Open the app from your home screen
            and Subscribe again from there.
          </p>
          <p>
            <strong>Android phone or tablet:</strong> push works in your
            browser — no install required. If you blocked the permission
            prompt, open this page's site settings and allow notifications.
            Optional: from the browser menu (⋮), tap <em>Install app</em> to
            add a home-screen shortcut.
          </p>
          <p>
            <strong>Computer</strong> (Chrome / Edge / Firefox / Safari on
            macOS): push works in any open browser tab — the tab doesn't need
            to be focused, and the browser window can be minimized. If you
            blocked notifications, click the lock or 🛈 icon in the address
            bar and re-enable them for this site.
          </p>
        </div>
      </details>
    </div>
  );
}
