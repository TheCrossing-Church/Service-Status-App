import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { notFound } from "../lib/httpError.js";
import {
  fetchCampusBySlug,
  fetchCurrentStatuses,
  fetchStatusTypesForCampus,
} from "../lib/queries.js";
import { addClient, removeClient } from "../realtime.js";
import { vapidPublicKey } from "../webpush.js";

export const statusRouter: Router = Router();

// Apply noindex headers to anything served from this router so the public
// status page can't be picked up by search engines.
statusRouter.use((_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

statusRouter.get(
  "/campuses",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, slug, name, code, timezone
         FROM campuses
        WHERE active = 1
        ORDER BY name`,
    );
    res.json({ success: true, data: { campuses: rows } });
  }),
);

// Current status for one or all campuses. ?campus=<slug> filters; otherwise
// returns every active campus's current status (or null if it has none yet).
statusRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const campus =
      typeof req.query.campus === "string" ? req.query.campus : undefined;
    const statuses = await fetchCurrentStatuses(pool, { campusSlug: campus });
    res.json({ success: true, data: { statuses } });
  }),
);

statusRouter.get(
  "/status/:campusSlug",
  asyncHandler(async (req, res) => {
    const campusSlug = req.params.campusSlug;
    const [status] = await fetchCurrentStatuses(pool, { campusSlug });
    if (!status) throw notFound("Campus not found");
    res.json({ success: true, data: { status } });
  }),
);

// Status type catalog for a campus — used by the sender UI to render buttons.
statusRouter.get(
  "/campuses/:slug/status-types",
  asyncHandler(async (req, res) => {
    const campus = await fetchCampusBySlug(pool, req.params.slug ?? "");
    if (!campus) throw notFound("Campus not found");
    const types = await fetchStatusTypesForCampus(pool, campus.id);
    res.json({ success: true, data: { status_types: types } });
  }),
);

// Send history (public read of recent updates per campus) — capped at last 50.
statusRouter.get(
  "/campuses/:slug/history",
  asyncHandler(async (req, res) => {
    const campus = await fetchCampusBySlug(pool, req.params.slug ?? "");
    if (!campus) throw notFound("Campus not found");
    const { rows } = await pool.query(
      `SELECT su.id, su.message, su.sent_via, su.created_at,
              st.slug AS status_slug, st.label AS status_label,
              st.color AS status_color, st.icon AS status_icon,
              u.display_name AS sent_by_display_name
         FROM status_updates su
         JOIN status_types st ON st.id = su.status_type_id
         LEFT JOIN users u ON u.id = su.sent_by_user_id
        WHERE su.campus_id = $1
        ORDER BY su.created_at DESC
        LIMIT 50`,
      [campus.id],
    );
    res.json({ success: true, data: { history: rows } });
  }),
);

// SSE stream. Clients can scope to a campus via ?campus=<slug>; without it,
// they listen to the wildcard room and receive updates for every campus.
statusRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders?.();

    const campus =
      typeof req.query.campus === "string" ? req.query.campus : undefined;
    const rooms = campus ? [campus] : ["*"];
    const id = addClient(res, rooms);
    req.on("close", () => removeClient(id));

    // Send a snapshot immediately so clients have current state on connect.
    const snapshot = await fetchCurrentStatuses(pool, { campusSlug: campus });
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({ statuses: snapshot })}\n\n`,
    );
  }),
);

// Public VAPID key for the PWA's push registration flow.
statusRouter.get("/push/public-key", (_req, res) => {
  res.json({ success: true, data: { key: vapidPublicKey() || null } });
});
