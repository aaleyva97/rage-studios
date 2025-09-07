// Import Firebase SDKs
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase Configuration
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

// Get Firebase Messaging instance
const messaging = firebase.messaging();

console.log('🔥 [SW] Firebase Messaging Service Worker initialized - v3.0.0');

// ============================================
// BACKGROUND MESSAGE HANDLER
// ============================================
messaging.onBackgroundMessage((payload) => {
  console.log('📨 [SW] Background message received:', payload);
  
  // Validar que tenemos datos necesarios
  if (!payload.notification && !payload.data) {
    console.warn('⚠️ [SW] Invalid payload structure');
    return;
  }
  
  // Parse notification data con validación mejorada
  const notificationTitle = payload.notification?.title || 
                          payload.data?.title || 
                          'RageStudios Notification';
  
  const notificationOptions = {
    body: payload.notification?.body || 
          payload.data?.body || 
          'You have a new notification',
    icon: payload.notification?.icon || '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: payload.data?.notificationType || `notification-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    silent: false,
    data: {
      ...payload.data,
      FCM_MSG: payload,
      timestamp: Date.now()
    },
    vibrate: [200, 100, 200],
    actions: []
  };

  // Add custom action URL if provided
  if (payload.data?.actionUrl) {
    notificationOptions.data.actionUrl = payload.data.actionUrl;
  }

  // Add custom actions if provided
  if (payload.data?.actions) {
    try {
      notificationOptions.actions = JSON.parse(payload.data.actions);
    } catch (e) {
      console.warn('[SW] Could not parse actions:', e);
    }
  }

  // Log successful processing
  console.log('✅ [SW] Showing notification:', notificationTitle);
  
  // Show notification
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================
// NOTIFICATION CLICK HANDLER
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ [SW] Notification clicked:', event);
  
  const notification = event.notification;
  const actionUrl = notification.data?.actionUrl || 
                   notification.data?.click_action || 
                   '/account/bookings';
  
  // Close the notification
  notification.close();
  
  // Handle action button clicks
  if (event.action) {
    console.log('🎯 [SW] Action clicked:', event.action);
  }
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then((clientList) => {
      // Try to find an existing window
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Focus existing window and navigate
          client.focus();
          if (client.url !== self.location.origin + actionUrl) {
            return client.navigate(actionUrl);
          }
          return client;
        }
      }
      
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + actionUrl);
      }
    })
  );
});

// ============================================
// SERVICE WORKER LIFECYCLE
// ============================================

// Installation
self.addEventListener('install', (event) => {
  console.log('📦 [SW] Installing Service Worker v3.0.0...');
  // Force immediate activation
  self.skipWaiting();
});

// Activation
self.addEventListener('activate', (event) => {
  console.log('✅ [SW] Service Worker activated v3.0.0');
  event.waitUntil(
    // Take control of all clients immediately
    clients.claim()
  );
});

// ============================================
// MESSAGE FROM MAIN APP
// ============================================
self.addEventListener('message', (event) => {
  console.log('💬 [SW] Message from app:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_STATUS') {
    event.ports[0].postMessage({
      type: 'STATUS',
      ready: true,
      version: '3.0.0',
      timestamp: Date.now()
    });
  }
  
  // Validate token
  if (event.data && event.data.type === 'VALIDATE_TOKEN') {
    // En Firebase compat, podemos intentar obtener el token
    messaging.getToken().then((currentToken) => {
      event.ports[0].postMessage({
        type: 'TOKEN_VALIDATION',
        valid: currentToken === event.data.token,
        currentToken: currentToken
      });
    }).catch((err) => {
      console.error('❌ [SW] Error validating token:', err);
      event.ports[0].postMessage({
        type: 'TOKEN_VALIDATION',
        valid: false,
        error: err.message
      });
    });
  }
  
  // Report token refresh (manual check)
  if (event.data && event.data.type === 'CHECK_TOKEN_REFRESH') {
    messaging.getToken().then((currentToken) => {
      if (currentToken !== event.data.lastKnownToken) {
        // Token changed, notify main app
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'TOKEN_REFRESHED',
              token: currentToken
            });
          });
        });
      }
    }).catch((err) => {
      console.error('❌ [SW] Error checking token:', err);
    });
  }
});

// ============================================
// PUSH EVENT (Raw push messages)
// ============================================
self.addEventListener('push', (event) => {
  console.log('📱 [SW] Push event received');
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('📱 [SW] Push data:', data);
      
      // Verificar si Firebase ya manejó el mensaje
      if (data.notification || data.FCM_MSG) {
        console.log('✅ [SW] Message handled by Firebase');
        return;
      }
      
      // Handle the push message if Firebase doesn't
      if (data.data) {
        const notificationPromise = self.registration.showNotification(
          data.data.title || 'RageStudios',
          {
            body: data.data.body || 'New notification',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: data.data,
            tag: `push-${Date.now()}`,
            renotify: true
          }
        );
        event.waitUntil(notificationPromise);
      }
    } catch (error) {
      console.error('❌ [SW] Error handling push:', error);
    }
  }
});

// ============================================
// ERROR HANDLER
// ============================================
self.addEventListener('error', (event) => {
  console.error('❌ [SW] Service Worker error:', event.error);
  // Reportar error al cliente
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'SW_ERROR',
        error: event.error?.message || 'Unknown error'
      });
    });
  });
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ [SW] Unhandled promise rejection:', event.reason);
});

// Log SW version on load
console.log('🚀 [SW] RageStudios Service Worker ready - v3.0.0');