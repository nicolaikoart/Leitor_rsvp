// Guarda o app para funcionar sem internet.
const VERSAO = 'leitor-rsvp-1.2.0';
const ARQUIVOS = ['./', 'index.html', 'estilo.css', 'motor.js', 'app.js', 'pdf.js', 'pdf.worker.js',
  'manifest.webmanifest', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'icone-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !fonte) return;
  // Responde do cache na hora e atualiza em segundo plano.
  e.respondWith(caches.open(VERSAO).then(async (cache) => {
    const guardado = await cache.match(req, { ignoreSearch: !fonte });
    const rede = fetch(req).then((r) => {
      if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone());
      return r;
    }).catch(() => guardado);
    return guardado || rede;
  }));
});
