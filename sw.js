// Offline support. Bump CACHE when any file below changes so the old cache is
// dropped — otherwise an updated word list would never reach a device that has
// already installed the app.
const CACHE = 'german-app-v1';

const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/csv.js',
  'js/deck.js',
  'js/quiz.js',
  'js/progress.js',
  'data/manifest.json',
  'data/de-top500.csv',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one missing file cannot fail the whole install.
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, falling back to cache: she gets word-list edits as soon as she
// is online, and the whole app still opens on a plane.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then((hit) => hit || caches.match('index.html'))
      )
  );
});
