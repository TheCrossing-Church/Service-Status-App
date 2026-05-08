import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "../api/client";
import {
  clearSession,
  getCachedUser,
  getToken,
  setUser,
  subscribe,
} from "./store";
import type { CurrentUser } from "../api/types";

// Reactive bridge between localStorage-backed session and the React tree.
// Components re-render when login/logout happens (in this tab or another).
export function useUser(): CurrentUser | null {
  const subscribeFn = (cb: () => void) => subscribe(cb);
  const getSnapshot = () => getCachedUser();
  const getServerSnapshot = () => null;
  return useSyncExternalStore(subscribeFn, getSnapshot, getServerSnapshot);
}

// Refresh the cached user on app boot. If the token is missing or the
// /me call 401s, the session is cleared and the user is treated as guest.
export function useRefreshUser(): void {
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) clearSession();
      });
  }, []);
}
