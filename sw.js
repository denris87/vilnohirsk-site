const CACHE_NAME = 'smart-vilnohirsk-static-v4';
const DYNAMIC_CACHE = 'smart-vilnohirsk-dynamic-v4';

// Статические файлы, которые кешируются при первой загрузке (чтобы сайт открывался без сети)
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js'
];

// 1. Установка Service Worker и кеширование статики
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Кешування статичних файлів');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Активация и удаление старых кешей (если вы обновите версию CACHE_NAME)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
            .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Перехват запросов (Стратегия Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Игнорируем не-GET запросы и сторонние скрипты (аналитика, базы данных)
  // Мы кешируем только наши файлы и ответы API (погода, расписание)
  if (req.method !== 'GET' ||
      req.url.includes('google-analytics') ||
      req.url.includes('googletagmanager') ||
      req.url.includes('script.google.com')) {
      return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      // Запускаем фоновый запрос к сети, чтобы обновить кеш новыми данными
      const fetchPromise = fetch(req).then((networkResponse) => {
        // Кешируем только успешные ответы
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(req, responseClone));
        }
        return networkResponse;
      }).catch((err) => {
         console.log('[SW] Немає мережі, використовуємо кеш для:', req.url);
      });

      // СРАЗУ возвращаем данные из кеша (если они есть), не дожидаясь ответа от сети.
      // Благодаря этому сайт открывается мгновенно. 
      // А ответ от сети (fetchPromise) обновит кеш в фоне для следующего захода.
      return cachedResponse || fetchPromise;
    })
  );
});
