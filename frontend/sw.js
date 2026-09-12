/**
 * Service worker — Wamton.
 *
 * Deliberately minimal and honest about what it does:
 *   - Caches the static "app shell" (this HTML file, the manifest,
 *     icons) so the app installs correctly and loads fast on repeat
 *     visits.
 *   - NEVER caches API responses (anything under /api/). This app's
 *     real value — balances, orders, courses, withdrawals — must
 *     always be live, current data. Showing a cached "GH₵50 balance"
 *     from an hour ago would be actively wrong, not just imprecise, so
 *     API requests always go straight to the network and are never
 *     intercepted here.
 *   - Shows a plain, honest "you're offline" response for a page
 *     navigation attempted with no connection, rather than a blank
 *     error or a misleading stale page.
 *   - Real Web Push: shows a real system notification when one
 *     arrives, and focuses/opens the app to the relevant page when
 *     tapped. See webPush.service.js on the backend for what sends it.
 */
const CACHE_NAME = "wamton-shell-v1";
const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept API calls — always live, never cached.
  if (request.url.includes("/api/")) {
    return;
  }

  // Only handle same-origin GET requests for the app shell.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Genuinely offline — fall back to whatever's cached, or a
          // plain, honest offline notice for a full page navigation.
          if (cached) return cached;
          if (request.mode === "navigate") {
            return new Response(
              "<!doctype html><html><head><meta charset='utf-8'><title>You're offline</title></head><body style='font-family:sans-serif;text-align:center;padding:60px 20px;'><h1>You're offline</h1><p>Wamton needs an internet connection. Please reconnect and try again.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }
          return Response.error();
        });
      return cached || networkFetch;
    })
  );
});

/**
 * Real Web Push — shows an actual system notification. The backend
 * (webPush.service.js) sends a JSON payload: { title, body, url }.
 * Falls back to a plain, generic notification if the payload is
 * missing or malformed, rather than silently doing nothing.
 */
self.addEventListener("push", (event) => {
  let data = { title: "Wamton", body: "You have a new notification.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // Non-JSON payload — fall back to the generic notification above
    // rather than crashing this event handler.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

/**
 * Tapping the notification focuses an already-open tab on this app if
 * one exists, rather than always opening a new one.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
