/* De Mott OS — the service worker. It caches the SHELL and nothing else.
 *
 * The shell is the code: HTML, CSS, JS, the fonts, the icons. It changes when
 * a session changes it and not otherwise, so it is safe to serve from a cache.
 *
 * Data is NOT cached here, deliberately. A page that draws a cached Today
 * while believing it is current is exactly the silent staleness this project
 * keeps designing against — the Notion board that sat six days old with
 * nothing saying so. Reads go through j() in js/util.js, which knows which of
 * the three sources answered and makes freshness() say it out loud. So this
 * file steps aside for anything under data/ and for /api/ entirely.
 *
 * VERSION and SHELL are written by build_shell.sh. VERSION is a hash of the
 * shell's own bytes, so a deploy that changes nothing evicts nothing, and a
 * deploy that changes anything evicts everything.
 */
const VERSION = "50c4bf4b8c6b";
const SHELL   = [
  "capture.html",
  "css/base.css",
  "css/edition.css",
  "css/fonts.css",
  "css/home.css",
  "css/list.css",
  "css/review.css",
  "css/school.css",
  "done.html",
  "edition.html",
  "favicon.svg",
  "fonts/fraunces-italic-400-700-latin-ext.woff2",
  "fonts/fraunces-italic-400-700-latin.woff2",
  "fonts/fraunces-normal-400-700-latin-ext.woff2",
  "fonts/fraunces-normal-400-700-latin.woff2",
  "fonts/ibm-plex-mono-normal-400-latin-ext.woff2",
  "fonts/ibm-plex-mono-normal-400-latin.woff2",
  "fonts/ibm-plex-mono-normal-500-latin-ext.woff2",
  "fonts/ibm-plex-mono-normal-500-latin.woff2",
  "fonts/ibm-plex-mono-normal-600-latin-ext.woff2",
  "fonts/ibm-plex-mono-normal-600-latin.woff2",
  "fonts/instrument-sans-italic-400-700-latin-ext.woff2",
  "fonts/instrument-sans-italic-400-700-latin.woff2",
  "fonts/instrument-sans-normal-400-700-latin-ext.woff2",
  "fonts/instrument-sans-normal-400-700-latin.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "index.html",
  "js/canvas.js",
  "js/capture.js",
  "js/capturepage.js",
  "js/done.js",
  "js/edition.js",
  "js/home.js",
  "js/list.js",
  "js/nav.js",
  "js/outbox.js",
  "js/phone.js",
  "js/review.js",
  "js/rows.js",
  "js/scent.js",
  "js/school.js",
  "js/setup.js",
  "js/theme.js",
  "js/think.js",
  "js/todo.js",
  "js/util.js",
  "js/weather.js",
  "js/whatsapp.js",
  "list.html",
  "manifest.json",
  "review.html",
  "school.html",
  "setup.html",
  "todo.html"
];
const CACHE   = "dmos-shell-" + VERSION;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;            /* api.github.com */
  if (/(^|\/)(data|api)\//.test(url.pathname)) return;        /* never the data */

  /* A navigation goes to the network first, so a deploy lands the moment there
     is a network to land it — and falls back to the cache, which is what makes
     the Home Screen icon open something on a plane. */
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(r => { const copy = r.clone();
                     caches.open(CACHE).then(c => c.put(e.request, copy));
                     return r; })
        .catch(() => caches.match(e.request)
                           .then(r => r || caches.match("index.html"))));
    return;
  }

  /* Everything else: cache first, and quietly refresh it for next time. */
  e.respondWith(
    caches.match(e.request).then(hit => {
      const live = fetch(e.request).then(r => {
        if (r && r.ok) { const copy = r.clone();
                         caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      }).catch(() => hit);
      return hit || live;
    }));
});
