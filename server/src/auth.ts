import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { env } from "./env.js";
import { forbidden, unauthorized } from "./lib/httpError.js";

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

type TokenPayload = { uid: number };

// JWTs carry only the user id; everything else is loaded from the DB on each
// request. That keeps the token small and lets us deactivate users without
// managing a token denylist. Using `uid` instead of the standard `sub` claim
// so we can keep it typed as a number — `sub` is conventionally a string.
export function signUserToken(userId: number): string {
  return jwt.sign({ uid: userId } satisfies TokenPayload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyUserToken(token: string): number | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === "object" && decoded !== null && "uid" in decoded) {
      const uid = (decoded as TokenPayload).uid;
      if (typeof uid === "number" && Number.isInteger(uid)) return uid;
    }
    return null;
  } catch {
    return null;
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

function bearerFrom(req: Request): string | null {
  const auth = req.header("authorization");
  if (!auth) return null;
  const [scheme, token] = auth.split(" ", 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export async function requireUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = bearerFrom(req);
  if (!token) return next(unauthorized());
  const userId = verifyUserToken(token);
  if (userId === null) return next(unauthorized());
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
