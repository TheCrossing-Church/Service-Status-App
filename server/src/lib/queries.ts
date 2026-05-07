import type { Queryable } from "../db.js";

export type Campus = {
  id: number;
  slug: string;
  name: string;
  timezone: string;
  active: boolean;
};

export type StatusType = {
  id: number;
  campus_id: number;
  slug: string;
  label: string;
  default_message: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  active: boolean;
};

export type CurrentStatus = {
  campus_id: number;
  campus_slug: string;
  campus_name: string;
  status_update_id: number | null;
  status_type_id: number | null;
  status_slug: string | null;
  status_label: string | null;
  status_color: string | null;
  status_icon: string | null;
  message: string | null;
  sent_via: "web" | "webhook" | "system" | null;
  created_at: string | null;
};

// Resolve "current status" by joining campuses to the most recent status_updates
// row for each campus (LEFT JOIN so brand-new campuses with no history still appear).
export async function fetchCurrentStatuses(
  db: Queryable,
  opts?: { campusSlug?: string },
): Promise<CurrentStatus[]> {
  const params: unknown[] = [];
  let where = "WHERE c.active = TRUE";
  if (opts?.campusSlug) {
    params.push(opts.campusSlug);
    where += ` AND c.slug = $${params.length}`;
  }

  const sql = `
    SELECT c.id   AS campus_id,
           c.slug AS campus_slug,
           c.name AS campus_name,
           latest.id AS status_update_id,
           latest.status_type_id,
           st.slug  AS status_slug,
           st.label AS status_label,
           st.color AS status_color,
           st.icon  AS status_icon,
           latest.message,
           latest.sent_via,
           latest.created_at
      FROM campuses c
      LEFT JOIN LATERAL (
        SELECT su.*
          FROM status_updates su
         WHERE su.campus_id = c.id
         ORDER BY su.created_at DESC
         LIMIT 1
      ) latest ON TRUE
      LEFT JOIN status_types st ON st.id = latest.status_type_id
      ${where}
     ORDER BY c.name
  `;
  const { rows } = await db.query<CurrentStatus>(sql, params);
  return rows;
}

export async function fetchCampusBySlug(
  db: Queryable,
  slug: string,
): Promise<Campus | null> {
  const { rows } = await db.query<Campus>(
    `SELECT id, slug, name, timezone, active
       FROM campuses WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function fetchCampusById(
  db: Queryable,
  id: number,
): Promise<Campus | null> {
  const { rows } = await db.query<Campus>(
    `SELECT id, slug, name, timezone, active
       FROM campuses WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function fetchStatusTypesForCampus(
  db: Queryable,
  campusId: number,
  opts: { onlyActive?: boolean } = {},
): Promise<StatusType[]> {
  const onlyActive = opts.onlyActive ?? true;
  const { rows } = await db.query<StatusType>(
    `SELECT id, campus_id, slug, label, default_message, color, icon, sort_order, active
       FROM status_types
      WHERE campus_id = $1 ${onlyActive ? "AND active = TRUE" : ""}
      ORDER BY sort_order, label`,
    [campusId],
  );
  return rows;
}
