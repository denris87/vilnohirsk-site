// Этот файл ОБЯЗАТЕЛЬНО должен лежать в корне вашего сайта (там же, где и index.html)

importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Конфигурация Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAG8UbnsZ2DphoF0H7w088vE7pNHMkJs80",
  authDomain: "smart-vilnohirsk.firebaseapp.com",
  projectId: "smart-vilnohirsk",
  storageBucket: "smart-vilnohirsk.firebasestorage.app",
  messagingSenderId: "676865197841",
  appId: "1:676865197841:web:5d53065b2bb211bf77eeb0"
});

const messaging = firebase.messaging();

// Эта функция ловит уведомления, когда браузер СВЕРНУТ или ЗАКРЫТ
messaging.onBackgroundMessage((payload) => {
  console.log('Получено фоновое сообщение: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://vilnohirsk.online/apple-touch-icon.png' // Логотип для пушей
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
