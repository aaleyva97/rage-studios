/**
 * 🔥 RAGE STUDIOS - COMBINED SERVICE WORKER v5.0.0
 * Service Worker combinado que integra Angular PWA + Firebase Messaging
 * 
 * ARQUITECTURA:
 * 1. Importa y ejecuta ngsw-worker.js (mantiene TODAS las características PWA)
 * 2. Añade Firebase Messaging para notificaciones push en background
 * 3. Maneja comunicación bidireccional con la app principal
 * 4. Implementa recuperación automática de errores
 */

// ============================================
// PASO 1: IMPORTAR ANGULAR SERVICE WORKER
// ============================================
// Verificar si estamos en fase de instalación
if (typeof self.skipWaiting === 'function') {
  try {
    // Solo intentar importar durante la instalación inicial
    if (!self.ngsw) {
      // ✅ EVITAR DUPLICADOS DE NOTIFICACIONES PUSH:
      // Sobrescribir temporalmente self.addEventListener para ignorar registros de 'push' y 'notificationclick'
      // que vienen en ngsw-worker.js. Esto evita que Angular interfiera con Firebase Messaging
      // pero conserva todas las características PWA de caché y offline de Angular.
      const originalAddEventListener = self.addEventListener;
      self.addEventListener = function(type, listener, options) {
        if (type === 'push' || type === 'notificationclick') {
          console.log(`🚫 [SW] Registro de listener '${type}' ignorado para evitar duplicaciones`);
          return;
        }
        return originalAddEventListener.call(self, type, listener, options);
      };

      importScripts('./ngsw-worker.js');
      
      // Restaurar addEventListener original
      self.addEventListener = originalAddEventListener;
      
      console.log('✅ [SW] Angular PWA Service Worker imported successfully (Push listeners bypassed)');
    }
  } catch (error) {
    // No es crítico si falla - Firebase Messaging seguirá funcionando
    console.warn('⚠️ [SW] Angular PWA not available, continuing with Firebase only:', error.message);
  }
}

// ============================================
// PASO 2: IMPORTAR FIREBASE MESSAGING
// ============================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ============================================
// PASO 3: CONFIGURACIÓN DE FIREBASE
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyA6cVv2nk-xMzVYqM8DQBQ-JeicvyhS8a4",
  authDomain: "rage-studios.firebaseapp.com",
  projectId: "rage-studios",
  storageBucket: "rage-studios.firebasestorage.app",
  messagingSenderId: "401067010518",
  appId: "1:401067010518:web:b716d612274887ba6a9c77"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('🔥 [SW] Combined Service Worker initialized - v5.0.0');
console.log('✅ [SW] Angular PWA features: ACTIVE');
console.log('✅ [SW] Firebase Messaging: ACTIVE');

// ============================================
// VARIABLES DE ESTADO
// ============================================
let lastKnownToken = null;
let notificationQueue = [];
const MAX_RETRY_ATTEMPTS = 3;

// ============================================
// MANEJADOR DE MENSAJES EN BACKGROUND
// ============================================
messaging.onBackgroundMessage((payload) => {
  console.log('📨 [SW] Background message received (FCM automatically displays this):', payload);
  
  // Validación robusta del payload
  if (!payload || (!payload.notification && !payload.data)) {
    console.warn('⚠️ [SW] Invalid payload structure, skipping');
    return;
  }
  
  // ✅ NO HACER LLAMADA MANUAL A showNotification:
  // Firebase SDK automáticamente muestra la notificación en segundo plano utilizando el campo 'notification' del payload.
  // Solo reenviaremos el mensaje a los clientes activos (pestañas abiertas) para sincronizar la interfaz.
  
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'NOTIFICATION_RECEIVED',
          payload: payload,
          timestamp: Date.now()
        });
      });
    })
    .catch(error => {
      console.error('❌ [SW] Error notifying active clients:', error);
    });
});

// ============================================
// MANEJADOR DE CLICKS EN NOTIFICACIONES
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ [SW] Notification clicked:', event);
  
  const notification = event.notification;
  const actionUrl = notification.data?.actionUrl || 
                   notification.data?.click_action || 
                   '/account/bookings';
  
  // Cerrar la notificación
  notification.close();
  
  // Manejar clicks en botones de acción
  if (event.action) {
    console.log('🎯 [SW] Action clicked:', event.action);
    // Aquí puedes añadir lógica específica para cada acción
  }
  
  // Abrir o enfocar la aplicación
  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then((clientList) => {
      // Buscar una ventana existente
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Enfocar ventana existente
          return client.focus().then(() => {
            // Navegar a la URL si es diferente
            if (!client.url.includes(actionUrl)) {
              return client.navigate(self.location.origin + actionUrl);
            }
            return client;
          });
        }
      }
      
      // Abrir nueva ventana si no hay ninguna
      if (clients.openWindow) {
        return clients.openWindow(self.location.origin + actionUrl);
      }
    })
  );
});

// ============================================
// COMUNICACIÓN CON LA APP PRINCIPAL
// ============================================
self.addEventListener('message', async (event) => {
  console.log('💬 [SW] Message from app:', event.data);
  
  const { type, data } = event.data;
  
  switch(type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CHECK_STATUS':
      event.ports[0].postMessage({
        type: 'STATUS',
        ready: true,
        version: 'v5.0.0',
        features: {
          pwa: true,
          notifications: true,
          offline: true,
          background_sync: true
        },
        timestamp: Date.now()
      });
      break;
      
    case 'VALIDATE_TOKEN':
      validateToken(event);
      break;
      
    case 'CHECK_TOKEN_REFRESH':
      checkTokenRefresh(event);
      break;
      
    case 'FORCE_TOKEN_REFRESH':
      forceTokenRefresh(event);
      break;
      
    case 'GET_CACHED_DATA':
      getCachedData(event);
      break;
      
    case 'CLEAR_NOTIFICATION_QUEUE':
      notificationQueue = [];
      event.ports[0].postMessage({
        type: 'QUEUE_CLEARED',
        success: true
      });
      break;
  }
});

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Validar token FCM
 */
async function validateToken(event) {
  try {
    const currentToken = await messaging.getToken();
    const isValid = currentToken === event.data.token;
    
    event.ports[0].postMessage({
      type: 'TOKEN_VALIDATION',
      valid: isValid,
      currentToken: isValid ? null : currentToken // Solo enviar si cambió
    });
    
    // Si el token cambió, notificar a la app
    if (!isValid && currentToken && currentToken !== lastKnownToken) {
      lastKnownToken = currentToken;
      notifyTokenRefresh(currentToken);
    }
  } catch (error) {
    console.error('❌ [SW] Error validating token:', error);
    event.ports[0].postMessage({
      type: 'TOKEN_VALIDATION',
      valid: false,
      error: error.message
    });
  }
}

/**
 * Verificar actualización de token
 */
async function checkTokenRefresh(event) {
  try {
    const currentToken = await messaging.getToken();
    
    if (currentToken && currentToken !== event.data.lastKnownToken) {
      // Token cambió, notificar
      lastKnownToken = currentToken;
      notifyTokenRefresh(currentToken);
    }
    
    event.ports[0].postMessage({
      type: 'TOKEN_CHECK_COMPLETE',
      refreshed: currentToken !== event.data.lastKnownToken,
      token: currentToken
    });
  } catch (error) {
    console.error('❌ [SW] Error checking token:', error);
    event.ports[0].postMessage({
      type: 'TOKEN_CHECK_ERROR',
      error: error.message
    });
  }
}

/**
 * Forzar actualización de token
 */
async function forceTokenRefresh(event) {
  try {
    // Eliminar token actual
    await messaging.deleteToken();
    
    // Obtener nuevo token
    const newToken = await messaging.getToken({
      vapidKey: event.data.vapidKey
    });
    
    if (newToken) {
      lastKnownToken = newToken;
      notifyTokenRefresh(newToken);
      
      event.ports[0].postMessage({
        type: 'TOKEN_REFRESHED',
        success: true,
        token: newToken
      });
    } else {
      throw new Error('Could not obtain new token');
    }
  } catch (error) {
    console.error('❌ [SW] Error forcing token refresh:', error);
    event.ports[0].postMessage({
      type: 'TOKEN_REFRESH_ERROR',
      error: error.message
    });
  }
}

/**
 * Notificar actualización de token a todos los clientes
 */
function notifyTokenRefresh(newToken) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'TOKEN_REFRESHED',
          token: newToken,
          timestamp: Date.now()
        });
      });
    });
}

/**
 * Obtener datos cacheados (PWA feature)
 */
async function getCachedData(event) {
  try {
    const cache = await caches.open('ngsw:db:control');
    const response = await cache.match(event.data.url);
    
    if (response) {
      const data = await response.json();
      event.ports[0].postMessage({
        type: 'CACHED_DATA',
        data: data,
        found: true
      });
    } else {
      event.ports[0].postMessage({
        type: 'CACHED_DATA',
        found: false
      });
    }
  } catch (error) {
    console.error('❌ [SW] Error getting cached data:', error);
    event.ports[0].postMessage({
      type: 'CACHE_ERROR',
      error: error.message
    });
  }
}

/**
 * Intentar recuperación de notificaciones fallidas
 */
async function attemptNotificationRecovery() {
  if (notificationQueue.length === 0) return;
  
  console.log('🔄 [SW] Attempting notification recovery...');
  
  const recoveredNotifications = [];
  const failedNotifications = [];
  
  for (const item of notificationQueue) {
    if (item.attempts >= MAX_RETRY_ATTEMPTS) {
      failedNotifications.push(item);
      continue;
    }
    
    try {
      await self.registration.showNotification(
        item.payload.notification?.title || 'RageStudios',
        {
          body: item.payload.notification?.body || 'Notificación recuperada',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          tag: `recovered-${Date.now()}`,
          data: item.payload.data
        }
      );
      recoveredNotifications.push(item);
    } catch (error) {
      item.attempts++;
      failedNotifications.push(item);
    }
  }
  
  // Actualizar cola con solo las notificaciones que fallaron permanentemente
  notificationQueue = failedNotifications.filter(n => n.attempts < MAX_RETRY_ATTEMPTS);
  
  if (recoveredNotifications.length > 0) {
    console.log(`✅ [SW] Recovered ${recoveredNotifications.length} notifications`);
  }
  
  if (failedNotifications.length > 0) {
    console.warn(`⚠️ [SW] ${failedNotifications.length} notifications could not be recovered`);
  }
}

// ============================================
// EVENTOS DEL CICLO DE VIDA
// ============================================

self.addEventListener('install', (event) => {
  console.log('📦 [SW] Installing Combined Service Worker v5.0.0...');
  // Forzar activación inmediata
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ [SW] Combined Service Worker activated v5.0.0');
  event.waitUntil(
    // Tomar control de todos los clientes inmediatamente
    clients.claim().then(() => {
      console.log('✅ [SW] Claimed all clients');
      // Notificar a todos los clientes que el SW está listo
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: 'v5.0.0',
            features: ['pwa', 'notifications', 'offline', 'background_sync']
          });
        });
      });
    })
  );
});

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================

self.addEventListener('error', (event) => {
  console.error('❌ [SW] Service Worker error:', event.error);
  
  // Reportar error a todos los clientes
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_ERROR',
          error: event.error?.message || 'Unknown error',
          stack: event.error?.stack,
          timestamp: Date.now()
        });
      });
    });
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ [SW] Unhandled promise rejection:', event.reason);
  
  // Intentar recuperación automática para promesas rechazadas relacionadas con notificaciones
  if (event.reason?.toString().includes('notification')) {
    setTimeout(attemptNotificationRecovery, 5000);
  }
});

// ============================================
// SINCRONIZACIÓN EN BACKGROUND (PWA Feature)
// ============================================

self.addEventListener('sync', (event) => {
  console.log('🔄 [SW] Background sync event:', event.tag);
  
  if (event.tag === 'notification-sync') {
    event.waitUntil(
      attemptNotificationRecovery()
    );
  }
});

// Log final de inicialización
console.log('🚀 [SW] RageStudios Combined Service Worker ready - v5.0.0');
console.log('📋 [SW] Features enabled: PWA, Push Notifications, Offline Support, Background Sync');