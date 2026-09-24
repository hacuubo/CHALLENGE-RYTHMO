// Service worker : application utilisable hors ligne.
// Coquille de l'application : cache d'abord. Base de questions : réseau d'abord (mises à jour), cache en secours.
const VERSION = 'rythmo-0db882ab5d'; // mis à jour par scripts/build-index.mjs
const COQUILLE = ['./', 'index.html', 'css/styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/store.js', 'js/util.js', 'js/donnees.js', 'js/session.js', 'js/ecg.js', 'js/ecg12.js', 'js/traces.js', 'js/egm.js',
  'js/vues/accueil.js', 'js/vues/config.js', 'js/vues/quiz.js', 'js/vues/resultats.js', 'js/vues/progression.js',
  'js/vues/fiches.js', 'js/vues/apropos.js', 'js/vues/competitif.js', 'js/courbe.js',
  'js/vues/simulateur.js', 'js/simu/moteur.js', 'js/simu/scenarios.js', 'js/simu/trace.js', 'js/simu/analyse.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(COQUILLE);
    try {
      const idx = await (await fetch('data/questions/index.json', { cache: 'no-cache' })).json();
      await c.addAll(['data/questions/index.json', ...idx.fichiers.map(f => `data/questions/${f}`)]);
    } catch { /* hors ligne à l'installation : la base sera mise en cache au premier chargement */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const r = await fetch(e.request);
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch {
        return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(e.request, { ignoreSearch: true });
    const reseau = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await reseau) || (await c.match('index.html'));
  })());
});
