import bcrypt from "bcrypt";
import { Router } from "express";
import { loadUser, requireUser, signUserToken } from "../auth.js";
import { pool } from "../db.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { unauthorized } from "../lib/httpError.js";
import { authenticateAgainstRock, rockEnabled } from "../lib/rock.js";
import { loginSchema } from "../lib/schemas.js";

export const authRouter: Router = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);

    // Strategy: Rock RMS first when configured, then fall back to a local
    // password_hash. This lets us boot without Rock (dev/admin bootstrap) and
    // also gracefully handle accounts that aren't tied to Rock yet.
    let userId: number | null = null;

    if (rockEnabled()) {
      const rock = await authenticateAgainstRock(username, password);
      if (rock.ok) {
        // Upsert by rock_person_id, falling back to username.
        const { rows } = await pool.query<{ id: number }>(
          `INSERT INTO users (username, email, display_name, role, rock_person_id)
             VALUES ($1, $2, $3, 'sender', $4)
           ON CONFLICT (rock_person_id) DO UPDATE
             SET username = EXCLUDED.username,
                 email = EXCLUDED.email,
                 display_name = EXCLUDED.display_name,
                 updated_at = now()
             RETURNING id`,
          [username, rock.email, rock.displayName, rock.rockPersonId],
        );
        userId = rows[0]?.id ?? null;
      }
    }

    if (userId === null) {
      const { rows } = await pool.query<{
        id: number;
        password_hash: string | null;
        active: boolean;
      }>(
        `SELECT id, password_hash, active FROM users WHERE username = $1`,
        [username],
      );
      const row = rows[0];
      if (row?.password_hash && row.active) {
        const ok = await bcrypt.compare(password, row.password_hash);
        if (ok) userId = row.id;
      }
    }

    if (userId === null) throw unauthorized("Invalid credentials");

    const user = await loadUser(userId);
    const token = signUserToken(userId);
    res.json({ token, user });
  }),
);

// JWTs are stateless — logout is a client-side concern (drop the token).
// Endpoint exists so the frontend has a single, predictable place to call.
authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireUser,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  }),
);
