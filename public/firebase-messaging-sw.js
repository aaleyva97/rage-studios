importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuración de Firebase - REEMPLAZA CON TUS CREDENCIALES
const firebaseConfig = {
  apiKey: "AIzaSyA6cVv2nk-xMzVYqM8DQBQ-JeicvyhS8a4",
  authDomain: "rage-studios.firebaseapp.com",
  projectId: "rage-studios",
  storageBucket: "rage-studios.firebasestorage.app",
  messagingSenderId: "401067010518",
  appId: "1:401067010518:web:b716d612274887ba6a9c77"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

console.log('🔥 [FCM-SW] Firebase Messaging Service Worker loaded');

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('🔔 [FCM-SW] Received background message:', payload);
  
  // Extract notification data
  const notificationTitle = payload.notification?.title || payload.data?.title || 'RageStudios';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Nueva notificación',
    icon: payload.notification?.icon || '/icons/icon-192x192.png',
    badge: payload.notification?.badge || '/icons/badge-72x72.png',
    tag: payload.data?.notificationType || 'default',
    data: payload.data || {},
    requireInteraction: payload.data?.priority >= 5,
    actions: payload.data?.actions || [],
    timestamp: Date.now()
  };

  // Add action URL to data
  if (payload.data?.actionUrl) {
    notificationOptions.data.actionUrl = payload.data.actionUrl;
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 [FCM-SW] Notification clicked:', event);
  
  const notification = event.notification;
  const actionUrl = notification.data?.actionUrl || '/account/bookings';
  
  notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate(actionUrl);
          }
        }
        // Open new window if app is not open
        if (clients.openWindow) {
          return clients.openWindow(self.location.origin + actionUrl);
        }
      })
  );
});

// Service Worker Installation
self.addEventListener('install', (event) => {
  console.log('🔧 [FCM-SW] Installing Firebase Service Worker...');
  self.skipWaiting();
});

// Service Worker Activation
self.addEventListener('activate', (event) => {
  console.log('🔧 [FCM-SW] Activating Firebase Service Worker...');
  event.waitUntil(clients.claim());
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  console.log('📨 [FCM-SW] Message from app:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});