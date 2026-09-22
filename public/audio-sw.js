const DRIVE_HOST = 'drive.usercontent.google.com';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (!requestUrl.pathname.endsWith('/remote-audio')) return;

  event.respondWith((async () => {
    const targetValue = requestUrl.searchParams.get('url');
    if (!targetValue) return new Response('Missing audio URL', { status: 400 });

    const target = new URL(targetValue);
    if (target.protocol !== 'https:' || target.hostname !== DRIVE_HOST) {
      return new Response('Audio host is not allowed', { status: 403 });
    }

    const headers = new Headers();
    const range = event.request.headers.get('range');
    if (range) headers.set('range', range);
    const upstream = await fetch(target, { headers, credentials: 'omit' });
    const responseHeaders = new Headers();
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('cache-control', 'no-store');
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  })());
});
