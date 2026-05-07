import webpush from "web-push";
import { pool } from "./db.js";
import { env } from "./env.js";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
  return true;
}

export function vapidPublicKey(): string {
  return env.vapidPublicKey;
}

export type PushPayload = {
  campusSlug: string;
  campusName: string;
  statusLabel: string;
  statusIcon?: string | null;
  message?: string | null;
  url?: string;
};

type Recipient = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

// Recipients = every push device whose subscriber is in *any* group on this campus.
async function recipientsForCampus(campusId: number): Promise<Recipient[]> {
  const { rows } = await pool.query<Recipient>(
    `SELECT DISTINCT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN subscribers s ON s.id = ps.subscriber_id AND s.active = TRUE
       JOIN subscriber_memberships sm ON sm.subscriber_id = s.id
       JOIN subscriber_groups g ON g.id = sm.group_id AND g.active = TRUE
      WHERE g.campus_id = $1`,
    [campusId],
  );
  return rows;
}

// Send a push notification to every subscriber for the given campus. Dead
// endpoints (404/410) are removed so they're not retried next time.
export async function sendPushForCampus(
  campusId: number,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const recipients = await recipientsForCampus(campusId);
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, skipped: false };
  }

  const body = JSON.stringify({
    title: `${payload.campusName}: ${payload.statusLabel}`,
    body: payload.message ?? "",
    icon: payload.statusIcon ?? undefined,
    url: payload.url ?? `/status/${payload.campusSlug}`,
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  const deadEndpointIds: number[] = [];

  await Promise.all(
    recipients.map(async (r) => {
      try {
        await webpush.sendNotification(
          { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
          body,
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          deadEndpointIds.push(r.id);
        } else {
          failed++;
          console.error("[webpush] send failed", status, err);
        }
      }
    }),
  );

  if (deadEndpointIds.length > 0) {
    await pool.query(
      "DELETE FROM push_subscriptions WHERE id = ANY($1::int[])",
      [deadEndpointIds],
    );
  }

  return { sent, failed, skipped: false };
}
