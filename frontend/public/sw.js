// Service worker for the Service Progress Update Tool PWA.
// Two responsibilities for v1: receive push notifications and route
// notification clicks back to the right page. No precaching/offline yet.

self.addEventListener("install", (event) => {
  // Activate immediately on first install — no need to wait for old tabs.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Backend payload (from server/src/webpush.ts):
  //   { title, body, icon?, url?, timestamp }
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "Service Status", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Service Status";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "service-status",
    renotify: true,
    data: { url: payload.url || "/" },
    timestamp: payload.timestamp || Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab on this app if one is open; otherwise open new.
      for (const w of wins) {
        if (w.url.includes(self.registration.scope) && "focus" in w) {
          await w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
    })(),
  );
});
