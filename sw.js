// Єдиний Service Worker для Smart Вільногірськ: PWA + push-сповіщення (FCM).
// Реєструється з app.js для всіх відвідувачів.

importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAG8UbnsZ2DphoF0H7w088vE7pNHMkJs80",
  authDomain: "smart-vilnohirsk.firebaseapp.com",
  projectId: "smart-vilnohirsk",
  storageBucket: "smart-vilnohirsk.firebasestorage.app",
  messagingSenderId: "676865197841",
  appId: "1:676865197841:web:5d53065b2bb211bf77eeb0"
});

// У браузерах із SW, але без Push API (старі Safari/WebView) firebase.messaging()
// кидає виняток — без try/catch це завалило б встановлення всього SW разом із PWA-частиною
let messaging = null;
try { messaging = firebase.messaging(); } catch (e) {}

// Повідомлення з блоком notification браузер/SDK показує у фоні САМ —
// якщо викликати showNotification ще раз, користувач отримує дубль.
// Тому тут обробляємо лише data-повідомлення (раніше на них був краш:
// код читав payload.notification.title без перевірки).
if (messaging) messaging.onBackgroundMessage((payload) => {
  if (!payload || payload.notification) return;
  const d = payload.data || {};
  if (!d.title && !d.body) return;
  self.registration.showNotification(d.title || 'Smart Вільногірськ', {
    body: d.body || '',
    icon: 'https://vilnohirsk.online/apple-touch-icon.png',
    badge: 'https://vilnohirsk.online/apple-touch-icon.png',
    vibrate: [200, 100, 200],
    data: d
  });
});

// Клік по сповіщенню: фокусуємо вже відкриту вкладку, нову відкриваємо лише якщо її немає
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || 'https://vilnohirsk.online';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.indexOf('vilnohirsk.online') !== -1 && 'focus' in c) return c.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => {
  // Активируем новую версию сразу, без ожидания
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Очищаем устаревший кэш (если когда-то был)
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// fetch-обработчика нет намеренно: сайт работает с live-данными
// (расписание, акции, валюта), кэширование запросов сломало бы актуальность.
