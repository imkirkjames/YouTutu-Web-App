// YouTutu PWA — Service Worker
// Cache-first for app shell, share target handling.

const CACHE_NAME = 'yoututu-v1';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/constants.js',
  '/js/url-parser.js',
  '/js/youtube-api.js',
  '/js/storyboard.js',
  '/js/transcript.js',
  '/js/keyframes.js',
  '/js/summarizer.js',
  '/js/renderer.js',
  '/manifest.json',
  '/icons/icon.svg',
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for shell, share target intercept
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Share target: POST /share → redirect to app with URL param
  if (url.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) return;

  // Cache-first for app shell assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for shell assets
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const sharedUrl = formData.get('url') || formData.get('text') || '';
  const redirectUrl = `/?url=${encodeURIComponent(sharedUrl)}`;
  return Response.redirect(redirectUrl, 303);
}
