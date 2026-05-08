import type { Queryable } from "../db.js";

export type Campus = {
  id: number;
  slug: string;
  name: string;
  code: string | null;
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
  campus_code: string | null;
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

// "Current status per campus" via a window function — pick the most recent
// status_updates row per campus. SQLite ≥ 3.25 supports ROW_NUMBER OVER.
// LEFT JOIN ensures campuses with no history still appear (with NULLs).
export async function fetchCurrentStatuses(
  db: Queryable,
  opts?: { campusSlug?: string },
): Promise<CurrentStatus[]> {
  const params: unknown[] = [];
  let where = "WHERE c.active = 1";
  if (opts?.campusSlug) {
    params.push(opts.campusSlug);
    where += ` AND c.slug = $${params.length}`;
  }

  const sql = `
    SELECT * FROM (
      SELECT c.id   AS campus_id,
             c.slug AS campus_slug,
             c.name AS campus_name,
             c.code AS campus_code,
             su.id  AS status_update_id,
             su.status_type_id,
             st.slug  AS status_slug,
             st.label AS status_label,
             st.color AS status_color,
             st.icon  AS status_icon,
             su.message,
             su.sent_via,
             su.created_at,
             ROW_NUMBER() OVER (
               PARTITION BY c.id
               ORDER BY su.created_at DESC
             ) AS rn
        FROM campuses c
        LEFT JOIN status_updates su ON su.campus_id = c.id
        LEFT JOIN status_types st  ON st.id = su.status_type_id
        ${where}
    )
    WHERE rn = 1
    ORDER BY campus_name
  `;
  const { rows } = await db.query<CurrentStatus & { rn: number }>(sql, params);
  return rows.map((r) => {
    const { rn: _rn, ...rest } = r;
    return rest;
  });
}

type CampusRow = Omit<Campus, "active"> & { active: number };
type StatusTypeRow = Omit<StatusType, "active"> & { active: number };

export async function fetchCampusBySlug(
  db: Queryable,
  slug: string,
): Promise<Campus | null> {
  const { rows } = await db.query<CampusRow>(
    `SELECT id, slug, name, code, timezone, active
       FROM campuses WHERE slug = $1`,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, active: Boolean(row.active) };
}

export async function fetchCampusById(
  db: Queryable,
  id: number,
): Promise<Campus | null> {
  const { rows } = await db.query<CampusRow>(
    `SELECT id, slug, name, code, timezone, active
       FROM campuses WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, active: Boolean(row.active) };
}

export async function fetchStatusTypesForCampus(
  db: Queryable,
  campusId: number,
  opts: { onlyActive?: boolean } = {},
): Promise<StatusType[]> {
  const onlyActive = opts.onlyActive ?? true;
  const { rows } = await db.query<StatusTypeRow>(
    `SELECT id, campus_id, slug, label, default_message, color, icon, sort_order, active
       FROM status_types
      WHERE campus_id = $1 ${onlyActive ? "AND active = 1" : ""}
      ORDER BY sort_order, label`,
    [campusId],
  );
  return rows.map((r) => ({ ...r, active: Boolean(r.active) }));
}
