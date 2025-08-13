const CACHE_NAME = 'coletas-v2.0';
const urlsToCache = [
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Instalar o Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando versão 2.0 com campo VÍNCULO');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto - versão 2.0');
        return cache.addAll(urlsToCache);
      })
  );
  // Força a ativação imediata da nova versão
  self.skipWaiting();
});

// Interceptar requisições de rede
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna o cache se encontrado
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            // Verifica se a resposta é válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clona a resposta
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Atualizar o Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativando versão 2.0');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Assume controle de todas as abas abertas
  return self.clients.claim();
});

// Sincronização em background
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  console.log('Service Worker: Sincronização em background executada');
  // Aqui você pode implementar lógica para sincronizar dados quando voltar online
  return Promise.resolve();
}

// Notificações push (opcional)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nova atualização disponível no sistema de coletas',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App',
        icon: '/icons/icon-72x72.png'
      },
      {
        action: 'close',
        title: 'Fechar',
        icon: '/icons/icon-72x72.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Coletas - Sistema Patrimonial', options)
  );
});

// Manipular cliques em notificações
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notificação clicada');
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Mensagem para o console quando o SW está pronto
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker 2.0: Sistema de Coletas com Controle de Vínculos Patrimoniais carregado');