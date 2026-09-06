/**
 * Service worker — Learn & Earn.
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
 */
const CACHE_NAME = "learn-and-earn-shell-v1";
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
              "<!doctype html><html><head><meta charset='utf-8'><title>You're offline</title></head><body style='font-family:sans-serif;text-align:center;padding:60px 20px;'><h1>You're offline</h1><p>Learn &amp; Earn needs an internet connection. Please reconnect and try again.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }
          return Response.error();
        });
      return cached || networkFetch;
    })
  );
});
