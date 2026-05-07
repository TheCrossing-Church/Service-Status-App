import crypto from "node:crypto";
import { Router } from "express";
import { pool, withTransaction } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/httpError.js";
import {
  pushSubscriptionSchema,
  subscribeEnrollSchema,
} from "../lib/schemas.js";

export const subscribersRouter: Router = Router();

// Self-enrollment for staff/volunteers. Lightweight: name + email + the
// (campus, group) combinations they want to receive. Idempotent on email,
// so re-submitting from the form replaces their previous selections.
subscribersRouter.post(
  "/subscribers",
  asyncHandler(async (req, res) => {
    const body = subscribeEnrollSchema.parse(req.body);

    // Resolve each (campus_slug, group_slug) → group_id up front so we can
    // reject the whole request cleanly if any combination is invalid.
    const requestedGroupIds: number[] = [];
    for (const m of body.memberships) {
      const { rows } = await pool.query<{ group_id: number; group_slug: string }>(
        `SELECT g.id AS group_id, g.slug AS group_slug
           FROM subscriber_groups g
           JOIN campuses c ON c.id = g.campus_id
          WHERE c.slug = $1
            AND g.slug = ANY($2::text[])
            AND g.active = TRUE
            AND c.active = TRUE`,
        [m.campus_slug, m.group_slugs],
      );
      const found = new Set(rows.map((r) => r.group_slug));
      const missing = m.group_slugs.filter((s) => !found.has(s));
      if (missing.length > 0) {
        throw badRequest(
          `Unknown group(s) for ${m.campus_slug}: ${missing.join(", ")}`,
        );
      }
      for (const r of rows) requestedGroupIds.push(r.group_id);
    }

    const subscriber = await withTransaction(async (client) => {
      const { rows: subRows } = await client.query<{
        id: number;
        unsubscribe_token: string;
      }>(
        `INSERT INTO subscribers (email, display_name, unsubscribe_token)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               active = TRUE,
               updated_at = now()
         RETURNING id, unsubscribe_token`,
        [
          body.email.toLowerCase(),
          body.display_name,
          crypto.randomBytes(24).toString("base64url"),
        ],
      );
      const sub = subRows[0]!;

      // Replace memberships: delete then insert. Cleanest semantics for a
      // form submission that represents "this is my full preference list."
      await client.query(
        `DELETE FROM subscriber_memberships WHERE subscriber_id = $1`,
        [sub.id],
      );
      if (requestedGroupIds.length > 0) {
        await client.query(
          `INSERT INTO subscriber_memberships (subscriber_id, group_id)
             SELECT $1, g FROM unnest($2::int[]) AS g
           ON CONFLICT DO NOTHING`,
          [sub.id, requestedGroupIds],
        );
      }
      return sub;
    });

    res.status(201).json({
      subscriber: {
        id: subscriber.id,
        email: body.email.toLowerCase(),
        display_name: body.display_name,
        unsubscribe_token: subscriber.unsubscribe_token,
      },
    });
  }),
);

// Register a browser/device push subscription against an existing enrollment.
// The PWA calls this after the user accepts the browser permission prompt.
subscribersRouter.post(
  "/subscribers/push",
  asyncHandler(async (req, res) => {
    const body = pushSubscriptionSchema.parse(req.body);
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM subscribers WHERE email = $1 AND active = TRUE`,
      [body.email.toLowerCase()],
    );
    const subscriber = rows[0];
    if (!subscriber) throw notFound("Subscriber not found — enroll first");

    await pool.query(
      `INSERT INTO push_subscriptions
         (subscriber_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET subscriber_id = EXCLUDED.subscriber_id,
             p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent,
             last_seen_at = now()`,
      [
        subscriber.id,
        body.endpoint,
        body.p256dh,
        body.auth,
        body.user_agent ?? null,
      ],
    );

    res.status(201).json({ ok: true });
  }),
);

// One-click unsubscribe via opaque token (suitable for an emailed link if we
// add email later, and for a "leave" button in the PWA).
subscribersRouter.post(
  "/subscribers/unsubscribe",
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token ?? "");
    if (!token) throw badRequest("token is required");
    const { rowCount } = await pool.query(
      `UPDATE subscribers SET active = FALSE, updated_at = now()
        WHERE unsubscribe_token = $1`,
      [token],
    );
    if (rowCount === 0) throw notFound("Token not recognized");
    res.json({ ok: true });
  }),
);
