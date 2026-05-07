import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { pool, withTransaction } from "../src/db.js";

// Names + slugs sourced from CLAUDE.md. Codes (CFD/FEN/GRT/MID) aren't
// modeled as a separate column yet — add one if Rock RMS sync needs it.
const CAMPUSES = [
  { slug: "chesterfield", name: "Chesterfield" },
  { slug: "fenton", name: "Fenton" },
  { slug: "grants-trail", name: "Grant's Trail" },
  { slug: "mid-rivers", name: "Mid Rivers" },
];

const DEFAULT_STATUS_TYPES = [
  {
    slug: "on-time",
    label: "On Time",
    icon: "✅",
    color: "#22c55e",
    default_message: "Service is on time.",
    sort_order: 10,
  },
  {
    slug: "running-late",
    label: "Running Late",
    icon: "⏱",
    color: "#f59e0b",
    default_message: "Service is running approximately 5–10 minutes late.",
    sort_order: 20,
  },
  {
    slug: "ending-early",
    label: "Ending Early",
    icon: "🏁",
    color: "#3b82f6",
    default_message: "Service is ending early today.",
    sort_order: 30,
  },
];

const DEFAULT_GROUPS = [
  { slug: "in-service", name: "In-Service Staff & Volunteers" },
  { slug: "hospitality", name: "Hospitality Staff & Volunteers" },
  { slug: "kids", name: "Kids Staff & Volunteers" },
];

async function seed(): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow!";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12);

  await withTransaction(async (client) => {
    // Campuses — idempotent on slug.
    const campusIds = new Map<string, number>();
    for (const c of CAMPUSES) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO campuses (slug, name)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [c.slug, c.name],
      );
      campusIds.set(c.slug, rows[0]!.id);
    }

    // Per-campus status types and groups.
    for (const [, campusId] of campusIds) {
      for (const t of DEFAULT_STATUS_TYPES) {
        await client.query(
          `INSERT INTO status_types
             (campus_id, slug, label, default_message, color, icon, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (campus_id, slug) DO NOTHING`,
          [
            campusId,
            t.slug,
            t.label,
            t.default_message,
            t.color,
            t.icon,
            t.sort_order,
          ],
        );
      }
      for (const g of DEFAULT_GROUPS) {
        await client.query(
          `INSERT INTO subscriber_groups (campus_id, slug, name)
           VALUES ($1, $2, $3)
           ON CONFLICT (campus_id, slug) DO NOTHING`,
          [campusId, g.slug, g.name],
        );
      }
    }

    // Bootstrap admin (idempotent on username; password updated each seed).
    const { rows: adminRows } = await client.query<{ id: number }>(
      `INSERT INTO users (username, email, display_name, role, password_hash)
       VALUES ($1, $2, $3, 'admin', $4)
       ON CONFLICT (username) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             updated_at = now()
       RETURNING id`,
      ["admin", "it@thecrossing.church", "IT Admin", adminPasswordHash],
    );
    const adminId = adminRows[0]!.id;

    // Admin gets every campus.
    for (const campusId of campusIds.values()) {
      await client.query(
        `INSERT INTO user_campuses (user_id, campus_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [adminId, campusId],
      );
    }

    // Per-campus sender (sender-<slug>) with same dev password — easy local testing.
    for (const [slug, campusId] of campusIds) {
      const senderUsername = `sender-${slug}`;
      const { rows: senderRows } = await client.query<{ id: number }>(
        `INSERT INTO users (username, display_name, role, password_hash)
         VALUES ($1, $2, 'sender', $3)
         ON CONFLICT (username) DO UPDATE
           SET password_hash = EXCLUDED.password_hash,
               updated_at = now()
         RETURNING id`,
        [senderUsername, `${slug} Sender`, adminPasswordHash],
      );
      await client.query(
        `INSERT INTO user_campuses (user_id, campus_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [senderRows[0]!.id, campusId],
      );
    }

    // Demo subscriber wired into Chesterfield's in-service group.
    const { rows: subRows } = await client.query<{ id: number }>(
      `INSERT INTO subscribers (email, display_name, unsubscribe_token)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             updated_at = now()
       RETURNING id`,
      [
        "demo@thecrossing.church",
        "Demo Subscriber",
        crypto.randomBytes(24).toString("base64url"),
      ],
    );
    const subId = subRows[0]!.id;

    const { rows: groupRows } = await client.query<{ id: number }>(
      `SELECT g.id
         FROM subscriber_groups g
         JOIN campuses c ON c.id = g.campus_id
        WHERE c.slug = 'chesterfield' AND g.slug = 'in-service'`,
    );
    if (groupRows[0]) {
      await client.query(
        `INSERT INTO subscriber_memberships (subscriber_id, group_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [subId, groupRows[0].id],
      );
    }
  });

  console.log("[seed] complete");
  console.log(`[seed] admin login: admin / ${adminPassword}`);
  console.log("[seed] sender logins: sender-<campus> / same password");
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[seed] failed", err);
    pool.end().finally(() => process.exit(1));
  });
