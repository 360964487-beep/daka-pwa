// Service Worker：打卡应用离线缓存，页面优先从线上获取最新版本
const CACHE = 'daka-latest-v77';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './apple-touch-icon.png', './apple-touch-icon-20261022.png',
  './icon-192-rounded.png', './icon-512-rounded.png', './icon-192-v2.png', './icon-512-v2.png', './icon-maskable-192-v2.png', './icon-maskable-512-v2.png', './styles.css', './compact-header.css',
  './js/app-core.js', './js/tasks.js', './js/calendar.js', './js/finance.js', './js/fixed-bill-reorder.js', './js/credentials.js',
  './js/notes-settings.js', './js/app-updates.js', './js/timetable.js', './js/deepseek-assistant.js', './js/bootstrap.js'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('daka-latest-v') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'FOCUS_EXISTING_INSTANCE') return;
  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(windows => {
    const scope = self.registration.scope;
    const other = windows.find(client => client.id !== event.source?.id && client.url.startsWith(scope));
    return other ? other.focus().catch(() => {}) : undefined;
  }));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (!response.ok) return response;
      return caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()).catch(() => {}).then(() => response));
    }).catch(() => caches.open(CACHE).then((cache) => cache.match(event.request).then((cached) => cached || cache.match('./index.html')))));
    return;
  }
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (!response.ok) return response;
    return cache.put(event.request, response.clone()).catch(() => {}).then(() => response);
  }))));
});

