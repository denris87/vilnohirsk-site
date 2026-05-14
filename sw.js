// Service Worker для Smart Вільногірськ
// Используется как заглушка для PWA. Реальные push-уведомления
// обрабатывает firebase-messaging-sw.js (он регистрируется отдельно).

self.addEventListener('install', (event) => {
  // Активируем новую версию сразу, без ожидания
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Очищаем устаревший кэш (если когда-то был)
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Не перехватываем fetch — все запросы идут напрямую в сеть.
// Это важно: сайт работает с live-данными (расписание, акции, валюта),
// кэширование запросов сломало бы актуальность.
self.addEventListener('fetch', (event) => {
  // Пропускаем всё как есть
  return;
});
