// Maqam Explorer — Service Worker
// Network-first for the app shell (so updates arrive straight away), falling back to the
// cache when offline. Only same-origin GETs are handled; YouTube, fonts and the drone MP3s
// (range requests) go straight to the network.
const CACHE = 'maqam-explorer-v2';
const SHELL = [
  './', 'index.html', 'listen.js', 'examples.js', 'manifest.json',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.headers.has('range') || /\.mp3$/i.test(url.pathname)) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
