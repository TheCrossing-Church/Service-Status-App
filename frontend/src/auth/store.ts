import type { CurrentUser } from "../api/types";

// JWT + cached user record live in localStorage so the page can render the
// authed shell on first paint without an extra network round-trip. The /me
// endpoint refreshes the cache on app boot.

const TOKEN_KEY = "ssp.token";
const USER_KEY = "ssp.user";

type Listener = () => void;
const listeners = new Set<Listener>();

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Cache the parsed result so useSyncExternalStore's getSnapshot returns the
// same reference when nothing has changed. Without this, JSON.parse produces
// a fresh object every call, React sees a "change" each render, and Shell's
// useUser() drives an infinite re-render loop the moment a user is signed in.
// Sentinel object distinguishes "never read" from "read and got null".
const UNREAD = {};
let cachedRaw: string | null | typeof UNREAD = UNREAD;
let cachedUser: CurrentUser | null = null;

export function getCachedUser(): CurrentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === cachedRaw) return cachedUser;
  cachedRaw = raw;
  if (!raw) {
    cachedUser = null;
    return null;
  }
  try {
    cachedUser = JSON.parse(raw) as CurrentUser;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function setSession(token: string, user: CurrentUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function setUser(user: CurrentUser | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  notify();
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

// Keep multiple tabs in sync — login/logout in one tab updates the others.
window.addEventListener("storage", (e) => {
  if (e.key === TOKEN_KEY || e.key === USER_KEY) notify();
});
