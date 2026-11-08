// Offline: keep the app files; songs live in IndexedDB (already unlocked on this phone).
const CACHE = "revival-songbook-2.5.1";
const FILES = ["./", "index.html", "app.js", "search.js", "translit.js", "chords.js", "scrypt.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "live.js", "lists.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(new URL("./", self.registration.scope).pathname)) return;   // latest.json / pack: always network
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
