// Імпортуємо скрипти Firebase (версія має збігатися з тією, що в index.html)
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Ініціалізуємо Firebase у Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyAG8UbnsZ2DphoF0H7w088vE7pNHMkJs80",
  authDomain: "smart-vilnohirsk.firebaseapp.com",
  projectId: "smart-vilnohirsk",
  storageBucket: "smart-vilnohirsk.firebasestorage.app",
  messagingSenderId: "676865197841",
  appId: "1:676865197841:web:5d53065b2bb211bf77eeb0"
});

const messaging = firebase.messaging();

// Обробка сповіщень у фоновому режимі (коли сайт закритий або згорнутий)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Отримано фонове сповіщення: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://github.com/denris87/vilnohirsk-site/blob/main/apple-touch-icon.png?raw=true', // Іконка вашого додатку
    badge: 'https://github.com/denris87/vilnohirsk-site/blob/main/apple-touch-icon.png?raw=true',
    vibrate: [200, 100, 200],
    data: payload.data // додаткові дані, наприклад, посилання для переходу
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Обробка кліку по сповіщенню
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Відкриваємо сайт при кліку на пуш
  event.waitUntil(
    clients.openWindow('https://vilnohirsk.online')
  );
});
