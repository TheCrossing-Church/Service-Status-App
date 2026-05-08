import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { Router } from "express";
import { requireAdmin, requireUser } from "../auth.js";
import { pool } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, notFound } from "../lib/httpError.js";
import {
  createTokenSchema,
  upsertCampusSchema,
  upsertGroupSchema,
  upsertStatusTypeSchema,
} from "../lib/schemas.js";
import { buildUpdateSet } from "../lib/sqlUpdate.js";

export const adminRouter: Router = Router();

adminRouter.use(requireUser, requireAdmin);

const NOW_SQL = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

// ──────────────── Campuses ────────────────

adminRouter.get(
  "/campuses",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, slug, name, code, timezone, service_window_start, service_window_end,
              active, created_at, updated_at
         FROM campuses
        ORDER BY name`,
    );
    res.json({ success: true, data: { campuses: rows } });
  }),
);

adminRouter.post(
  "/campuses",
  asyncHandler(async (req, res) => {
    const body = upsertCampusSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO campuses
         (slug, name, code, timezone, service_window_start, service_window_end, active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 1))
       RETURNING *`,
      [
        body.slug,
        body.name,
        body.code ?? null,
        body.timezone,
        body.service_window_start ?? null,
        body.service_window_end ?? null,
        body.active === undefined ? null : body.active ? 1 : 0,
      ],
    );
    res.status(201).json({ success: true, data: { campus: rows[0] } });
  }),
);

adminRouter.patch(
  "/campuses/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest("invalid id");
    const body = upsertCampusSchema.partial().parse(req.body);
    const { setClause, params, touched } = buildUpdateSet(
      {
        slug: body.slug,
        name: body.name,
        code: body.code,
        timezone: body.timezone,
        service_window_start: body.service_window_start,
        service_window_end: body.service_window_end,
        active: body.active,
      },
      2,
    );
    if (!touched) throw badRequest("no fields to update");
    const { rows } = await pool.query(
      `UPDATE campuses SET ${setClause}, updated_at = ${NOW_SQL}
        WHERE id = $1 RETURNING *`,
      [id, ...params],
    );
    if (rows.length === 0) throw notFound();
    res.json({ success: true, data: { campus: rows[0] } });
  }),
);

// ──────────────── Status types ────────────────

adminRouter.get(
  "/status-types",
  asyncHandler(async (req, res) => {
    const campusId = req.query.campus_id ? Number(req.query.campus_id) : null;
    const { rows } = await pool.query(
      campusId
        ? `SELECT * FROM status_types WHERE campus_id = $1 ORDER BY sort_order, label`
        : `SELECT * FROM status_types ORDER BY campus_id, sort_order, label`,
      campusId ? [campusId] : [],
    );
    res.json({ success: true, data: { status_types: rows } });
  }),
);

adminRouter.post(
  "/status-types",
  asyncHandler(async (req, res) => {
    const body = upsertStatusTypeSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO status_types
         (campus_id, slug, label, default_message, color, icon, sort_order, active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), COALESCE($8, 1))
       RETURNING *`,
      [
        body.campus_id,
        body.slug,
        body.label,
        body.default_message ?? null,
        body.color ?? null,
        body.icon ?? null,
        body.sort_order ?? null,
        body.active === undefined ? null : body.active ? 1 : 0,
      ],
    );
    res.status(201).json({ success: true, data: { status_type: rows[0] } });
  }),
);

adminRouter.patch(
  "/status-types/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest("invalid id");
    const body = upsertStatusTypeSchema.partial().parse(req.body);
    const { setClause, params, touched } = buildUpdateSet(
      {
        slug: body.slug,
        label: body.label,
        default_message: body.default_message,
        color: body.color,
        icon: body.icon,
        sort_order: body.sort_order,
        active: body.active,
      },
      2,
    );
    if (!touched) throw badRequest("no fields to update");
    const { rows } = await pool.query(
      `UPDATE status_types SET ${setClause}, updated_at = ${NOW_SQL}
        WHERE id = $1 RETURNING *`,
      [id, ...params],
    );
    if (rows.length === 0) throw notFound();
    res.json({ success: true, data: { status_type: rows[0] } });
  }),
);

// ──────────────── Subscriber groups ────────────────

adminRouter.get(
  "/groups",
  asyncHandler(async (req, res) => {
    const campusId = req.query.campus_id ? Number(req.query.campus_id) : null;
    const { rows } = await pool.query(
      campusId
        ? `SELECT * FROM subscriber_groups WHERE campus_id = $1 ORDER BY name`
        : `SELECT * FROM subscriber_groups ORDER BY campus_id, name`,
      campusId ? [campusId] : [],
    );
    res.json({ success: true, data: { groups: rows } });
  }),
);

adminRouter.post(
  "/groups",
  asyncHandler(async (req, res) => {
    const body = upsertGroupSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO subscriber_groups (campus_id, slug, name, active)
       VALUES ($1, $2, $3, COALESCE($4, 1))
       RETURNING *`,
      [
        body.campus_id,
        body.slug,
        body.name,
        body.active === undefined ? null : body.active ? 1 : 0,
      ],
    );
    res.status(201).json({ success: true, data: { group: rows[0] } });
  }),
);

adminRouter.patch(
  "/groups/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest("invalid id");
    const body = upsertGroupSchema.partial().parse(req.body);
    const { setClause, params, touched } = buildUpdateSet(
      {
        slug: body.slug,
        name: body.name,
        active: body.active,
      },
      2,
    );
    if (!touched) throw badRequest("no fields to update");
    const { rows } = await pool.query(
      `UPDATE subscriber_groups SET ${setClause}, updated_at = ${NOW_SQL}
        WHERE id = $1 RETURNING *`,
      [id, ...params],
    );
    if (rows.length === 0) throw notFound();
    res.json({ success: true, data: { group: rows[0] } });
  }),
);

// ──────────────── API tokens ────────────────

adminRouter.get(
  "/api-tokens",
  asyncHandler(async (req, res) => {
    const campusId = req.query.campus_id ? Number(req.query.campus_id) : null;
    const { rows } = await pool.query(
      `SELECT t.id, t.campus_id, t.label, t.prefix, t.last_used_at,
              t.revoked_at, t.created_at, c.slug AS campus_slug, c.name AS campus_name
         FROM api_tokens t
         JOIN campuses c ON c.id = t.campus_id
         ${campusId ? "WHERE t.campus_id = $1" : ""}
        ORDER BY t.created_at DESC`,
      campusId ? [campusId] : [],
    );
    res.json({ success: true, data: { tokens: rows } });
  }),
);

adminRouter.post(
  "/api-tokens",
  asyncHandler(async (req, res) => {
    const body = createTokenSchema.parse(req.body);
    // Generate a long random token. We store only the bcrypt hash and a short
    // prefix for display, so the raw token is shown ONCE in this response and
    // never again — the admin must copy it now.
    const raw = `spt_${crypto.randomBytes(24).toString("base64url")}`;
    const tokenHash = await bcrypt.hash(raw, 12);
    const prefix = raw.slice(0, 8);

    const { rows } = await pool.query(
      `INSERT INTO api_tokens (campus_id, label, token_hash, prefix, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, campus_id, label, prefix, last_used_at, revoked_at, created_at`,
      [body.campus_id, body.label, tokenHash, prefix, req.user!.id],
    );
    res
      .status(201)
      .json({ success: true, data: { token: rows[0], plaintext: raw } });
  }),
);

adminRouter.post(
  "/api-tokens/:id/revoke",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest("invalid id");
    const { rows } = await pool.query(
      `UPDATE api_tokens
          SET revoked_at = ${NOW_SQL}
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, prefix, revoked_at`,
      [id],
    );
    if (rows.length === 0) throw notFound("Token not found or already revoked");
    res.json({ success: true, data: { token: rows[0] } });
  }),
);

// ──────────────── Subscribers + history (read-only) ────────────────

adminRouter.get(
  "/subscribers",
  asyncHandler(async (_req, res) => {
    // Two-pass fetch (subscribers + memberships separately) since SQLite
    // doesn't have json_agg/array_agg. Group on the JS side.
    const { rows: subscribers } = await pool.query<{
      id: number;
      email: string;
      display_name: string;
      active: number;
      created_at: string;
      device_count: number;
    }>(
      `SELECT s.id, s.email, s.display_name, s.active, s.created_at,
              (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.subscriber_id = s.id)
                AS device_count
         FROM subscribers s
        ORDER BY s.created_at DESC`,
    );

    const { rows: memberships } = await pool.query<{
      subscriber_id: number;
      campus_slug: string;
      group_slug: string;
      group_name: string;
    }>(
      `SELECT sm.subscriber_id,
              c.slug AS campus_slug,
              g.slug AS group_slug,
              g.name AS group_name
         FROM subscriber_memberships sm
         JOIN subscriber_groups g ON g.id = sm.group_id
         JOIN campuses c          ON c.id = g.campus_id`,
    );

    const byUser = new Map<
      number,
      { campus_slug: string; group_slug: string; group_name: string }[]
    >();
    for (const m of memberships) {
      const arr = byUser.get(m.subscriber_id) ?? [];
      arr.push({
        campus_slug: m.campus_slug,
        group_slug: m.group_slug,
        group_name: m.group_name,
      });
      byUser.set(m.subscriber_id, arr);
    }

    const result = subscribers.map((s) => ({
      ...s,
      memberships: byUser.get(s.id) ?? [],
    }));

    res.json({ success: true, data: { subscribers: result } });
  }),
);

adminRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const campusId = req.query.campus_id ? Number(req.query.campus_id) : null;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const { rows } = await pool.query(
      `SELECT su.id, su.message, su.sent_via, su.created_at,
              c.slug AS campus_slug, c.name AS campus_name,
              st.slug AS status_slug, st.label AS status_label,
              st.color AS status_color, st.icon AS status_icon,
              u.username AS sent_by_username,
              u.display_name AS sent_by_display_name,
              t.label AS api_token_label, t.prefix AS api_token_prefix
         FROM status_updates su
         JOIN campuses c     ON c.id = su.campus_id
         JOIN status_types st ON st.id = su.status_type_id
         LEFT JOIN users u   ON u.id = su.sent_by_user_id
         LEFT JOIN api_tokens t ON t.id = su.api_token_id
         ${campusId ? "WHERE su.campus_id = $1" : ""}
        ORDER BY su.created_at DESC
        LIMIT ${limit}`,
      campusId ? [campusId] : [],
    );
    res.json({ success: true, data: { history: rows } });
  }),
);
