// Helpers for the Web Push subscription handshake. The flow:
//   1. Fetch the VAPID public key from the backend.
//   2. Register the service worker (already done at app boot).
//   3. Ask the browser for permission, then for a PushSubscription via
//      the SW registration. Browsers handle the actual push channel; we
//      just ferry the resulting endpoint + keys back to our backend.

import { api } from "../api/client";

export type PushSetupResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: string };

export async function ensurePushSubscription(
  email: string,
): Promise<PushSetupResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "Push not supported in this browser" };
  }

  const { key } = await api.vapidPublicKey();
  if (!key) {
    return {
      ok: false,
      reason: "Server is missing a VAPID key (admin must generate one)",
    };
  }

  const reg = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission denied" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    // PushManager accepts the VAPID public key as a base64url string
    // directly — no need to decode to a Uint8Array (which has typed-array
    // / SharedArrayBuffer interop quirks under strict TS).
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!sub.endpoint || !p256dh || !auth) {
    return { ok: false, reason: "Browser returned an incomplete subscription" };
  }

  await api.registerPushSubscription({
    email,
    endpoint: sub.endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent.slice(0, 256),
  });

  return { ok: true, endpoint: sub.endpoint };
}
