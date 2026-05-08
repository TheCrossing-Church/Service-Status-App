import { clearSession, getToken } from "../auth/store";
import type {
  ApiTokenRow,
  Campus,
  CurrentStatus,
  CurrentUser,
  HistoryEntry,
  LoginResponse,
  StatusType,
  StatusUpdate,
  SubscriberGroup,
  SubscriberRow,
} from "./types";

// Centralized fetch wrapper. Reads the JWT from localStorage on every call
// (so a login/logout in another tab takes effect on next request), unwraps
// the `{ success, data }` envelope, and surfaces backend error messages.

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: unknown };

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });

  // Auth failures: nuke the cached session so guards redirect to /login.
  if (res.status === 401) {
    clearSession();
    throw new ApiError(401, "Unauthorized");
  }

  let body: Envelope<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as Envelope<T>;
    } catch {
      throw new ApiError(res.status, `Non-JSON response (${res.status})`);
    }
  }

  if (!res.ok || !body || body.success === false) {
    const msg =
      body && body.success === false
        ? body.error
        : `HTTP ${res.status}`;
    const details = body && body.success === false ? body.details : undefined;
    throw new ApiError(res.status, msg, details);
  }

  return body.data;
}

// ─── Auth ─────────────────────────────────────────────────────────────
export const api = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: CurrentUser }>("/api/auth/me"),

  // ─── Public status ──────────────────────────────────────────────────
  campuses: () => request<{ campuses: Campus[] }>("/api/campuses"),
  currentStatuses: (campusSlug?: string) =>
    request<{ statuses: CurrentStatus[] }>(
      campusSlug
        ? `/api/status?campus=${encodeURIComponent(campusSlug)}`
        : "/api/status",
    ),
  campusStatusTypes: (campusSlug: string) =>
    request<{ status_types: StatusType[] }>(
      `/api/campuses/${encodeURIComponent(campusSlug)}/status-types`,
    ),
  campusHistory: (campusSlug: string) =>
    request<{ history: HistoryEntry[] }>(
      `/api/campuses/${encodeURIComponent(campusSlug)}/history`,
    ),
  vapidPublicKey: () =>
    request<{ key: string | null }>("/api/push/public-key"),

  // ─── Sender ─────────────────────────────────────────────────────────
  sendStatus: (input: {
    campus_id?: number;
    campus_slug?: string;
    status_type_id?: number;
    status_slug?: string;
    message?: string | null;
  }) =>
    request<StatusUpdate>("/api/status", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // ─── Subscribers ────────────────────────────────────────────────────
  enrollSubscriber: (input: {
    email: string;
    display_name: string;
    memberships: { campus_slug: string; group_slugs: string[] }[];
  }) =>
    request<{
      subscriber: {
        id: number;
        email: string;
        display_name: string;
        unsubscribe_token: string;
      };
    }>("/api/subscribers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  registerPushSubscription: (input: {
    email: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent?: string;
  }) =>
    request<{ ok: boolean }>("/api/subscribers/push", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  unsubscribe: (token: string) =>
    request<{ ok: boolean }>("/api/subscribers/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  // ─── Admin ──────────────────────────────────────────────────────────
  adminCampuses: () =>
    request<{ campuses: Campus[] }>("/api/admin/campuses"),
  adminStatusTypes: (campusId?: number) =>
    request<{ status_types: StatusType[] }>(
      campusId
        ? `/api/admin/status-types?campus_id=${campusId}`
        : "/api/admin/status-types",
    ),
  adminGroups: (campusId?: number) =>
    request<{ groups: SubscriberGroup[] }>(
      campusId
        ? `/api/admin/groups?campus_id=${campusId}`
        : "/api/admin/groups",
    ),
  adminApiTokens: () =>
    request<{ tokens: ApiTokenRow[] }>("/api/admin/api-tokens"),
  adminCreateApiToken: (campus_id: number, label: string) =>
    request<{ token: ApiTokenRow; plaintext: string }>(
      "/api/admin/api-tokens",
      {
        method: "POST",
        body: JSON.stringify({ campus_id, label }),
      },
    ),
  adminRevokeApiToken: (id: number) =>
    request<{ token: { id: number; prefix: string; revoked_at: string } }>(
      `/api/admin/api-tokens/${id}/revoke`,
      { method: "POST" },
    ),
  adminSubscribers: () =>
    request<{ subscribers: SubscriberRow[] }>("/api/admin/subscribers"),
  adminHistory: (campusId?: number) =>
    request<{
      history: (HistoryEntry & {
        campus_slug: string;
        campus_name: string;
        sent_by_username: string | null;
        api_token_label: string | null;
        api_token_prefix: string | null;
      })[];
    }>(
      campusId
        ? `/api/admin/history?campus_id=${campusId}`
        : "/api/admin/history",
    ),
};
