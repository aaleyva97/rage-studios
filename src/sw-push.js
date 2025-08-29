/**
 * 🔔 RAGE STUDIOS - Custom Service Worker for Push Notifications
 * 
 * Service Worker dedicado exclusivamente para notificaciones push.
 * Separado del Service Worker principal de Angular para evitar conflictos.
 */

console.log('🔧 [SW] RageStudios Push Service Worker loaded');

// Service Worker Installation
self.addEventListener('install', event => {
  console.log('🔧 [SW] Installing Push Service Worker...');
  event.waitUntil(self.skipWaiting()); // Force activation
});

// Service Worker Activation
self.addEventListener('activate', event => {
  console.log('🔧 [SW] Activating Push Service Worker...');
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('✅ [SW] Push Service Worker activated and claimed all clients');
    })
  );
});

// Push Event Handler - CRÍTICO para notificaciones
self.addEventListener('push', event => {
  console.log('🔔 [SW] Push event received:', event);

  if (!event.data) {
    console.warn('⚠️ [SW] Push event has no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('🔔 [SW] Push data received:', data);

    const notificationTitle = data.title || '🔔 RageStudios';
    const notificationOptions = {
      body: data.body || 'Nueva notificación',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: data.badge || '/icons/badge-72x72.png',
      tag: data.tag || 'default',
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.priority >= 5, // High priority notifications require interaction
      silent: false,
      timestamp: Date.now()
    };

    event.waitUntil(
      self.registration.showNotification(notificationTitle, notificationOptions)
        .then(() => {
          console.log('✅ [SW] Notification displayed successfully');
          
          // Send message to client (optional)
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({
                type: 'NOTIFICATION_RECEIVED',
                payload: data
              });
            });
          });
        })
        .catch(error => {
          console.error('❌ [SW] Error displaying notification:', error);
        })
    );

  } catch (error) {
    console.error('❌ [SW] Error processing push event:', error);
  }
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('🔔 [SW] Notification clicked:', event);

  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  // Close the notification
  notification.close();

  // Handle different actions
  if (action === 'view' || !action) {
    // Default action: open the app
    const urlToOpen = data.actionUrl || '/';
    
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          // Check if app is already open
          for (let client of clients) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              client.focus();
              client.navigate(urlToOpen);
              
              // Send message to client
              client.postMessage({
                type: 'NOTIFICATION_CLICKED',
                payload: { data, action }
              });
              
              return;
            }
          }
          
          // If no client is open, open a new window
          if (self.clients.openWindow) {
            return self.clients.openWindow(self.location.origin + urlToOpen);
          }
        })
        .catch(error => {
          console.error('❌ [SW] Error handling notification click:', error);
        })
    );
  }
});

// Notification Close Handler
self.addEventListener('notificationclose', event => {
  console.log('🔔 [SW] Notification closed:', event);
  
  const data = event.notification.data || {};
  
  // Send message to client (for analytics)
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NOTIFICATION_CLOSED',
        payload: { data }
      });
    });
  });
});

// Message Handler (from client to service worker)
self.addEventListener('message', event => {
  console.log('📨 [SW] Message received from client:', event.data);
  
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'PING':
      event.source.postMessage({ type: 'PONG', payload: 'Service Worker is alive!' });
      break;
    default:
      console.log('🔄 [SW] Unknown message type:', type);
  }
});

console.log('✅ [SW] RageStudios Push Service Worker ready');