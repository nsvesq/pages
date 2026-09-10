// Maqam Explorer — Service Worker
// Caches all app files for offline use

const CACHE = 'maqam-explorer-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Drone MP3s — cached so drone works offline after first visit
  '/Cello Drone A [qpQ6c0NotCY].mp3',
  '/Cello Drone Bb [UfY3u7xvgf8].mp3',
  '/Cello Drone B [0_iqISl0o4o].mp3',
  '/Cello Drone C [MimVnBAuYqA].mp3',
  '/Cello Drone Db [LxFwYJlnmqo].mp3',
  '/Cello Drone D [ygo0ZimLfsQ].mp3',
  '/Cello Drone Eb [jgFNsz_9w4A].mp3',
  '/Cello Drone E [oYLSMPvGoL8].mp3',
  '/Cello Drone F [cC4DzsV4ivs].mp3',
  '/Cello Drone F#Gb [NUFgXjFL8YM].mp3',
  '/Cello Drone G [lvXXdGhJA1Q].mp3',
  '/Cello Drone Ab [5vBDWMOyRCM].mp3',
];

// Install — cache everything
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // Cache what we can — don't fail if MP3s aren't uploaded yet
      return Promise.allSettled(
        ASSETS.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache successful responses
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback
        return caches.match('/index.html');
      });
    })
  );
});
