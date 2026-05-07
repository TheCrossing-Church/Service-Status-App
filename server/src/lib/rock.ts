import { env } from "../env.js";

// Validates a username/password against Rock RMS using its session-cookie
// auth endpoint. Returns the Rock person ID on success or null on failure.
//
// This function is intentionally minimal: we only need confirmation that the
// credentials are valid and a stable Rock identifier. Profile data (name,
// email, campus) is fetched separately the first time we provision a local
// user record for them.
export type RockAuthResult =
  | { ok: true; rockPersonId: number; email: string | null; displayName: string }
  | { ok: false };

export function rockEnabled(): boolean {
  return Boolean(env.rockBaseUrl);
}

export async function authenticateAgainstRock(
  username: string,
  password: string,
): Promise<RockAuthResult> {
  if (!rockEnabled()) return { ok: false };

  const base = env.rockBaseUrl.replace(/\/$/, "");
  const loginRes = await fetch(`${base}/api/Auth/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Username: username, Password: password, Persisted: false }),
  });
  if (!loginRes.ok) return { ok: false };

  const cookies = loginRes.headers.get("set-cookie") ?? "";
  if (!cookies) return { ok: false };

  // Use the session cookie to look up the current person.
  const meRes = await fetch(`${base}/api/People/GetCurrentPerson`, {
    method: "GET",
    headers: { Cookie: cookies, Accept: "application/json" },
  });
  if (!meRes.ok) return { ok: false };

  const me = (await meRes.json()) as {
    Id?: number;
    NickName?: string;
    FirstName?: string;
    LastName?: string;
    Email?: string;
  };
  if (!me?.Id) return { ok: false };

  const first = me.NickName ?? me.FirstName ?? "";
  const last = me.LastName ?? "";
  const displayName = [first, last].filter(Boolean).join(" ") || username;

  return {
    ok: true,
    rockPersonId: me.Id,
    email: me.Email ?? null,
    displayName,
  };
}
