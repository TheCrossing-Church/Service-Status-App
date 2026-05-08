import bcrypt from "bcrypt";
import { Router } from "express";
import { pool } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { notFound, unauthorized } from "../lib/httpError.js";
import { publishStatusUpdate } from "../lib/publish.js";
import { triggerSchema } from "../lib/schemas.js";

export const triggerRouter: Router = Router();

// POST /api/trigger
//
// Stream Deck / Bitfocus Companion webhook. Atomic, no freeform text by
// design (the PRD calls this out). Token may be supplied either in the body
// (Companion's typical setup) or as a Bearer header. We store only bcrypt
// hashes of tokens, so verification scans active tokens for the campus and
// runs bcrypt.compare against each.
triggerRouter.post(
  "/trigger",
  asyncHandler(async (req, res) => {
    const headerToken = (() => {
      const auth = req.header("authorization");
      if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
      return undefined;
    })();
    const body = triggerSchema.parse({
      campus: req.body?.campus,
      status: req.body?.status,
      token: req.body?.token ?? headerToken ?? "",
      message: req.body?.message,
    });

    const { rows: campusRows } = await pool.query<{
      id: number;
      active: number;
    }>(
      `SELECT id, active FROM campuses WHERE slug = $1`,
      [body.campus],
    );
    const campus = campusRows[0];
    if (!campus || !campus.active) throw notFound("Campus not found");

    // Active tokens for this campus only — a token from another campus must
    // not authenticate a trigger here.
    const { rows: tokenRows } = await pool.query<{
      id: number;
      token_hash: string;
    }>(
      `SELECT id, token_hash FROM api_tokens
        WHERE campus_id = $1 AND revoked_at IS NULL`,
      [campus.id],
    );

    let matchedTokenId: number | null = null;
    for (const t of tokenRows) {
      // bcrypt.compare is constant-time on the hash side; fine to loop.
      if (await bcrypt.compare(body.token, t.token_hash)) {
        matchedTokenId = t.id;
        break;
      }
    }
    if (matchedTokenId === null) throw unauthorized("Invalid token");

    const { rows: stRows } = await pool.query<{
      id: number;
      active: number;
      default_message: string | null;
    }>(
      `SELECT id, active, default_message FROM status_types
        WHERE campus_id = $1 AND slug = $2`,
      [campus.id, body.status],
    );
    const st = stRows[0];
    if (!st || !st.active) throw notFound("Status type not found");

    // Default message lookup happens at the type level; webhooks are atomic
    // (no freeform per PRD), but if a default_message is configured we use it.
    const message = body.message ?? st.default_message ?? null;

    await pool.query(
      `UPDATE api_tokens
          SET last_used_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = $1`,
      [matchedTokenId],
    );

    const result = await publishStatusUpdate({
      campusId: campus.id,
      statusTypeId: st.id,
      message,
      sentVia: "webhook",
      apiTokenId: matchedTokenId,
    });
    res.status(201).json({ success: true, data: result });
  }),
);
