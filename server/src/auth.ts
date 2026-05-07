import type { NextFunction, Request, Response } from "express";
import { pool } from "./db.js";
import { forbidden, unauthorized } from "./lib/httpError.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export type CurrentUser = {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  role: "admin" | "sender";
  active: boolean;
  campus_ids: number[];
};

declare global {
  // Resolved by requireUser; routes downstream can rely on req.user being set.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

export async function loadUser(userId: number): Promise<CurrentUser | null> {
  const { rows } = await pool.query<CurrentUser>(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.active,
            COALESCE(
              (SELECT array_agg(uc.campus_id ORDER BY uc.campus_id)
                 FROM user_campuses uc WHERE uc.user_id = u.id),
              ARRAY[]::int[]
            ) AS campus_ids
       FROM users u
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session.userId;
  if (!userId) return next(unauthorized());
  const user = await loadUser(userId);
  if (!user || !user.active) return next(unauthorized());
  req.user = user;
  next();
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== "admin") return next(forbidden("Admin only"));
  next();
}

// Senders may only act on a campus they're assigned to. Admins always pass.
export function userHasCampus(user: CurrentUser, campusId: number): boolean {
  if (user.role === "admin") return true;
  return user.campus_ids.includes(campusId);
}
