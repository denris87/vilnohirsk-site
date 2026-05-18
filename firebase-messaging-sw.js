// Імпортуємо скрипти Firebase
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

// Обробка сповіщень у фоновому режимі
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Отримано фонове сповіщення: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://vilnohirsk.online/apple-touch-icon.png',
    badge: 'https://vilnohirsk.online/apple-touch-icon.png',
    vibrate: [200, 100, 200],
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Відкриття сайту при кліку на сповіщення
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('https://vilnohirsk.online')
  );
});
