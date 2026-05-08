import { Router } from "express";
import { requireUser, userHasCampus } from "../auth.js";
import { pool } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../lib/httpError.js";
import { publishStatusUpdate } from "../lib/publish.js";
import {
  fetchCampusById,
  fetchCampusBySlug,
} from "../lib/queries.js";
import { sendStatusSchema } from "../lib/schemas.js";

export const sendRouter: Router = Router();

// Authenticated send endpoint used by the web UI. Accepts either ids or slugs
// to make it easy to wire up from a typed frontend or hand-rolled curl.
sendRouter.post(
  "/status",
  requireUser,
  asyncHandler(async (req, res) => {
    const body = sendStatusSchema.parse(req.body);

    const campus = body.campus_id
      ? await fetchCampusById(pool, body.campus_id)
      : body.campus_slug
        ? await fetchCampusBySlug(pool, body.campus_slug)
        : null;
    if (!campus) throw badRequest("campus_id or campus_slug is required");
    if (!campus.active) throw badRequest("Campus is inactive");
    if (!userHasCampus(req.user!, campus.id)) {
      throw forbidden("You are not assigned to this campus");
    }

    let statusTypeId: number | null = null;
    if (body.status_type_id) {
      const { rows } = await pool.query<{ id: number; active: number }>(
        `SELECT id, active FROM status_types
          WHERE id = $1 AND campus_id = $2`,
        [body.status_type_id, campus.id],
      );
      if (!rows[0]) throw notFound("Status type not found for campus");
      if (!rows[0].active) throw badRequest("Status type is inactive");
      statusTypeId = rows[0].id;
    } else if (body.status_slug) {
      const { rows } = await pool.query<{ id: number; active: number }>(
        `SELECT id, active FROM status_types
          WHERE slug = $1 AND campus_id = $2`,
        [body.status_slug, campus.id],
      );
      if (!rows[0]) throw notFound("Status type not found for campus");
      if (!rows[0].active) throw badRequest("Status type is inactive");
      statusTypeId = rows[0].id;
    } else {
      throw badRequest("status_type_id or status_slug is required");
    }

    const result = await publishStatusUpdate({
      campusId: campus.id,
      statusTypeId,
      message: body.message ?? null,
      sentVia: "web",
      sentByUserId: req.user!.id,
    });
    res.status(201).json({ success: true, data: result });
  }),
);
