const CACHE_NAME = 'aura-focus-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  // ここによく使う音声ファイルのパスを入れておくと、オフラインでも鳴ります
  './sounds/alarm-clock.mp3',
  './sounds/alarm-digital.mp3',
  './sounds/timer-chime.mp3',
  './sounds/timer-bell.mp3',
  './sounds/pomo-hato.mp3',
  './sounds/pomo-kirakira.mp3',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにあればそれを返し、なければネットワークへ取りにいく
        return response || fetch(event.request);
      })
  );
});