/* ══ SERVICE WORKER ══════════════════════════════════
   A service worker is a small script the browser keeps running in the
   background, separate from any page. It sits between the app and the
   network and can answer requests itself, which is what makes a web app
   work offline and lets it be installed to a home screen.

   STRATEGY: network first, cache second.

   The usual PWA advice is cache first, because it's fastest. I chose
   network first on purpose. Cache first means the browser keeps serving
   the old copy of style.css or script.js until the cache is cleared,
   which is exactly the stale-file problem I already ran into on GitHub
   Pages. Network first means you always get the newest version when you
   have signal, and the cache is only used when the network fails.

   Slightly slower, but it can never show you an outdated app.        */

const VERSION = 'helpful-v1';

/* Files saved on install so the app opens with no connection at all.
   Paths are relative, which keeps this working under the GitHub Pages
   subfolder as well as at the root of a domain.                      */
const SHELL = [
  './',
  './index.html',
  './breathing.html',
  './timer.html',
  './tasks.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* INSTALL — runs once when the service worker is first registered, or
   whenever this file changes. Individual failures are ignored so one
   missing file can't stop the whole install.                         */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* skip missing files */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* ACTIVATE — delete caches from older versions, so bumping VERSION
   above is all it takes to clear everything out.                     */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* FETCH — every request the app makes passes through here.           */
self.addEventListener('fetch', function (e) {
  const req = e.request;

  /* Only handle normal page loads and same-origin files. Anything else
     — the Bootstrap CDN, Google Fonts, camera streams, blob: URLs for
     downloads — is left completely alone.                            */
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        /* got it from the network — keep a copy for next time offline */
        const copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
        return res;
      })
      .catch(function () {
        /* offline — fall back to whatever we saved earlier */
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          /* a page we've never visited: show the home page instead of
             the browser's dinosaur error                             */
          if (req.mode === 'navigate') return caches.match('./index.html');
        });
      })
  );
});
