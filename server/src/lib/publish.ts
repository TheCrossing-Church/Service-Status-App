import { pool } from "../db.js";
import { broadcast } from "../realtime.js";
import { sendPushForCampus } from "../webpush.js";

export type PublishInput = {
  campusId: number;
  statusTypeId: number;
  message: string | null;
  sentVia: "web" | "webhook" | "system";
  sentByUserId?: number | null;
  apiTokenId?: number | null;
};

export type PublishResult = {
  status_update_id: number;
  campus: { id: number; slug: string; name: string };
  status_type: {
    id: number;
    slug: string;
    label: string;
    color: string | null;
    icon: string | null;
  };
  message: string | null;
  sent_via: "web" | "webhook" | "system";
  created_at: string;
};

// Inserts a status_updates row and fans out to SSE listeners + web push.
// All callers — the authenticated send route and the Stream Deck webhook —
// route through this so the side effects stay consistent.
//
// Implemented as INSERT … RETURNING followed by a small enrichment SELECT.
// (Postgres-style modifying CTEs aren't supported by SQLite for the form
// we'd want, so this is the portable shape.)
export async function publishStatusUpdate(
  input: PublishInput,
): Promise<PublishResult> {
  const { rows: insertedRows } = await pool.query<{
    id: number;
    campus_id: number;
    status_type_id: number;
    message: string | null;
    sent_via: "web" | "webhook" | "system";
    created_at: string;
  }>(
    `INSERT INTO status_updates
       (campus_id, status_type_id, message, sent_by_user_id, api_token_id, sent_via)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, campus_id, status_type_id, message, sent_via, created_at`,
    [
      input.campusId,
      input.statusTypeId,
      input.message,
      input.sentByUserId ?? null,
      input.apiTokenId ?? null,
      input.sentVia,
    ],
  );
  const inserted = insertedRows[0];
  if (!inserted) throw new Error("publishStatusUpdate: insert returned no row");

  const { rows: enrichedRows } = await pool.query<{
    campus_id: number;
    campus_slug: string;
    campus_name: string;
    status_type_id: number;
    status_slug: string;
    status_label: string;
    status_color: string | null;
    status_icon: string | null;
  }>(
    `SELECT c.id   AS campus_id,
            c.slug AS campus_slug,
            c.name AS campus_name,
            st.id    AS status_type_id,
            st.slug  AS status_slug,
            st.label AS status_label,
            st.color AS status_color,
            st.icon  AS status_icon
       FROM campuses c
       JOIN status_types st ON st.id = $2
      WHERE c.id = $1`,
    [inserted.campus_id, inserted.status_type_id],
  );
  const meta = enrichedRows[0];
  if (!meta) throw new Error("publishStatusUpdate: enrichment returned no row");

  const result: PublishResult = {
    status_update_id: inserted.id,
    campus: {
      id: meta.campus_id,
      slug: meta.campus_slug,
      name: meta.campus_name,
    },
    status_type: {
      id: meta.status_type_id,
      slug: meta.status_slug,
      label: meta.status_label,
      color: meta.status_color,
      icon: meta.status_icon,
    },
    message: inserted.message,
    sent_via: inserted.sent_via,
    created_at: inserted.created_at,
  };

  broadcast([meta.campus_slug, "*"], "status", result);

  // Web push fan-out is fire-and-forget — failures shouldn't fail the request.
  void sendPushForCampus(meta.campus_id, {
    campusSlug: meta.campus_slug,
    campusName: meta.campus_name,
    statusLabel: meta.status_label,
    statusIcon: meta.status_icon,
    message: inserted.message,
  }).catch((err) => console.error("[publish] push failed", err));

  return result;
}
