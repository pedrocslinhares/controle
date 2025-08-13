const CACHE_NAME = 'coletas-offline-v2.1';

// Lista de recursos que devem ser cacheados para funcionamento offline
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
];

// Instalar o Service Worker e cachear recursos
self.addEventListener('install', event => {
  console.log('SW: Instalando versão offline corrigida');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Cacheando recursos para offline');
        return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'})));
      })
      .catch(error => {
        console.error('SW: Erro ao cachear recursos:', error);
        // Mesmo com erro, cacheia pelo menos o essencial
        return caches.open(CACHE_NAME).then(cache => {
          return cache.addAll([
            './',
            './index.html'
          ]);
        });
      })
  );
  // Força ativação imediata
  self.skipWaiting();
});

// Interceptar todas as requisições
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // Para requisições do mesmo domínio (arquivos do app)
  if (requestUrl.origin === location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            console.log('SW: Servindo do cache:', event.request.url);
            return cachedResponse;
          }
          
          // Se não estiver em cache, tenta buscar online
          return fetch(event.request)
            .then(response => {
              // Se conseguiu buscar, adiciona ao cache
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseClone);
                  });
              }
              return response;
            })
            .catch(() => {
              // Se falhou (offline), tenta retornar index.html para SPAs
              if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
              }
              // Para outros recursos, retorna uma resposta vazia
              return new Response('', {
                status: 404,
                statusText: 'Recurso não disponível offline'
              });
            });
        })
    );
  } else {
    // Para recursos externos (fontes, CDNs, etc)
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Tenta buscar online
          return fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => {
                    cache.put(event.request, responseClone);
                  });
              }
              return response;
            })
            .catch(() => {
              // Se falhou, retorna resposta vazia (graceful degradation)
              return new Response('', { status: 200 });
            });
        })
    );
  }
});

// Ativar o Service Worker e limpar caches antigos
self.addEventListener('activate', event => {
  console.log('SW: Ativando versão offline corrigida');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Assume controle imediatamente
  return self.clients.claim();
});

// Notificar clientes sobre atualizações
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: CACHE_NAME});
  }
});

// Debug: Log quando o SW está pronto
self.addEventListener('activate', () => {
  console.log('SW: Pronto para funcionar offline!');
});

// Fallback para navegação quando offline
self.addEventListener('fetch', event => {
  // Se for uma navegação (usuário abrindo o app)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se offline, retorna a página principal
          return caches.match('./index.html');
        })
    );
  }
});