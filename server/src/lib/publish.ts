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
export async function publishStatusUpdate(
  input: PublishInput,
): Promise<PublishResult> {
  const { rows } = await pool.query<{
    id: number;
    created_at: string;
    campus_id: number;
    campus_slug: string;
    campus_name: string;
    status_type_id: number;
    status_slug: string;
    status_label: string;
    status_color: string | null;
    status_icon: string | null;
    message: string | null;
    sent_via: "web" | "webhook" | "system";
  }>(
    `WITH inserted AS (
       INSERT INTO status_updates
         (campus_id, status_type_id, message, sent_by_user_id, api_token_id, sent_via)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, campus_id, status_type_id, message, sent_via, created_at,
                 sent_by_user_id, api_token_id
     )
     SELECT i.id, i.created_at, i.message, i.sent_via,
            c.id   AS campus_id,
            c.slug AS campus_slug,
            c.name AS campus_name,
            st.id    AS status_type_id,
            st.slug  AS status_slug,
            st.label AS status_label,
            st.color AS status_color,
            st.icon  AS status_icon
       FROM inserted i
       JOIN campuses c     ON c.id = i.campus_id
       JOIN status_types st ON st.id = i.status_type_id`,
    [
      input.campusId,
      input.statusTypeId,
      input.message,
      input.sentByUserId ?? null,
      input.apiTokenId ?? null,
      input.sentVia,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error("publishStatusUpdate: insert returned no row");

  const result: PublishResult = {
    status_update_id: row.id,
    campus: {
      id: row.campus_id,
      slug: row.campus_slug,
      name: row.campus_name,
    },
    status_type: {
      id: row.status_type_id,
      slug: row.status_slug,
      label: row.status_label,
      color: row.status_color,
      icon: row.status_icon,
    },
    message: row.message,
    sent_via: row.sent_via,
    created_at: row.created_at,
  };

  // SSE: broadcast to the campus room and the wildcard "*".
  broadcast([row.campus_slug, "*"], "status", result);

  // Web push fan-out is fire-and-forget — failures shouldn't fail the request.
  void sendPushForCampus(row.campus_id, {
    campusSlug: row.campus_slug,
    campusName: row.campus_name,
    statusLabel: row.status_label,
    statusIcon: row.status_icon,
    message: row.message,
  }).catch((err) => console.error("[publish] push failed", err));

  return result;
}
