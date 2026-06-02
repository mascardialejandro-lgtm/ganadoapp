// ═══════════════════════════════════════════════════
// GanadoApp — Service Worker
// Estrategia: Cache First para assets, Network First para datos
// ═══════════════════════════════════════════════════

const CACHE_NAME = 'ganadoapp-v1';
const CACHE_VERSION = '1.0.0';

// Archivos que se cachean en la instalación (app shell)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // CDN externas — SheetJS
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ─── INSTALL — cachear app shell ───
self.addEventListener('install', event => {
  console.log('[SW] Instalando GanadoApp v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando archivos principales');
        // Cachear cada URL individualmente para no fallar si una CDN tarda
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] No se pudo cachear:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalación completa');
        return self.skipWaiting(); // activar inmediatamente
      })
  );
});

// ─── ACTIVATE — limpiar caches viejos ───
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Eliminando cache viejo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Tomando control de clientes');
        return self.clients.claim();
      })
  );
});

// ─── FETCH — estrategia de cache ───
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // Ignorar chrome-extension y otras
  if (!url.protocol.startsWith('http')) return;

  // Estrategia: Cache First con fallback a network
  // Ideal para app que funciona mayormente offline
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Tenemos cache → devolverlo inmediatamente
          // En background, intentar actualizar para la próxima vez
          const fetchPromise = fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, responseToCache));
              }
              return networkResponse;
            })
            .catch(() => {}); // silenciar error si no hay red
          
          return cachedResponse; // responder desde cache sin esperar
        }

        // No hay cache → ir a la red
        return fetch(request)
          .then(networkResponse => {
            // Cachear la respuesta si es válida
            if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            // Sin red y sin cache — devolver página offline genérica
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            // Para otros recursos, error silencioso
            return new Response('', { status: 408, statusText: 'Sin conexión' });
          });
      })
  );
});

// ─── BACKGROUND SYNC — para cuando vuelva la red ───
self.addEventListener('sync', event => {
  if (event.tag === 'sync-ganadoapp') {
    console.log('[SW] Background sync triggered');
    // En Etapa 2 con Firebase, acá se sincronizarán los datos pendientes
  }
});

// ─── PUSH NOTIFICATIONS — para alertas futuras ───
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'Notificación de GanadoApp',
    icon: './icons/icon-192.png',
    badge: './icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    actions: [
      { action: 'ver', title: 'Ver ahora' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'GanadoApp', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'ver') {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});

console.log('[SW] GanadoApp Service Worker cargado v' + CACHE_VERSION);
