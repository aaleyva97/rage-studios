import {
  Injectable,
  signal,
  computed,
  PLATFORM_ID,
  inject,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase-service';
import {
  UserNotificationPreferences,
  NotificationPayload,
  NotificationPermissionResult,
  NotificationSchedule,
  NotificationType,
  PushToken,
  NotificationLog,
  DeviceInfo,
} from '../interfaces/notification.interface';
import { formatDateCustom } from '../functions/date-utils';

// Firebase v10 modular imports
import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  Messaging,
  isSupported,
  MessagePayload,
  Unsubscribe,
} from 'firebase/messaging';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
   private readonly router = inject(Router);

  // 🔥 Firebase Instances
  private firebaseApp: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private firebaseMessaging: any = null; // Alias para compatibilidad
  private tokenMonitorInterval: any = null;
  private messageUnsubscribe: Unsubscribe | null = null;

  // 🔄 TOKEN MANAGEMENT - CONFIGURACIÓN OPTIMIZADA
  private readonly TOKEN_CHECK_COOLDOWN = 2 * 60 * 1000; // ✅ REDUCIDO: 2 minutos (era 10)
  private readonly MAX_TOKEN_RETRIES = 3; // ✅ AUMENTADO: 3 reintentos (era 2)
  private tokenRetryCount = 0;
  private tokenValidationCache = {
    token: null as string | null,
    validatedAt: 0,
    ttl: 5 * 60 * 1000 // ✅ REDUCIDO: 5 minutos de cache (era 15)
  };
  // ❌ ELIMINADO: dbUpdateDebouncer - Ahora guardamos inmediatamente

  // 🔄 Reactive State Management
  private readonly _permissionStatus = signal<NotificationPermission>('default');
  private readonly _pushToken = signal<string | null>(null);
  private readonly _preferences = signal<UserNotificationPreferences | null>(null);
  private readonly _isInitialized = signal(false);
  private readonly _isLoading = signal(false);
  private readonly _serviceWorkerReady = signal(false);

  // ── IN-APP NOTIFICATIONS ──────────────────────────────────────────
  private readonly _history = signal<NotificationSchedule[]>([]);
  readonly history = this._history.asReadonly();
  private readonly _readIds = signal<Set<string>>(new Set());

  readonly unreadNotificationsCount = computed(() => {
    const read = this._readIds();
    return this._history().filter(n => !read.has(n.id)).length;
  });

  // 📊 Public Computed Properties
  readonly permissionStatus = this._permissionStatus.asReadonly();
  readonly pushToken = this._pushToken.asReadonly();
  readonly preferences = this._preferences.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly serviceWorkerReady = this._serviceWorkerReady.asReadonly();

  // Mantener compatibilidad con código existente
  readonly canScheduleNotifications = computed(
    () => this._preferences()?.notifications_enabled === true
  );

  readonly canSendPushNotifications = computed(
    () =>
      this._permissionStatus() === 'granted' &&
      this._pushToken() !== null &&
      this._preferences()?.push_notifications_enabled !== false &&
      this._serviceWorkerReady() === true
  );

  readonly canSendNotifications = computed(() =>
    this.canScheduleNotifications()
  );

  readonly isNotificationSupported = computed(
    () =>
      this.isBrowser &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
  );

  // 📡 Observable Streams
  private readonly _notificationReceived = new BehaviorSubject<NotificationPayload | null>(null);
  public readonly notificationReceived$ = this._notificationReceived.asObservable();

  // 🔥 Firebase Configuration
  private readonly firebaseConfig = {
    apiKey: 'AIzaSyA6cVv2nk-xMzVYqM8DQBQ-JeicvyhS8a4',
    authDomain: 'rage-studios.firebaseapp.com',
    projectId: 'rage-studios',
    storageBucket: 'rage-studios.firebasestorage.app',
    messagingSenderId: '401067010518',
    appId: '1:401067010518:web:b716d612274887ba6a9c77',
  };

  private readonly firebaseVapidKey =
    'BAZuWOr2cwR2etuTiZ6Xyxi8fYOTzpcfZUX3p0qugWGvI2jVkbckMi8Ltq6mHBDkc-5sSmQK2L_gXfonstfSDlM';

  constructor() {
    console.log('🔔 NotificationService: Constructor initialized');

    if (this.isBrowser) {
      this.initializeWhenReady();
    } else {
      console.log('🖥️ [SSR] Server-side rendering detected');
    }
  }

  /**
   * 🚨 INICIALIZACIÓN INTELIGENTE
   */
  private initializeWhenReady(): void {
    setTimeout(() => {
      if (this.isBrowser && typeof window !== 'undefined') {
        console.log('🔄 Starting intelligent initialization...');

        this.supabase.currentUser$.subscribe((user) => {
          if (user && !this._isInitialized()) {
            console.log('👤 User authenticated, initializing notifications...');
            this.initialize().catch((err) => {
              console.error('❌ Auto-initialization failed:', err);
            });
          } else if (!user) {
            console.log('👤 User logged out, resetting...');
            this.reset();
          }
        });
      }
    }, 1000);
  }

  /**
   * 🚀 MAIN INITIALIZATION
   */
  async initialize(): Promise<void> {
    if (this._isInitialized() || this._isLoading()) {
      return;
    }

    this._isLoading.set(true);

    try {
      console.log('🔄 Starting notification service initialization...');

      // Check capabilities
      const capabilities = this.diagnoseBrowserCapabilities();
      console.log('🔍 Browser capabilities:', capabilities);

      if (!capabilities.notificationSupported) {
        console.warn('⚠️ Push notifications not supported');
        return;
      }

      // Check permission
      this._permissionStatus.set(Notification.permission);
      console.log('🔐 Current permission:', this._permissionStatus());

      // Load preferences
      await this.loadUserPreferences();
      console.log('📋 User preferences loaded');

      // Initialize Firebase
      if (capabilities.serviceWorkerSupported) {
        await this.initializeFirebase();
        await this.registerServiceWorker();

        if (this._permissionStatus() === 'granted' && this._serviceWorkerReady()) {
          await this.tryGetExistingFirebaseToken();
        }

        this.setupFirebaseMessageHandlers();

        // ✅ NUEVO: Iniciar monitoreo conservador de tokens (solo si hay token)
        if (this._pushToken()) {
          console.log('🔄 Starting conservative token monitoring (24h intervals)');
          this.monitorTokenChanges();
        }
      }

      // Load notification history and setup realtime subscription
      await this.loadNotificationHistory();
      await this.setupRealtimeSubscription();

      // Configurar debug tools
      this.setupDebugTools();

      this._isInitialized.set(true);

      const status = this.getStatus();
      console.log('✅ NotificationService initialized:', status);

    } catch (error) {
      console.error('❌ Initialization failed:', error);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * 🔥 INITIALIZE FIREBASE (v10 Modular)
   */
  private async initializeFirebase(): Promise<void> {
    try {
      console.log('🔥 Initializing Firebase Messaging...');

      // Check if supported
      const supported = await isSupported();
      if (!supported) {
        console.warn('⚠️ Firebase Messaging not supported');
        return;
      }

      // Initialize app
      if (!this.firebaseApp) {
        this.firebaseApp = initializeApp(this.firebaseConfig);
      }

      // Get messaging instance
      this.messaging = getMessaging(this.firebaseApp);
      this.firebaseMessaging = this.messaging; // Alias para compatibilidad

      console.log('✅ Firebase Messaging initialized');
    } catch (error) {
      console.error('❌ Firebase initialization error:', error);
    }
  }


  /**
   * 🔄 HANDLE TOKEN REFRESH
   */
  private async handleTokenRefresh(newToken: string): Promise<void> {
    if (!newToken || newToken === this._pushToken()) {
      return;
    }

    console.log('🔄 Handling token refresh...');
    const oldToken = this._pushToken();

    // Actualizar token local
    this._pushToken.set(newToken);

    // Actualizar en base de datos
    await this.updateTokenInDatabase(newToken);

    // Registrar el cambio
    await this.logEvent('token_refreshed', {
      old_token: oldToken?.substring(0, 20),
      new_token: newToken.substring(0, 20),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 🔍 TRY GET EXISTING TOKEN
   */
  private async tryGetExistingFirebaseToken(): Promise<void> {
    if (!this.messaging || !this._serviceWorkerReady()) {
      console.log('ℹ️ Not ready for token retrieval');
      return;
    }

    try {
      console.log('🔍 Checking for existing FCM token...');

      const currentToken = await getToken(this.messaging, {
        vapidKey: this.firebaseVapidKey,
        serviceWorkerRegistration: await navigator.serviceWorker.ready,
      });

      if (currentToken) {
        console.log('✅ Found existing token:', currentToken.substring(0, 20) + '...');
        this._pushToken.set(currentToken);
        await this.updateTokenInDatabase(currentToken);
      } else {
        console.log('ℹ️ No existing token found');
      }
    } catch (error) {
      console.warn('⚠️ Could not get existing token:', error);
    }
  }

  /**
   * 📨 SETUP MESSAGE HANDLERS
   */
  private setupFirebaseMessageHandlers(): void {
    if (!this.messaging) return;

    console.log('🔧 Setting up message handlers...');

    // Handle foreground messages
    this.messageUnsubscribe = onMessage(this.messaging, (payload: MessagePayload) => {
      console.log('📨 Foreground message received:', payload);

      // Convert to NotificationPayload
      const notification: NotificationPayload = {
        title: payload.notification?.title || 'RageStudios',
        body: payload.notification?.body || 'Nueva notificación',
        icon: payload.notification?.icon,
        badge: payload.data?.['badge'],
        data: payload.data,
      };

      // Emit to subscribers
      this._notificationReceived.next(notification);

      // Show notification
      if (Notification.permission === 'granted') {
        const nativeNotification = new Notification(notification.title, {
          body: notification.body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: notification.data,
        });

        nativeNotification.onclick = () => {
          window.focus();
          const url = notification.data?.['actionUrl'] || '/dashboard/reservas';
          this.router.navigateByUrl(url);
          nativeNotification.close();
        };
      }

      // Refresh history from database to ensure alignment
      this.loadNotificationHistory().catch(err => console.error(err));

      // Log event
      this.logInteraction('push_message_received', { message: payload });
    });

    console.log('✅ Message handlers setup complete');
  }

  /**
   * 🔐 REQUEST PERMISSIONS
   */
  async requestPermissions(): Promise<NotificationPermissionResult> {
    try {
      console.log('🔐 Requesting notification permissions...');

      if (!this._serviceWorkerReady()) {
        await this.registerServiceWorker();
      }

      const permission = await Notification.requestPermission();
      this._permissionStatus.set(permission);

      const result: NotificationPermissionResult = {
        permission,
        granted: permission === 'granted',
        token: undefined, // No null
      };

      if (permission === 'granted') {
        console.log('✅ Permissions granted, registering token...');

        try {
          const token = await this.registerPushToken();
          result.token = token;
        } catch (tokenError) {
          console.error('⚠️ Token registration failed:', tokenError);
        }
      }

      await this.logEvent('permission_requested', {
        permission,
        granted: result.granted,
      });

      return result;
      
    } catch (error) {
      console.error('❌ Permission request error:', error);
      throw error;
    }
  }

  /**
   * 📱 REGISTER PUSH TOKEN - MEJORADO
   */
  async registerPushToken(): Promise<string> {
    if (!this.messaging) {
      throw new Error('Firebase Messaging not initialized');
    }

    if (this._permissionStatus() !== 'granted') {
      throw new Error('Notification permissions not granted');
    }

    try {
      console.log('📱 Registering FCM token...');

      const swRegistration = await navigator.serviceWorker.ready;

      // VALIDACIÓN: Verificar que el SW es el correcto
      if (!swRegistration.active?.scriptURL.includes('firebase-messaging-sw.js')) {
        console.warn('⚠️ Invalid service worker, re-registering...');
        await this.registerServiceWorker();
      }

      // ✅ RETRY MEJORADO: Más intentos, mejor logging
      if (this.tokenRetryCount >= this.MAX_TOKEN_RETRIES) {
        console.warn(`⚠️ Max token retries reached (${this.MAX_TOKEN_RETRIES}), resetting counter and trying once more`);
        this.tokenRetryCount = 0; // ✅ Reset para permitir futuros intentos
      }

      // Obtener token con reintentos exponenciales
      let token: string | undefined;
      let attempts = 0;
      let lastError: any = null;

      while (!token && attempts < this.MAX_TOKEN_RETRIES) {
        try {
          console.log(`🔑 Attempting to get FCM token (attempt ${attempts + 1}/${this.MAX_TOKEN_RETRIES})...`);

          token = await getToken(this.messaging, {
            vapidKey: this.firebaseVapidKey,
            serviceWorkerRegistration: swRegistration
          });

          if (token) {
            console.log(`✅ FCM token obtained on attempt ${attempts + 1}`);
            break;
          }

          // Si no obtuvo token pero tampoco hubo error
          if (attempts < this.MAX_TOKEN_RETRIES - 1) {
            const backoffTime = 1000 * Math.pow(2, attempts); // 1s, 2s, 4s
            console.log(`⏳ No token received, retrying in ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }

        } catch (error: any) {
          lastError = error;
          console.error(`❌ Token attempt ${attempts + 1} failed:`, error.message || error);

          if (attempts < this.MAX_TOKEN_RETRIES - 1) {
            const backoffTime = 1000 * Math.pow(2, attempts);
            console.log(`🔄 Retrying in ${backoffTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
        }

        attempts++;
        this.tokenRetryCount++;
      }

      if (!token) {
        const errorMsg = lastError
          ? `Failed after ${attempts} attempts. Last error: ${lastError.message || lastError}`
          : `Failed to get FCM token after ${attempts} attempts (no error reported)`;

        console.error('❌ Token registration failed:', errorMsg);

        // ✅ Log detallado del fallo
        await this.logEvent('token_registration_failed', {
          attempts,
          lastError: lastError?.message || lastError,
          swActive: !!swRegistration.active,
          swScriptURL: swRegistration.active?.scriptURL
        });

        throw new Error(errorMsg);
      }

      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');

      // Validar formato del token
      if (!this.isValidFCMToken(token)) {
        throw new Error('Invalid FCM token format');
      }

      this._pushToken.set(token);
      await this.updateTokenInDatabase(token);

      // Reset retry count on success
      this.tokenRetryCount = 0;
      
      await this.logEvent('token_registered', {
        deviceType: 'web',
        method: 'firebase_fcm',
        attempts: attempts,
        totalRetries: this.tokenRetryCount
      });

      return token;

    } catch (error) {
      console.error('❌ Token registration error:', error);
      throw error;
    }
  }

  /**
   * 💾 UPDATE TOKEN IN DATABASE - VERSIÓN OPTIMIZADA SIN DEBOUNCE
   */
  private async updateTokenInDatabase(token: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      console.warn('⚠️ No user authenticated');
      return;
    }

    // ✅ RATE LIMITING REDUCIDO: Solo 2 minutos entre actualizaciones (era 10)
    const lastUpdate = localStorage.getItem('fcm_last_db_update');
    const now = Date.now();
    if (lastUpdate && (now - parseInt(lastUpdate)) < this.TOKEN_CHECK_COOLDOWN) {
      console.log(`ℹ️ Rate limiting: skipping database update (cooldown: ${Math.round((this.TOKEN_CHECK_COOLDOWN - (now - parseInt(lastUpdate))) / 1000)}s remaining)`);
      return;
    }

    // ✅ SIN DEBOUNCE: Guardar INMEDIATAMENTE para no perder el token
    await this.performActualDatabaseUpdate(token, user, now);
  }

  /**
   * 💾 PERFORM ACTUAL DATABASE UPDATE - VERSIÓN CON VERIFICACIÓN POST-UPSERT
   */
  private async performActualDatabaseUpdate(token: string, user: any, now: number): Promise<void> {

    try {
      // Validar token antes de guardar
      if (!this.isValidFCMToken(token)) {
        console.error('❌ Invalid token format, not saving to database');
        await this.logEvent('token_save_failed', {
          reason: 'invalid_format',
          tokenPreview: token.substring(0, 30)
        });
        return;
      }

      // ✅ LOGGING EXHAUSTIVO: Debug completo del contexto de autenticación
      console.log('🔍 DB Update Context:', {
        userId: user.id,
        tokenPreview: token.substring(0, 30) + '...',
        tokenLength: token.length,
        timestamp: new Date().toISOString()
      });

      // Verificar sesión activa
      const { data: sessionData } = await this.supabase.client.auth.getSession();
      if (!sessionData?.session) {
        console.error('❌ No active session during token update');
        await this.logEvent('token_save_failed', {
          reason: 'no_active_session',
          userId: user.id
        });
        return;
      }

      console.log('✅ Active session confirmed:', {
        sessionUserId: sessionData.session.user.id,
        matchesUser: sessionData.session.user.id === user.id
      });

      // Verificar cache de validación
      const cachedToken = this.tokenValidationCache.token;
      if (cachedToken === token && (now - this.tokenValidationCache.validatedAt) < this.tokenValidationCache.ttl) {
        console.log('ℹ️ Token unchanged and cache valid, skipping update');
        return;
      }

      const pushTokenData: PushToken = {
        token: token,
        deviceType: 'web',
        isActive: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString()
      };

      // Actualizar con verificación de cambios
      const { data: existing, error: selectError } = await this.supabase.client
        .from('user_notification_preferences')
        .select('primary_device_token, last_token_updated_at')
        .eq('user_id', user.id)
        .single();

      if (selectError) {
        console.warn('⚠️ Pre-upsert SELECT failed:', selectError);
        await this.logEvent('token_precheck_failed', {
          error: selectError.message,
          code: selectError.code,
          userId: user.id
        });
        // Continuar con upsert de todas formas
      }

      if (existing?.primary_device_token === token) {
        console.log('ℹ️ Token unchanged in database, updating cache only');
        this.tokenValidationCache = { token, validatedAt: now, ttl: this.tokenValidationCache.ttl };
        return;
      }

      console.log('🔄 Attempting upsert...');

      // ✅ CAPTURA COMPLETA: data, error, status, statusText
      const upsertPayload = {
        user_id: user.id,
        primary_device_token: token,
        push_tokens: [pushTokenData],
        last_token_updated_at: new Date().toISOString(),
        push_notifications_enabled: true,
        updated_at: new Date().toISOString()
      };

      const { data: upsertData, error: upsertError, status, statusText } = await this.supabase.client
        .from('user_notification_preferences')
        .upsert(upsertPayload, {
          onConflict: 'user_id'
        })
        .select(); // ✅ CRÍTICO: Agregar .select() para obtener data de respuesta

      // ✅ LOGGING COMPLETO de la respuesta
      console.log('📊 Upsert response:', {
        status,
        statusText,
        hasData: !!upsertData,
        dataCount: upsertData?.length || 0,
        hasError: !!upsertError,
        error: upsertError
      });

      if (upsertError) {
        // Manejar errores de rate limiting específicamente
        if (upsertError.message?.includes('rate limit') || upsertError.code === 'too_many_requests') {
          console.warn('⚠️ Rate limit reached, deferring token update');
          await this.logEvent('token_save_rate_limited', {
            error: upsertError.message,
            userId: user.id
          });
          // Intentar de nuevo en 5 minutos
          setTimeout(() => {
            this.updateTokenInDatabase(token).catch(console.error);
          }, 5 * 60 * 1000);
          return;
        }

        // Log del error completo antes de lanzar
        console.error('❌ Upsert error details:', {
          message: upsertError.message,
          code: upsertError.code,
          details: upsertError.details,
          hint: upsertError.hint
        });

        await this.logEvent('token_save_failed', {
          error: upsertError.message,
          code: upsertError.code,
          details: upsertError.details,
          userId: user.id
        });

        throw upsertError;
      }

      // ✅ VERIFICACIÓN POST-UPSERT: Confirmar que se guardó en BD
      console.log('🔍 Verifying token was saved...');

      const { data: verification, error: verifyError } = await this.supabase.client
        .from('user_notification_preferences')
        .select('primary_device_token, last_token_updated_at, updated_at')
        .eq('user_id', user.id)
        .single();

      if (verifyError) {
        console.error('❌ Post-upsert verification failed:', verifyError);
        await this.logEvent('token_verification_failed', {
          error: verifyError.message,
          userId: user.id
        });
        throw new Error(`Token upsert appeared to succeed but verification failed: ${verifyError.message}`);
      }

      if (!verification || verification.primary_device_token !== token) {
        const errorMsg = verification
          ? `Token mismatch after upsert. Expected: ${token.substring(0, 20)}..., Got: ${verification.primary_device_token?.substring(0, 20) || 'null'}...`
          : 'No record found after upsert';

        console.error('❌ Verification failed:', errorMsg);
        await this.logEvent('token_persistence_failed', {
          reason: verification ? 'token_mismatch' : 'record_not_found',
          expectedToken: token.substring(0, 30),
          actualToken: verification?.primary_device_token?.substring(0, 30) || null,
          userId: user.id
        });

        throw new Error(errorMsg);
      }

      console.log('✅ Token verified in database:', {
        tokenMatches: true,
        lastUpdated: verification.last_token_updated_at,
        recordUpdated: verification.updated_at
      });

      localStorage.setItem('fcm_last_db_update', now.toString());

      // Actualizar cache de validación
      this.tokenValidationCache = { token, validatedAt: now, ttl: this.tokenValidationCache.ttl };

      // Log éxito con todos los detalles
      await this.logEvent('token_saved_successfully', {
        userId: user.id,
        deviceType: 'web',
        lastUpdated: verification.last_token_updated_at,
        verificationPassed: true
      });

      // Forzar sincronización de notificaciones programadas solo si es necesario
      await this.syncScheduledNotifications(user.id, token);

    } catch (error: any) {
      console.error('❌ Database update error:', error);

      // Log error completo incluyendo stack trace
      await this.logEvent('token_update_exception', {
        error: error?.message || String(error),
        stack: error?.stack?.substring(0, 200),
        userId: user?.id
      });

      throw error;
    }
  }

  /**
   * 🔍 VALIDATE FCM TOKEN FORMAT - VERSIÓN MEJORADA
   */
  private isValidFCMToken(token: string): boolean {
    if (!token || typeof token !== 'string') {
      console.warn('⚠️ Token validation failed: empty or invalid type');
      return false;
    }

    if (token.startsWith('eyJ')) {
      console.warn('⚠️ Token validation failed: JWT format detected (not FCM)');
      return false;
    }

    if (token.length < 100) {
      console.warn(`⚠️ Token validation failed: too short (${token.length} chars, minimum 100)`);
      return false;
    }

    if (token.includes(' ')) {
      console.warn('⚠️ Token validation failed: contains spaces');
      return false;
    }

    // ✅ VALIDACIÓN MEJORADA: FCM tokens tienen formato "xxxxx:xxxxxxxxx"
    // Acepta caracteres alfanuméricos, guiones y guiones bajos
    const fcmPattern = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/;

    if (!fcmPattern.test(token)) {
      console.warn('⚠️ Token validation failed: does not match FCM pattern (expected format: xxxxx:xxxxxxxxx)');
      console.warn(`   Token preview: ${token.substring(0, 30)}...`);
      return false;
    }

    console.log('✅ Token validation passed');
    return true;
  }

  /**
   * 🔄 MONITOR TOKEN CHANGES - VERSIÓN ULTRA-CONSERVADORA
   * ✅ Solo verificar cuando sea absolutamente necesario para evitar sobrecarga
   */
  private async monitorTokenChanges(): Promise<void> {
    if (!this.messaging) return;

    console.log('🔄 Starting conservative token monitoring (checks every 24h)...');

    // ✅ ULTRA-CONSERVADOR: Solo cada 24 horas
    this.tokenMonitorInterval = setInterval(async () => {
      if (!this.messaging || this._permissionStatus() !== 'granted') return;

      try {
        // Solo verificar si tenemos una sesión activa
        const sessionResult = await this.supabase.getSessionSafe();
        if (!sessionResult || !sessionResult.data?.session) {
          console.log('ℹ️ No active session, skipping token check');
          return;
        }

        const currentStoredToken = this._pushToken();
        if (!currentStoredToken) {
          console.log('ℹ️ No stored token, skipping verification');
          return;
        }

        // ✅ COOLDOWN DE 48 HORAS entre verificaciones
        const lastCheck = localStorage.getItem('fcm_last_token_check');
        const now = Date.now();
        const cooldownHours = 48;

        if (lastCheck && (now - parseInt(lastCheck)) < cooldownHours * 60 * 60 * 1000) {
          const hoursRemaining = Math.ceil((cooldownHours * 60 * 60 * 1000 - (now - parseInt(lastCheck))) / (60 * 60 * 1000));
          console.log(`ℹ️ Token check cooldown active (${hoursRemaining}h remaining)`);
          return;
        }

        console.log('🔍 Performing scheduled token verification...');

        const actualToken = await getToken(this.messaging, {
          vapidKey: this.firebaseVapidKey
        });

        if (actualToken && actualToken !== currentStoredToken) {
          console.log('🔄 Token change detected, updating database');
          await this.handleTokenRefresh(actualToken);
        } else if (actualToken) {
          console.log('✅ Token verified, no changes');
        }

        localStorage.setItem('fcm_last_token_check', now.toString());

      } catch (error: any) {
        console.error('❌ Token monitoring error:', error);

        // Log del error pero no detener el monitoreo
        await this.logEvent('token_monitor_error', {
          error: error?.message || error,
          timestamp: new Date().toISOString()
        });

        // Si hay error de rate limiting, simplemente omitir esta verificación
        if (error?.message?.includes('rate limit')) {
          console.log('⚠️ Rate limit detected, will retry in next scheduled check');
        }
      }
    }, 24 * 60 * 60 * 1000); // ✅ 24 horas entre verificaciones automáticas
  }

  /**
   * 🔧 ATTEMPT TOKEN RECOVERY
   */
  private async attemptTokenRecovery(): Promise<void> {
    console.log('🔧 Attempting token recovery...');

    try {
      // Limpiar token actual
      this._pushToken.set(null);

      // Limpiar en base de datos
      const user = await this.getCurrentUser();
      if (user) {
        await this.supabase.client
          .from('user_notification_preferences')
          .update({
            primary_device_token: null,
            last_token_updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
      }

      // Re-registrar service worker
      await this.registerServiceWorker();

      // Obtener nuevo token
      if (this._permissionStatus() === 'granted') {
        await this.registerPushToken();
        console.log('✅ Token recovery successful');
      }
    } catch (error) {
      console.error('❌ Token recovery failed:', error);
    }
  }

  /**
   * 🔄 SYNC SCHEDULED NOTIFICATIONS
   */
  private async syncScheduledNotifications(userId: string, newToken: string): Promise<void> {
    try {
      console.log('🔄 Syncing scheduled notifications with new token...');

      // Actualizar directamente las notificaciones programadas
      const { error } = await this.supabase.client
        .from('notification_schedules')
        .update({
          push_token: newToken,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'scheduled');

      if (error) {
        console.error('❌ Error syncing notifications:', error);

        // Intentar con RPC si existe
        const { error: rpcError } = await this.supabase.client
          .rpc('update_user_notification_tokens', {
            p_user_id: userId,
            p_new_token: newToken
          });

        if (rpcError) {
          console.error('❌ RPC error:', rpcError);
        }
      } else {
        console.log('✅ Scheduled notifications synced');
      }
    } catch (error) {
      console.error('❌ Sync error:', error);
    }
  }

/**
 * 📅 SCHEDULE BOOKING NOTIFICATIONS - VERSIÓN ROBUSTA CON HORA DEL SERVIDOR
 */
async scheduleBookingNotifications(booking: any): Promise<{ success: boolean; reason?: string; count?: number }> {
  const canSchedule = this.canScheduleNotifications();
  const status = this.getStatus();

  if (!canSchedule) {
    const reason = `Cannot schedule notifications - Preferences disabled`;
    console.warn('⚠️ Cannot schedule notifications:', reason);
    return { success: false, reason };
  }

  console.log('📅 Scheduling notifications (Server Time):', {
    booking_id: booking.id,
    session_date: booking.session_date,
    session_time: booking.session_time,
    canSchedule,
    permission: status.permission,
    hasToken: status.hasToken,
  });

  try {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const preferences = this._preferences();
    if (!preferences) throw new Error('User preferences not loaded');

    // Preparar los payloads
    const confirmationPayload = await this.buildNotificationPayload('booking_confirmation', booking);
    const reminder24hPayload = await this.buildNotificationPayload('reminder_24h', booking);
    const reminder1hPayload = await this.buildNotificationPayload('reminder_1h', booking);

    // Token push (puede ser null)
    const pushToken = this.canSendPushNotifications() ? this._pushToken() : null;

    console.log('📡 Calling server function with token:', !!pushToken);

    // LLAMAR A LA FUNCIÓN ROBUSTA DEL SERVIDOR
    const { data, error } = await this.supabase.client.rpc('schedule_all_booking_notifications', {
      p_booking_id: booking.id,
      p_user_id: user.id,
      p_session_date: booking.session_date,
      p_session_time: booking.session_time,
      p_confirmation_payload: confirmationPayload,
      p_reminder_24h_payload: reminder24hPayload,
      p_reminder_1h_payload: reminder1hPayload,
      p_token: pushToken,
      p_preferences: {
        booking_confirmation_enabled: preferences.booking_confirmation_enabled !== false,
        reminder_24h_enabled: preferences.reminder_24h_enabled !== false,
        reminder_1h_enabled: preferences.reminder_1h_enabled !== false
      }
    });

    if (error) {
      console.error('❌ RPC Error:', error);
      throw error;
    }

    if (!data || !data.success) {
      console.error('❌ Server returned error:', data);
      return {
        success: false,
        reason: data?.error || 'Unknown server error'
      };
    }

    console.log('✅ Notifications scheduled successfully:', {
      count: data.count,
      server_time_mexico: data.server_time_mexico,
      details: data.notifications
    });

    // Log del evento
    await this.logEvent('notifications_scheduled', {
      bookingId: booking.id,
      count: data.count,
      serverTime: data.server_time_mexico,
      types: data.notifications?.map((n: any) => n.type) || []
    });

    return {
      success: true,
      count: data.count || 0
    };

  } catch (error) {
    console.error('❌ Error in scheduleBookingNotifications:', error);
    
    await this.logEvent('scheduling_failed', {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

  /**
   * 🚫 CANCEL BOOKING NOTIFICATIONS
   */
  async cancelBookingNotifications(bookingId: string): Promise<void> {
    try {
      console.log('🚫 Cancelling notifications for booking:', bookingId);

      const { error } = await this.supabase.client
        .from('notification_schedules')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('booking_id', bookingId)
        .in('status', ['scheduled', 'failed']);

      if (error) {
        console.error('❌ Error cancelling notifications:', error);
        throw error;
      }

      console.log(`✅ Cancelled notifications for booking ${bookingId}`);

      await this.logEvent('notifications_cancelled', {
        bookingId,
        cancelledAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('❌ Error in cancelBookingNotifications:', error);
      throw error;
    }
  }

  /**
   * 🔔 BUILD NOTIFICATION PAYLOAD
   */
  private async buildNotificationPayload(type: NotificationType, booking: any): Promise<NotificationPayload> {
    try {
      // Build variables for template
      const variables = {
        user_name: booking.user?.full_name || 'Usuario',
        class_name: booking.class_name || 'tu clase',
        session_date: formatDateCustom(booking.session_date, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        session_time: booking.session_time,
        coach_name: booking.coach_name || 'tu coach',
        bed_numbers: Array.isArray(booking.bed_numbers)
          ? booking.bed_numbers.join(', ')
          : booking.bed_numbers || '',
      };

      console.log('🏗️ Processing notification template:', type, 'with variables:', variables);

      // Get processed template from database
      const { data, error } = await this.supabase.client.rpc('process_notification_template', {
        p_template_key: `${type}_es`,
        p_language_code: 'es-MX',
        p_variables: variables,
      });

      if (error) {
        console.error('❌ Error processing template:', error);
        return this.getFallbackPayload(type, booking);
      }

      const payload: NotificationPayload = {
        title: data.title,
        body: data.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: {
          bookingId: booking.id,
          type,
          actionUrl: data.action_url || '/account/bookings',
          timestamp: new Date().toISOString(),
        },
      };

      if (data.action_text) {
        payload.actions = [
          {
            action: 'view',
            title: data.action_text,
          },
        ];
      }

      console.log('✅ Notification payload built:', payload);
      return payload;
    } catch (error) {
      console.error('❌ Error building payload:', error);
      return this.getFallbackPayload(type, booking);
    }
  }

  /**
   * 🔄 GET FALLBACK PAYLOAD
   */
  private getFallbackPayload(type: NotificationType, booking: any): NotificationPayload {
    const fallbackMessages = {
      booking_confirmation: {
        title: '¡Reserva confirmada! 🎉',
        body: `Tu clase de ${booking.class_name || 'fitness'} está confirmada.`,
      },
      reminder_24h: {
        title: 'Tu clase es mañana 📅',
        body: `Recuerda que mañana tienes ${booking.class_name || 'tu clase'}.`,
      },
      reminder_1h: {
        title: 'Tu clase comienza en 1 hora ⏰',
        body: `${booking.class_name || 'Tu clase'} comienza pronto. ¡Te esperamos!`,
      },
      cancellation_user: {
        title: 'Reserva cancelada ✅',
        body: 'Tu reserva ha sido cancelada exitosamente.',
      },
      cancellation_admin: {
        title: 'Cambio en tu reserva 📋',
        body: 'Tu reserva ha sido modificada por el administrador.',
      },
      class_update: {
        title: 'Actualización de clase 📝',
        body: 'Hay cambios en tu clase programada.',
      },
    };

    const message = fallbackMessages[type] || fallbackMessages.booking_confirmation;

    return {
      title: message.title,
      body: message.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        bookingId: booking.id,
        type,
        actionUrl: '/account/bookings',
        timestamp: new Date().toISOString(),
        fallback: true,
      },
    };
  }

  /**
   * 📊 LOG EVENT - PÚBLICO
   */
  async logEvent(eventType: string, data?: any): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return;

      const logEntry: Partial<NotificationLog> = {
        user_id: user.id,
        log_type: 'user_interaction',
        success: true,
        user_action: eventType,
        action_data: data,
        device_info: this.getDeviceInfo(),
        created_at: new Date().toISOString(),
      };

      await this.supabase.client.from('notification_logs').insert([logEntry]);
    } catch (error) {
      console.warn('⚠️ Could not log event:', eventType, error);
    }
  }

  /**
   * 📊 LOG INTERACTION - PÚBLICO
   */
  async logInteraction(action: string, data?: any): Promise<void> {
    await this.logEvent(action, data);
  }

  /**
   * 📋 LOAD USER PREFERENCES
   */
  private async loadUserPreferences(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        console.log('ℹ️ No user authenticated');
        return;
      }

      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error loading preferences:', error);
        return;
      }

      if (data) {
        this._preferences.set(data);
        console.log('✅ User preferences loaded');
      } else {
        console.log('📝 Creating default preferences...');
        await this.createDefaultPreferences();
      }
    } catch (error) {
      console.error('❌ Error in loadUserPreferences:', error);
    }
  }

  /**
   * 🔄 CREATE DEFAULT PREFERENCES
   */
  private async createDefaultPreferences(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    const defaultPrefs: Partial<UserNotificationPreferences> = {
      user_id: user.id,
      notifications_enabled: true,
      timezone_identifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preferred_language: navigator.language.startsWith('es') ? 'es' : 'en',
      booking_confirmation_enabled: true,
      reminder_24h_enabled: true,
      reminder_1h_enabled: true,
      cancellation_notifications_enabled: true,
      class_update_notifications_enabled: true,
      push_notifications_enabled: true,
      email_notifications_enabled: false,
      sms_notifications_enabled: false,
      quiet_hours_enabled: false,
      message_style: 'standard',
      include_coach_info: true,
      include_location_info: true,
      include_quick_actions: true,
      allow_admin_override: true,
    };

    try {
      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .insert([defaultPrefs])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating default preferences:', error);
        return;
      }

      this._preferences.set(data);
      console.log('✅ Default preferences created');
    } catch (error) {
      console.error('❌ Error creating default preferences:', error);
    }
  }

  /**
   * 📡 GET AVAILABLE DELIVERY CHANNELS
   */
  private getAvailableDeliveryChannels(): string[] {
    const channels: string[] = [];

    // Database always available
    channels.push('database');

    // Push if token available
    if (this.canSendPushNotifications()) {
      channels.push('push');
      console.log('✅ Push notifications enabled with valid token');
    } else {
      console.log('⚠️ Push notifications disabled - will use database only');
    }

    // Email if enabled
    const preferences = this._preferences();
    if (preferences?.email_notifications_enabled) {
      channels.push('email');
    }

    console.log('📡 Final delivery channels:', channels);
    return channels;
  }

  /**
   * 📊 EXTRACT SESSION DATA
   */
  private extractSessionData(booking: any): Record<string, any> {
    return {
      className: booking.class_name,
      coachName: booking.coach_name,
      sessionDate: booking.session_date,
      sessionTime: booking.session_time,
      bedNumbers: booking.bed_numbers,
      totalAttendees: booking.total_attendees,
      creditsUsed: booking.credits_used,
    };
  }

  /**
   * 🔍 DIAGNOSE BROWSER CAPABILITIES
   */
  private diagnoseBrowserCapabilities() {
    const capabilities = {
      isBrowser: this.isBrowser,
      hasWindow: typeof window !== 'undefined',
      notificationSupported: false,
      serviceWorkerSupported: false,
      pushManagerSupported: false,
      permissionStatus: 'unknown',
      isDevelopment: false,
    };

    if (!this.isBrowser || typeof window === 'undefined') {
      console.log('🖥️ Server-side rendering detected');
      return capabilities;
    }

    capabilities.notificationSupported = 'Notification' in window;
    capabilities.serviceWorkerSupported = 'serviceWorker' in navigator;
    capabilities.pushManagerSupported = 'PushManager' in window;
    capabilities.permissionStatus = Notification?.permission || 'unknown';
    capabilities.isDevelopment = this.isDevelopmentEnvironment();

    return capabilities;
  }

  /**
   * 🔍 CHECK IF DEVELOPMENT
   */
  private isDevelopmentEnvironment(): boolean {
    if (!this.isBrowser || typeof window === 'undefined') {
      return false;
    }

    const hostname = window.location?.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname?.includes('.local')) {
      return true;
    }

    const port = window.location?.port;
    if (port && ['3000', '4200', '8080', '5173', '5174'].includes(port)) {
      return true;
    }

    return false;
  }

  /**
   * 🔧 DEVICE INFO
   */
  private getDeviceInfo(): DeviceInfo {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    };
  }

  /**
   * 👤 GET CURRENT USER
   */
  private async getCurrentUser() {
    const {
      data: { user },
    } = await this.supabase.client.auth.getUser();
    return user;
  }

  /**
   * 📊 GET STATUS - PÚBLICO
   */
  getStatus() {
    return {
      initialized: this._isInitialized(),
      supported: this.isNotificationSupported(),
      permission: this._permissionStatus(),
      hasToken: !!this._pushToken(),
      pushToken: this._pushToken(),
      canSend: this.canSendNotifications(),
      canSchedule: this.canScheduleNotifications(),
      canSendPush: this.canSendPushNotifications(),
      hasPreferences: !!this._preferences(),
      loading: this._isLoading(),
    };
  }

  /**
   * 🧪 TEST NOTIFICATION - DEBUG
   */
  async testNotification(type: NotificationType = 'booking_confirmation'): Promise<void> {
    if (!this.isBrowser || this._permissionStatus() !== 'granted') {
      console.warn('⚠️ Cannot test notification: permission not granted');
      return;
    }

    const testBooking = {
      id: 'test-' + Date.now(),
      class_name: 'Test Class',
      session_date: '2025-01-28',
      session_time: '10:00:00',
      coach_name: 'Test Coach',
      bed_numbers: ['1', '2'],
      user: { full_name: 'Test User' },
    };

    const payload = await this.buildNotificationPayload(type, testBooking);

    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data,
    });

    await this.logEvent('test_notification_sent', { type, payload });
    console.log('🧪 Test notification sent:', payload);
  }

  /**
   * 🔧 FORCE REGISTER TOKEN - DEBUG
   */
  async forceRegisterPushToken(): Promise<void> {
    console.log('🚨 Force registering push token...');

    try {
      const currentStatus = this.getStatus();
      console.log('📊 Current status:', currentStatus);

      if (!this.messaging) {
        console.error('❌ Firebase Messaging not initialized');
        await this.initializeFirebase();
      }

      if (this._permissionStatus() !== 'granted') {
        console.error('❌ Permissions not granted');
        const permissions = await this.requestPermissions();
        console.log('🔑 Permission result:', permissions);
        return;
      }

      console.log('🔑 Forcing push token registration...');
      const token = await this.registerPushToken();
      console.log('🎉 Force registration successful! Token:', !!token);
    } catch (error) {
      console.error('❌ Force registration failed:', error);
    }
  }

  /**
   * 🧪 VALIDATE NOTIFICATION SETUP
   */
  async validateNotificationSetup(): Promise<any> {
    const diagnostics = {
      serviceWorkers: [] as any[],
      fcmToken: null as string | null,
      dbToken: null as string | null,
      tokensMatch: false,
      scheduledNotifications: 0,
      errors: [] as string[]
    };

    try {
      // Check service workers
      const registrations = await navigator.serviceWorker.getRegistrations();
      diagnostics.serviceWorkers = registrations.map(reg => ({
        scope: reg.scope,
        scriptURL: reg.active?.scriptURL,
        state: reg.active?.state
      }));

      // Check FCM token
      if (this.messaging) {
        try {
          diagnostics.fcmToken = await getToken(this.messaging, {
            vapidKey: this.firebaseVapidKey
          });
        } catch (e) {
          diagnostics.errors.push('Cannot get FCM token');
        }
      }

      // Check DB token
      const user = await this.getCurrentUser();
      if (user) {
        const { data } = await this.supabase.client
          .from('user_notification_preferences')
          .select('primary_device_token')
          .eq('user_id', user.id)
          .single();

        diagnostics.dbToken = data?.primary_device_token || null;

        // Check scheduled notifications
        const { count } = await this.supabase.client
          .from('notification_schedules')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'scheduled');

        diagnostics.scheduledNotifications = count || 0;
      }

      // Compare tokens
      diagnostics.tokensMatch = !!(diagnostics.fcmToken && diagnostics.dbToken &&
                                  diagnostics.fcmToken === diagnostics.dbToken);

      // Identify issues
      if (diagnostics.serviceWorkers.length > 1) {
        diagnostics.errors.push('Multiple service workers detected');
      }
      if (!diagnostics.fcmToken) {
        diagnostics.errors.push('No FCM token available');
      }
      if (!diagnostics.tokensMatch) {
        diagnostics.errors.push('Token mismatch between FCM and database');
      }
      if (diagnostics.fcmToken && !this.isValidFCMToken(diagnostics.fcmToken)) {
        diagnostics.errors.push('Invalid FCM token format');
      }

    } catch (error: any) {
      diagnostics.errors.push(`Diagnostic error: ${error.message || error}`);
    }

    console.log('📊 Notification Setup Diagnostics:', diagnostics);
    return diagnostics;
  }

  /**
   * 🔧 SETUP DEBUG TOOLS
   */
  private setupDebugTools(): void {
    if (!this.isDevelopmentEnvironment()) return;

    const debugTools = {
      getStatus: () => this.getStatus(),
      testNotification: (type?: NotificationType) => this.testNotification(type),
      forceRegister: () => this.forceRegisterPushToken(),
      validateSetup: () => this.validateNotificationSetup(),
      recoverToken: () => this.attemptTokenRecovery(),
      cleanupServiceWorkers: async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
          console.log('✅ All service workers unregistered');
        } catch (error) {
          console.error('❌ Error cleaning service workers:', error);
        }
      }
    };

    (window as any).debugNotifications = debugTools;
    console.log('🔧 Debug tools available: window.debugNotifications');
  }

  /**
   * 🔄 RESET SERVICE
   */
  private reset(): void {
    this._permissionStatus.set('default');
    this._pushToken.set(null);
    this._preferences.set(null);
    this._isInitialized.set(false);
    this._history.set([]);
    this._readIds.set(new Set());
    
    // Limpiar canales de tiempo real
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }

    // Limpiar intervalos
    if (this.tokenMonitorInterval) {
      clearInterval(this.tokenMonitorInterval);
      this.tokenMonitorInterval = null;
    }
    
    console.log('🔄 NotificationService reset');
  }

  /**
   * 📊 GET PERMISSION STATUS
   */
  getPermissionStatus(): NotificationPermission {
    return this._permissionStatus();
  }






/**
 * 🔧 REGISTER SERVICE WORKER - VERSIÓN MEJORADA PARA SW COMBINADO
 */
private async registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ Service Worker not supported');
    return;
  }

  try {
    console.log('📦 Starting Service Worker registration process...');
    
    // Detectar el entorno
    const isDevelopment = !environment.production;
    console.log('🔍 Environment:', isDevelopment ? 'development' : 'production');
    
    // Validar configuración
    if (!environment.serviceWorker?.enabled) {
      console.warn('⚠️ Service Worker disabled in environment');
      this._serviceWorkerReady.set(false);
      return;
    }

    // Limpiar SW antiguos
    const existingRegs = await navigator.serviceWorker.getRegistrations();
    for (const reg of existingRegs) {
      if (reg.active?.scriptURL.includes('ngsw-worker.js')) {
        console.log('🧹 Removing old Angular SW...');
        await reg.unregister();
      }
    }

    // ✅ TIMEOUT REDUCIDO: Esperar al SW con timeout más corto
    console.log('⏳ Waiting for Service Worker registration...');

    let attempts = 0;
    const maxAttempts = isDevelopment ? 10 : 20; // ✅ REDUCIDO: 5s dev, 10s prod (era 10s/30s)
    const checkInterval = 500; // Check cada 500ms

    while (attempts < maxAttempts) {
      const reg = await navigator.serviceWorker.getRegistration('/');

      if (reg?.active?.scriptURL.includes('firebase-messaging-sw.js')) {
        console.log('✅ Combined Service Worker registered!');
        this._serviceWorkerReady.set(true);
        this.setupServiceWorkerListener();
        await this.verifyServiceWorkerStatus();

        // ✅ NUEVO: Intentar obtener token inmediatamente si hay permisos
        if (this._permissionStatus() === 'granted') {
          console.log('🔑 SW ready + permissions granted → attempting immediate token retrieval');
          this.tryGetExistingFirebaseToken().catch(err =>
            console.warn('⚠️ Immediate token retrieval failed:', err)
          );
        }

        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
      attempts++;

      if (attempts % 4 === 0) {
        console.log(`⏳ Still waiting for SW... (${(attempts * checkInterval) / 1000}s)`);
      }
    }
    
    // Solo en desarrollo, intentar registro manual como fallback
    if (isDevelopment && window.location.hostname === 'localhost') {
      console.warn('⚠️ Attempting manual registration (dev fallback)...');
      
      try {
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
          updateViaCache: 'none'
        });
        
        await navigator.serviceWorker.ready;
        console.log('✅ Manual registration successful');
        this._serviceWorkerReady.set(true);
        this.setupServiceWorkerListener();
        await this.verifyServiceWorkerStatus();
        
      } catch (error) {
        console.error('❌ Manual registration failed:', error);
        this._serviceWorkerReady.set(false);
      }
    } else {
      console.error('❌ Service Worker registration timeout');
      this._serviceWorkerReady.set(false);
    }
    
  } catch (error) {
    console.error('❌ Service Worker registration error:', error);
    this._serviceWorkerReady.set(false);
  }
}

/**
 * 🔄 SETUP SERVICE WORKER LISTENER - MEJORADO
 */
private setupServiceWorkerListener(): void {
  if (!('serviceWorker' in navigator)) return;

  // Remover listeners anteriores si existen
  if (this.swMessageHandler) {
    navigator.serviceWorker.removeEventListener('message', this.swMessageHandler);
  }

  // Crear nuevo handler
  this.swMessageHandler = async (event: MessageEvent) => {
    console.log('📨 Message from SW:', event.data);

    const { type, data } = event.data;

    switch(type) {
      case 'TOKEN_REFRESHED':
        console.log('🔄 Token refreshed by SW');
        await this.handleTokenRefresh(event.data.token);
        break;

      case 'SW_ERROR':
        console.error('❌ SW Error:', event.data.error);
        await this.attemptTokenRecovery();
        break;

      case 'NOTIFICATION_RECEIVED':
        console.log('📨 Notification received in foreground');
        this.handleForegroundNotification(event.data.payload);
        break;

      case 'SW_ACTIVATED':
        console.log('✅ SW Activated with features:', event.data.features);
        this._serviceWorkerReady.set(true);
        break;

      case 'STATUS':
        console.log('📊 SW Status:', event.data);
        break;
    }
  };

  // Añadir listener
  navigator.serviceWorker.addEventListener('message', this.swMessageHandler);
  console.log('✅ Service Worker listener configured');
}

/**
 * 🔍 VERIFICAR ESTADO DEL SERVICE WORKER
 */
private async verifyServiceWorkerStatus(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    if (!registration.active) {
      console.warn('⚠️ No active Service Worker');
      return;
    }

    // Crear canal de mensajes para comunicación bidireccional
    const messageChannel = new MessageChannel();
    
    // Configurar listener para la respuesta
    messageChannel.port1.onmessage = (event) => {
      if (event.data.type === 'STATUS') {
        console.log('✅ Service Worker status verified:', event.data);
        
        // Verificar que tiene todas las características necesarias
        if (event.data.features?.pwa && event.data.features?.notifications) {
          console.log('✅ All required features are active');
        } else {
          console.warn('⚠️ Some features may not be active:', event.data.features);
        }
      }
    };

    // Enviar mensaje de verificación
    registration.active.postMessage(
      { type: 'CHECK_STATUS' },
      [messageChannel.port2]
    );
    
  } catch (error) {
    console.error('❌ Error verifying SW status:', error);
  }
}

/**
   * 🔄 MANEJAR NOTIFICACIÓN EN FOREGROUND - CORREGIDO
   */
  private handleForegroundNotification(payload: any): void {
    // Convertir a NotificationPayload
    const notification: NotificationPayload = {
      title: payload.notification?.title || 'RageStudios',
      body: payload.notification?.body || 'Nueva notificación',
      icon: payload.notification?.icon,
      badge: payload.data?.['badge'], // ✅ CORREGIDO: Index signature access
      data: payload.data
    };
    
    // Emitir a suscriptores
    this._notificationReceived.next(notification);
    
    // Mostrar notificación nativa si está permitido
    if (Notification.permission === 'granted' && this._preferences()?.notifications_enabled) {
      const nativeNotification = new Notification(notification.title, {
        body: notification.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: notification.data,
        requireInteraction: false,
        silent: false
      });
      
      nativeNotification.onclick = () => {
        window.focus();
        // ✅ CORREGIDO: Acceso correcto con index signature
        const url = notification.data?.['actionUrl'] || '/account/bookings';
        // ✅ CORREGIDO: Usar router inyectado
        this.router.navigate([url]);
        nativeNotification.close();
      };
      
      // Auto cerrar después de 5 segundos
      setTimeout(() => nativeNotification.close(), 5000);
    }

    // Refresh history from database to ensure alignment
    this.loadNotificationHistory().catch(err => console.error(err));
  }

// IMPORTANTE: Añadir esta propiedad a la clase
private swMessageHandler: ((event: MessageEvent) => void) | null = null;
private realtimeChannel: any = null;

  /**
   * 📋 LOAD NOTIFICATION HISTORY FROM DATABASE
   */
  async loadNotificationHistory(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return;

      console.log('📋 Loading notification history for user:', user.id);

      const { data, error } = await this.supabase.client
        .from('notification_schedules')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('❌ Error loading notification history:', error);
        return;
      }

      if (data) {
        this._history.set(data as NotificationSchedule[]);
        this.loadReadStateFromLocalStorage(user.id);
        console.log(`... Loaded ${data.length} notifications into history`);
      }
    } catch (error) {
      console.error('❌ Error in loadNotificationHistory:', error);
    }
  }

  private loadReadStateFromLocalStorage(userId: string): void {
    try {
      const stored = localStorage.getItem(`read_notifications_${userId}`);
      if (stored) {
        const ids = JSON.parse(stored);
        this._readIds.set(new Set(ids));
      } else {
        this._readIds.set(new Set());
      }
    } catch (e) {
      console.warn('⚠️ Could not load read notification state from localStorage', e);
    }
  }

  private saveReadStateToLocalStorage(userId: string): void {
    try {
      const ids = Array.from(this._readIds());
      localStorage.setItem(`read_notifications_${userId}`, JSON.stringify(ids));
    } catch (e) {
      console.warn('⚠️ Could not save read notification state to localStorage', e);
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    const currentRead = new Set(this._readIds());
    if (!currentRead.has(notificationId)) {
      currentRead.add(notificationId);
      this._readIds.set(currentRead);
      this.saveReadStateToLocalStorage(user.id);
      console.log(`🔔 Notification ${notificationId} marked as read`);
    }
  }

  async markAllAsRead(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    const allIds = this._history().map(n => n.id);
    this._readIds.set(new Set(allIds));
    this.saveReadStateToLocalStorage(user.id);
    console.log('🔔 All notifications marked as read');
  }

  private async setupRealtimeSubscription(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
    }

    console.log('📡 Setting up Supabase Realtime subscription for notification_schedules...');

    this.realtimeChannel = this.supabase.client
      .channel(`notification_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_schedules',
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          this.handleRealtimeNotification(payload);
        }
      )
      .subscribe((status: string) => {
        console.log(`📡 Realtime subscription status: ${status}`);
      });
  }

  private handleRealtimeNotification(payload: any): void {
    console.log('📨 Realtime notification received:', payload);
    const eventType = payload.eventType;
    const newRecord = payload.new as NotificationSchedule;

    if (!newRecord) return;

    if (newRecord.status !== 'sent') {
      if (eventType === 'DELETE' || newRecord.status === 'cancelled') {
        this._history.update(history => history.filter(n => n.id !== (payload.old?.id || newRecord.id)));
      }
      return;
    }

    if (eventType === 'INSERT') {
      this._history.update(history => {
        if (history.some(n => n.id === newRecord.id)) return history;
        return [newRecord, ...history];
      });
    } else if (eventType === 'UPDATE') {
      this._history.update(history => {
        const index = history.findIndex(n => n.id === newRecord.id);
        if (index > -1) {
          const updated = [...history];
          updated[index] = newRecord;
          return updated;
        } else {
          return [newRecord, ...history];
        }
      });
    }
  }

// En el método ngOnDestroy, limpiar el listener y suscripción en tiempo real
ngOnDestroy(): void {
  if (this.realtimeChannel) {
    this.supabase.client.removeChannel(this.realtimeChannel);
  }

  if (this.swMessageHandler && 'serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', this.swMessageHandler);
  }
}
}