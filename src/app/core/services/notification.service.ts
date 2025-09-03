import { Injectable, effect, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, from, take } from 'rxjs';
import { SupabaseService } from './supabase-service';
import { 
  UserNotificationPreferences, 
  NotificationSchedule, 
  NotificationPayload, 
  NotificationType, 
  DeviceInfo, 
  NotificationPermissionResult,
  PushToken,
  NotificationLog
} from '../interfaces/notification.interface';
import { formatDateCustom } from '../functions/date-utils';

// Firebase types declaration
declare const firebase: any;

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  
  // 🔥 FIREBASE MESSAGING en lugar de SwPush
  private firebaseMessaging: any = null;
  private firebaseApp: any = null;
  
  // 🔄 Reactive State Management
  private readonly _permissionStatus = signal<NotificationPermission>('default');
  private readonly _pushToken = signal<string | null>(null);
  private readonly _preferences = signal<UserNotificationPreferences | null>(null);
  private readonly _isInitialized = signal(false);
  private readonly _isLoading = signal(false);
  
  // 📊 Public Computed Properties
  readonly permissionStatus = this._permissionStatus.asReadonly();
  readonly pushToken = this._pushToken.asReadonly();
  readonly preferences = this._preferences.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  
  // 🔄 NUEVO: Separar scheduling de push delivery
  readonly canScheduleNotifications = computed(() => 
    this._preferences()?.notifications_enabled === true
  );
  
  readonly canSendPushNotifications = computed(() => 
    this._permissionStatus() === 'granted' && 
    this._pushToken() !== null &&
    this._preferences()?.notifications_enabled === true
  );

  // 🔄 LEGACY: Mantener para compatibilidad pero usar canScheduleNotifications
  readonly canSendNotifications = computed(() => 
    this.canScheduleNotifications()
  );
  
  readonly isNotificationSupported = computed(() => 
    this.isBrowser && 
    'Notification' in window && 
    'serviceWorker' in navigator && 
    'PushManager' in window
  );

  // 📡 Observable Streams for External Components
  private readonly _notificationReceived = new BehaviorSubject<NotificationPayload | null>(null);
  public readonly notificationReceived$ = this._notificationReceived.asObservable();

  // 🔥 Firebase Configuration
  private readonly firebaseConfig = {
  apiKey: "AIzaSyA6cVv2nk-xMzVYqM8DQBQ-JeicvyhS8a4",
  authDomain: "rage-studios.firebaseapp.com",
  projectId: "rage-studios",
  storageBucket: "rage-studios.firebasestorage.app",
  messagingSenderId: "401067010518",
  appId: "1:401067010518:web:b716d612274887ba6a9c77"
};

  // VAPID Key de Firebase (obtener de Firebase Console -> Project Settings -> Cloud Messaging)
  private readonly firebaseVapidKey = 'BAZuWOr2cwR2etuTiZ6Xyxi8fYOTzpcfZUX3p0qugWGvI2jVkbckMi8Ltq6mHBDkc-5sSmQK2L_gXfonstfSDlM'; // NECESITAS OBTENER ESTO DE FIREBASE

  constructor() {
    console.log('🔔 NotificationService: Constructor initialized');
    
    if (this.isBrowser) {
      // 🚨 CRÍTICO: Inicialización inteligente con delay para SSR
      this.initializeWhenReady();
    } else {
      console.log('🖥️ [SSR] Server-side rendering detected, skipping browser-only features');
    }
  }

  /**
   * 🚨 INICIALIZACIÓN INTELIGENTE: Espera a que el browser esté completamente listo
   */
  private initializeWhenReady(): void {
    // Delay mínimo para asegurar que SSR ha terminado completamente
    setTimeout(() => {
      if (this.isBrowser && typeof window !== 'undefined') {
        console.log('🔄 [SMART] Starting intelligent initialization...');
        
        // 🚨 FIX NG0203: Sin effect(), usar subscription directa
        this.supabase.currentUser$.subscribe(user => {
          if (user && !this._isInitialized()) {
            console.log('👤 [SMART] User authenticated, initializing notifications...');
            this.initialize().catch(err => {
              console.error('❌ Auto-initialization failed:', err);
            });
          } else if (!user) {
            console.log('👤 [SMART] User logged out, resetting notifications...');
            this.reset();
          }
        });
      }
    }, 1000); // 1 segundo para asegurar hidratation completa
  }

  // 🚀 INITIALIZATION METHODS
  async initialize(): Promise<void> {
    if (this._isInitialized() || this._isLoading()) {
      return;
    }

    this._isLoading.set(true);
    
    try {
      console.log('🔄 [SMART] NotificationService: Starting intelligent initialization...');

      // 🚨 DIAGNÓSTICO COMPLETO DE CAPACIDADES
      const capabilities = this.diagnoseBrowserCapabilities();
      console.log('🔍 [SMART] Browser capabilities:', capabilities);

      if (!capabilities.notificationSupported) {
        console.warn('⚠️ [SMART] Push notifications not supported in this browser');
        return;
      }

      // 1. Check current permission status
      this._permissionStatus.set(Notification.permission);
      console.log('🔐 [SMART] Current permission status:', this._permissionStatus());
      
      // 2. Load user preferences from database
      await this.loadUserPreferences();
      console.log('📋 [SMART] User preferences loaded');
      
      // 3. 🔥 NUEVO: Inicializar Firebase en lugar de SwPush
      if (capabilities.serviceWorkerSupported) {
        console.log('🔧 [SMART] Service Worker supported, initializing Firebase...');
        await this.initializeFirebase();
        
        // 4. Try to get existing FCM token
        await this.tryGetExistingFirebaseToken();
        
        // 🚨 CRÍTICO: Si user ya tiene permisos pero no token, registrar automáticamente
        if (this._permissionStatus() === 'granted' && !this._pushToken()) {
          console.log('🔑 [CRITICAL] User has permissions but no token, auto-registering...');
          try {
            await this.registerPushToken();
            console.log('✅ [CRITICAL] Auto-registration successful during initialization');
          } catch (autoRegError) {
            console.warn('⚠️ [CRITICAL] Auto-registration failed during init:', autoRegError);
            // Continue with database-only mode
          }
        }
        
        // 5. Setup message handlers
        this.setupFirebaseMessageHandlers();
      } else {
        console.warn('⚠️ [SMART] Service Worker not supported - notifications will be database-only');
      }
      
      this._isInitialized.set(true);
      
      const finalStatus = this.getStatus();
      console.log('✅ [SMART] NotificationService initialized successfully:', finalStatus);

      // 🔧 DEBUG: Exponer método de debug en desarrollo
      if (this.isDevelopmentEnvironment() && typeof window !== 'undefined') {
        (window as any).debugNotifications = {
          forceRegister: () => this.forceRegisterPushToken(),
          getStatus: () => this.getStatus(),
          testNotification: () => this.testNotification()
        };
        console.log('🔧 [DEBUG] Development debugging tools available:');
        console.log('🔧 [DEBUG] - window.debugNotifications.forceRegister()');
        console.log('🔧 [DEBUG] - window.debugNotifications.getStatus()'); 
        console.log('🔧 [DEBUG] - window.debugNotifications.testNotification()');
      }

      // Log initialization event
      await this.logEvent('service_initialized', {
        ...finalStatus,
        capabilities
      });
      
    } catch (error) {
      console.error('❌ [SMART] NotificationService initialization failed:', error);
      await this.logEvent('initialization_failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      // 🚨 NO throw error - permitir que la app continue funcionando
      console.warn('⚠️ [SMART] Continuing with limited notification capabilities');
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * 🔥 NUEVA: Inicializar Firebase
   */
  private async initializeFirebase(): Promise<void> {
    try {
      console.log('🔥 Initializing Firebase...');
      
      // Cargar Firebase SDK dinámicamente
      await this.loadFirebaseSDK();
      
      // Inicializar Firebase App
      if (!firebase.apps?.length) {
        this.firebaseApp = firebase.initializeApp(this.firebaseConfig);
      } else {
        this.firebaseApp = firebase.apps[0];
      }
      
      // Obtener instancia de messaging
      this.firebaseMessaging = firebase.messaging();
      
      // Registrar Service Worker de Firebase
      await this.registerFirebaseServiceWorker();
      
      console.log('✅ Firebase initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Firebase:', error);
      throw error;
    }
  }

  /**
   * 🔥 Cargar Firebase SDK dinámicamente
   */
  private async loadFirebaseSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Si ya está cargado, resolver inmediatamente
      if (typeof firebase !== 'undefined') {
        console.log('✅ Firebase SDK already loaded');
        resolve();
        return;
      }

      const scriptApp = document.createElement('script');
      scriptApp.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';
      
      const scriptMessaging = document.createElement('script');
      scriptMessaging.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js';
      
      scriptApp.onload = () => {
        document.head.appendChild(scriptMessaging);
      };
      
      scriptMessaging.onload = () => {
        console.log('✅ Firebase SDK loaded');
        resolve();
      };
      
      scriptApp.onerror = scriptMessaging.onerror = (error) => {
        console.error('❌ Error loading Firebase SDK:', error);
        reject(error);
      };
      
      document.head.appendChild(scriptApp);
    });
  }

  /**
   * 🔥 Registrar Service Worker de Firebase
   */
  private async registerFirebaseServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Worker not supported');
      return;
    }
    
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      });
      
      console.log('✅ Firebase Service Worker registered:', registration);
      
      // Usar esta registration para messaging
      this.firebaseMessaging.useServiceWorker(registration);
      
    } catch (error) {
      console.error('❌ Firebase Service Worker registration failed:', error);
    }
  }

  /**
   * 🔥 Intentar obtener token FCM existente
   */
  private async tryGetExistingFirebaseToken(): Promise<void> {
    if (!this.firebaseMessaging) {
      console.log('ℹ️ Firebase Messaging not available');
      return;
    }
    
    try {
      console.log('🔍 Checking for existing FCM token...');
      
      const currentToken = await this.firebaseMessaging.getToken({
        vapidKey: this.firebaseVapidKey
      });
      
      if (currentToken) {
        console.log('✅ Found existing FCM token');
        this._pushToken.set(currentToken);
        
        // Actualizar en base de datos
        await this.updateTokenInDatabase(currentToken);
      } else {
        console.log('ℹ️ No existing FCM token found');
      }
    } catch (error) {
      console.warn('⚠️ Could not get existing FCM token:', error);
    }
  }

  /**
   * 🔥 Setup Firebase message handlers
   */
  private setupFirebaseMessageHandlers(): void {
    if (!this.firebaseMessaging) return;
    
    console.log('🔧 Setting up Firebase message handlers...');
    
    // Handle foreground messages
    this.firebaseMessaging.onMessage((payload: any) => {
      console.log('📨 Foreground message received:', payload);
      
      // Emit to reactive stream
      this._notificationReceived.next(payload);
      
      // Show notification even in foreground
      if (Notification.permission === 'granted') {
        const notification = new Notification(
          payload.notification?.title || 'RageStudios',
          {
            body: payload.notification?.body || 'Nueva notificación',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: payload.data
          }
        );
        
        notification.onclick = () => {
          window.focus();
          const url = payload.data?.actionUrl || '/account/bookings';
          window.location.href = url;
          notification.close();
        };
      }
      
      // Log the event
      this.logInteraction('push_message_received', { message: payload });
    });
    
    // Handle token refresh
    this.firebaseMessaging.onTokenRefresh(async () => {
      console.log('🔄 FCM token refreshed');
      await this.registerPushToken();
    });
    
    console.log('✅ Firebase message handlers setup complete');
  }

  /**
   * 🔍 DIAGNÓSTICO COMPLETO DE CAPACIDADES DEL BROWSER
   */
  private diagnoseBrowserCapabilities() {
    const capabilities = {
      isBrowser: this.isBrowser,
      hasWindow: typeof window !== 'undefined',
      notificationSupported: false,
      serviceWorkerSupported: false,
      pushManagerSupported: false,
      permissionStatus: 'unknown',
      isDevelopment: false
    };

    if (!this.isBrowser || typeof window === 'undefined') {
      console.log('🖥️ [SMART] Server-side rendering detected');
      return capabilities;
    }

    // Detección granular de capacidades
    capabilities.notificationSupported = 'Notification' in window;
    capabilities.serviceWorkerSupported = 'serviceWorker' in navigator;
    capabilities.pushManagerSupported = 'PushManager' in window;
    capabilities.permissionStatus = Notification?.permission || 'unknown';
    capabilities.isDevelopment = this.isDevelopmentEnvironment();

    return capabilities;
  }

  private reset(): void {
    this._permissionStatus.set('default');
    this._pushToken.set(null);
    this._preferences.set(null);
    this._isInitialized.set(false);
    console.log('🔄 NotificationService reset');
  }

  // 🔐 PERMISSION MANAGEMENT
  async requestPermissions(): Promise<NotificationPermissionResult> {
    if (!this.isNotificationSupported()) {
      throw new Error('Push notifications not supported');
    }

    try {
      console.log('🔐 Requesting notification permissions...');
      
      const permission = await Notification.requestPermission();
      this._permissionStatus.set(permission);
      
      const result: NotificationPermissionResult = {
        granted: permission === 'granted',
        permission
      };

      if (permission === 'granted') {
        console.log('✅ [CRITICAL] Permission granted, registering push token...');
        
        // 🚨 CRÍTICO: Auto-register push token after permission granted
        try {
          result.token = await this.registerPushToken();
          console.log('🎉 [CRITICAL] Push token registered successfully:', !!result.token);
        } catch (tokenError) {
          console.error('❌ [CRITICAL] Push token registration failed, but permissions granted:', tokenError);
          // Don't fail the whole operation - notifications will work in database-only mode
          result.token = undefined;
        }
        
        // Log successful permission
        await this.logEvent('permission_granted', {
          previousPermission: 'default',
          token: !!result.token,
          tokenRegistrationSuccess: !!result.token
        });
        
        console.log('🎉 [CRITICAL] Permissions setup complete. Token:', !!result.token);
      } else {
        await this.logEvent('permission_denied', { permission });
        console.log('❌ Permission denied:', permission);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      await this.logEvent('permission_error', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  getPermissionStatus(): NotificationPermission {
    return this._permissionStatus();
  }

  // 📱 PUSH TOKEN MANAGEMENT CON FIREBASE
  async registerPushToken(): Promise<string> {
    if (!this.isNotificationSupported() || this._permissionStatus() !== 'granted') {
      throw new Error('Cannot register push token: permissions not granted or not supported');
    }

    if (!this.firebaseMessaging) {
      throw new Error('Firebase Messaging not initialized');
    }

    try {
      console.log('📱 Registering FCM token...');
      
      // Obtener token FCM
      const token = await this.firebaseMessaging.getToken({
        vapidKey: this.firebaseVapidKey
      });
      
      if (!token) {
        throw new Error('Failed to get FCM token');
      }
      
      console.log('✅ FCM token obtained:', token.substring(0, 20) + '...');
      
      // Guardar token
      this._pushToken.set(token);
      
      // Guardar en base de datos
      await this.updateTokenInDatabase(token);
      
      // Log event
      await this.logEvent('token_registered', {
        deviceType: 'web',
        method: 'firebase_fcm'
      });
      
      return token;
      
    } catch (error) {
      console.error('❌ Error registering FCM token:', error);
      await this.logEvent('token_registration_failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * 🔥 Actualizar token en base de datos
   */
  private async updateTokenInDatabase(token: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      console.warn('⚠️ No user authenticated, cannot save token');
      return;
    }

    try {
      console.log('💾 Updating FCM token in database...');
      
      // Actualizar en user_notification_preferences
      const { error } = await this.supabase.client
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          primary_device_token: token,
          push_tokens: [{ 
            token, 
            type: 'fcm',
            created_at: new Date().toISOString() 
          }],
          last_token_updated_at: new Date().toISOString(),
          push_notifications_enabled: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('❌ Error storing token in database:', error);
        throw error;
      }

      console.log('✅ FCM token stored in database successfully');
    } catch (error) {
      console.error('❌ Error updating token in database:', error);
    }
  }

  // ⚙️ USER PREFERENCES MANAGEMENT
  private async loadUserPreferences(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) {
        console.log('ℹ️ No user authenticated, skipping preferences load');
        return;
      }

      console.log('📋 Loading user notification preferences...');

      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('❌ Error loading notification preferences:', error);
        return;
      }

      if (data) {
        this._preferences.set(data);
        console.log('✅ User preferences loaded successfully');
      } else {
        console.log('📝 No preferences found, creating defaults...');
        await this.createDefaultPreferences();
      }

    } catch (error) {
      console.error('❌ Error in loadUserPreferences:', error);
    }
  }

  private async createDefaultPreferences(): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    const defaultPrefs: Partial<UserNotificationPreferences> = {
      user_id: user.id,
      notifications_enabled: true,
      timezone_identifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preferred_language: navigator.language.startsWith('es') ? 'es-MX' : 'en-US',
      booking_confirmation_enabled: true,
      reminder_24h_enabled: true,
      reminder_1h_enabled: true,
      cancellation_notifications_enabled: true,
      class_update_notifications_enabled: true,
      marketing_notifications_enabled: false,
      push_notifications_enabled: true,
      email_notifications_enabled: false,
      sms_notifications_enabled: false,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '08:00:00',
      quiet_hours_timezone: 'America/Mexico_City',
      message_style: 'standard',
      include_coach_info: true,
      include_location_info: true,
      include_quick_actions: true,
      share_attendance_status: false,
      allow_admin_override: true,
      notification_sound: 'default',
      vibration_pattern: 'default',
      custom_settings: {}
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
      console.log('✅ Default preferences created successfully');

      await this.logEvent('default_preferences_created', {
        userId: user.id
      });

    } catch (error) {
      console.error('❌ Error creating default preferences:', error);
    }
  }

  async getUserPreferences(): Promise<UserNotificationPreferences | null> {
    if (!this._preferences()) {
      await this.loadUserPreferences();
    }
    return this._preferences();
  }

  async updatePreferences(updates: Partial<UserNotificationPreferences>): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    try {
      console.log('⚙️ Updating user preferences...', updates);

      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating preferences:', error);
        throw error;
      }

      this._preferences.set(data);
      console.log('✅ Preferences updated successfully');

      await this.logEvent('preferences_updated', {
        updatedFields: Object.keys(updates)
      });

    } catch (error) {
      console.error('❌ Error in updatePreferences:', error);
      throw error;
    }
  }

  // 📅 BOOKING INTEGRATION - CRITICAL FOR PWA NOTIFICATIONS
  async scheduleBookingNotifications(booking: any): Promise<{ success: boolean; reason?: string; count?: number }> {
    const canSchedule = this.canScheduleNotifications();
    const canSendPush = this.canSendPushNotifications();
    const status = this.getStatus();
    
    if (!canSchedule) {
      const reason = `Cannot schedule notifications - Preferences disabled`;
      console.warn('⚠️ Cannot schedule notifications:', reason);
      return { success: false, reason };
    }

    // 🚨 CRÍTICO: Programar SIEMPRE las notificaciones, independiente del push token
    console.log('📅 [CRITICAL] Scheduling notifications with status:', {
      canSchedule,
      canSendPush,
      permission: status.permission,
      hasToken: status.hasToken,
      hasPreferences: status.hasPreferences
    });

    try {
      console.log('📅 Scheduling notifications for booking:', booking.id);
      
      const user = await this.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const preferences = this._preferences();
      if (!preferences) throw new Error('User preferences not loaded');

      const notifications: Partial<NotificationSchedule>[] = [];
      const bookingDateTime = new Date(`${booking.session_date}T${booking.session_time}`);
      const now = new Date();

      // 🚨 CRÍTICO: Determinar canales de entrega disponibles
      const availableChannels = this.getAvailableDeliveryChannels();
      const pushToken = canSendPush ? this._pushToken() : null;

      console.log('📡 [CRITICAL] Available delivery channels:', availableChannels, 'Push token:', !!pushToken);

      // 1. 🎉 Booking Confirmation (immediate)
      if (preferences.booking_confirmation_enabled) {
        notifications.push({
          booking_id: booking.id,
          user_id: user.id,
          notification_type: 'booking_confirmation',
          scheduled_for: now.toISOString(),
          status: 'scheduled',
          priority: 5, // Highest priority
          message_payload: await this.buildNotificationPayload('booking_confirmation', booking),
          push_token: pushToken || undefined,
          delivery_channels: availableChannels,
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
          session_data: this.extractSessionData(booking),
          user_preferences: { 
            message_style: preferences.message_style,
            fallback_to_db_only: !canSendPush // Si no hay push, marcar para fallback
          }
        });
      }

      // 2. 📅 24 Hour Reminder
      if (preferences.reminder_24h_enabled) {
        const reminder24h = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now) {
          notifications.push({
            booking_id: booking.id,
            user_id: user.id,
            notification_type: 'reminder_24h',
            scheduled_for: reminder24h.toISOString(),
            status: 'scheduled',
            priority: 4,
            message_payload: await this.buildNotificationPayload('reminder_24h', booking),
            push_token: pushToken || undefined,
            delivery_channels: availableChannels,
            expires_at: new Date(bookingDateTime.getTime() + 60 * 60 * 1000).toISOString(), // Expires 1h after class
            session_data: this.extractSessionData(booking),
            user_preferences: { message_style: preferences.message_style }
          });
        }
      }

      // 3. ⏰ 1 Hour Reminder - MOST CRITICAL
      if (preferences.reminder_1h_enabled) {
        const reminder1h = new Date(bookingDateTime.getTime() - 60 * 60 * 1000);
        if (reminder1h > now) {
          notifications.push({
            booking_id: booking.id,
            user_id: user.id,
            notification_type: 'reminder_1h',
            scheduled_for: reminder1h.toISOString(),
            status: 'scheduled',
            priority: 5, // Highest priority
            message_payload: await this.buildNotificationPayload('reminder_1h', booking),
            push_token: pushToken || undefined,
            delivery_channels: availableChannels,
            expires_at: new Date(bookingDateTime.getTime() + 30 * 60 * 1000).toISOString(), // Expires 30min after class
            session_data: this.extractSessionData(booking),
            user_preferences: { message_style: preferences.message_style }
          });
        }
      }

      // Store all notifications in database
      if (notifications.length > 0) {
        const { error } = await this.supabase.client
          .from('notification_schedules')
          .insert(notifications);

        if (error) {
          console.error('❌ Error storing notification schedules:', error);
          throw error;
        }

        console.log(`✅ Successfully scheduled ${notifications.length} notifications for booking ${booking.id}`);
        
        // Log the scheduling event
        await this.logEvent('notifications_scheduled', {
          bookingId: booking.id,
          count: notifications.length,
          types: notifications.map(n => n.notification_type),
          scheduledTimes: notifications.map(n => n.scheduled_for)
        });
        
        return { success: true, count: notifications.length };
      } else {
        console.log('ℹ️ No notifications scheduled (all disabled or past due)');
        return { success: true, count: 0, reason: 'All notifications disabled or past due' };
      }

    } catch (error) {
      console.error('❌ Error in scheduleBookingNotifications:', error);
      await this.logEvent('scheduling_failed', {
        bookingId: booking.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return { success: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async cancelBookingNotifications(bookingId: string): Promise<void> {
    try {
      console.log('🚫 Cancelling notifications for booking:', bookingId);
      
      const { error } = await this.supabase.client
        .from('notification_schedules')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
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
        cancelledAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Error in cancelBookingNotifications:', error);
      throw error;
    }
  }

  private extractSessionData(booking: any): Record<string, any> {
    return {
      className: booking.class_name,
      coachName: booking.coach_name,
      sessionDate: booking.session_date,
      sessionTime: booking.session_time,
      bedNumbers: booking.bed_numbers,
      totalAttendees: booking.total_attendees,
      creditsUsed: booking.credits_used
    };
  }

  private async buildNotificationPayload(
    type: NotificationType, 
    booking: any
  ): Promise<NotificationPayload> {
    
    try {
      // Build variables for template processing
      const variables = {
        user_name: booking.user?.full_name || 'Usuario',
        class_name: booking.class_name || 'tu clase',
        session_date: formatDateCustom(booking.session_date, {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        session_time: booking.session_time,
        coach_name: booking.coach_name || 'tu coach',
        bed_numbers: Array.isArray(booking.bed_numbers) ? booking.bed_numbers.join(', ') : booking.bed_numbers || ''
      };

      console.log('🏗️ Processing notification template:', type, 'with variables:', variables);

      // Get processed template from database
      const { data, error } = await this.supabase.client
        .rpc('process_notification_template', {
          p_template_key: `${type}_es`,
          p_language_code: 'es-MX',
          p_variables: variables
        });

      if (error) {
        console.error('❌ Error processing notification template:', error);
        // Fallback to basic message
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
          timestamp: new Date().toISOString()
        }
      };

      // Add action buttons if supported
      if (data.action_text) {
        payload.actions = [{
          action: 'view',
          title: data.action_text
        }];
      }

      console.log('✅ Notification payload built:', payload);
      return payload;

    } catch (error) {
      console.error('❌ Error building notification payload:', error);
      return this.getFallbackPayload(type, booking);
    }
  }

  private getFallbackPayload(type: NotificationType, booking: any): NotificationPayload {
    const fallbackMessages = {
      booking_confirmation: {
        title: '¡Reserva confirmada! 🎉',
        body: `Tu clase de ${booking.class_name || 'fitness'} está confirmada.`
      },
      reminder_24h: {
        title: 'Tu clase es mañana 📅',
        body: `Recuerda que mañana tienes ${booking.class_name || 'tu clase'}.`
      },
      reminder_1h: {
        title: 'Tu clase comienza en 1 hora ⏰',
        body: `${booking.class_name || 'Tu clase'} comienza pronto. ¡Te esperamos!`
      },
      cancellation_user: {
        title: 'Reserva cancelada ✅',
        body: 'Tu reserva ha sido cancelada exitosamente.'
      },
      cancellation_admin: {
        title: 'Cambio en tu reserva 📋',
        body: 'Tu reserva ha sido modificada por el administrador.'
      },
      class_update: {
        title: 'Actualización de clase 📝',
        body: 'Hay cambios en tu clase programada.'
      }
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
        fallback: true
      }
    };
  }

  // 📊 ANALYTICS & LOGGING
  async logEvent(eventType: string, data?: any): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return; // Don't log for anonymous users

      const logEntry: Partial<NotificationLog> = {
        user_id: user.id,
        log_type: 'user_interaction',
        success: true,
        user_action: eventType,
        action_data: data,
        device_info: this.getDeviceInfo(),
        created_at: new Date().toISOString()
      };

      await this.supabase.client
        .from('notification_logs')
        .insert([logEntry]);

    } catch (error) {
      // Fail silently for logging errors to avoid disrupting user experience
      console.warn('⚠️ Could not log event:', eventType, error);
    }
  }

  async logInteraction(action: string, data?: any): Promise<void> {
    await this.logEvent(action, data);
  }

  async getNotificationHistory(limit: number = 50): Promise<NotificationLog[]> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return [];

      const { data, error } = await this.supabase.client
        .from('notification_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching notification history:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('❌ Error in getNotificationHistory:', error);
      return [];
    }
  }

  // 🔧 UTILITY METHODS
  private async getCurrentUser() {
    return new Promise<any>((resolve) => {
      this.supabase.currentUser$.subscribe(user => {
        resolve(user);
      });
    });
  }

  private getDeviceInfo(): DeviceInfo {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language
    };
  }

  /**
   * 🎯 DETECCIÓN INTELIGENTE DE AMBIENTE
   * Usa múltiples fuentes para determinar si estamos en desarrollo
   */
  private isDevelopmentEnvironment(): boolean {
    // 1. Browser check primero
    if (!this.isBrowser || typeof window === 'undefined') {
      return false; // En SSR, asumir producción por seguridad
    }
    
    // 2. URL check
    const hostname = window.location?.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname?.includes('.local')) {
      return true;
    }
    
    // 3. Port check (desarrollo suele usar :4200, :3000, etc)
    const port = window.location?.port;
    if (port && ['3000', '4200', '8080', '5173', '5174'].includes(port)) {
      return true;
    }
    
    // 4. Protocol check (desarrollo suele ser http)
    if (window.location?.protocol === 'http:' && hostname !== 'localhost') {
      return false; // http en dominio real = probablemente staging/prod
    }
    
    return false; // Por defecto, asumir producción
  }

  // 🔧 DEBUG: Forzar registro de push token para troubleshooting
  async forceRegisterPushToken(): Promise<void> {
    console.log('🚨 [DEBUG] Force registering push token - TROUBLESHOOTING MODE');
    
    try {
      // Log current state
      const currentStatus = this.getStatus();
      console.log('📊 [DEBUG] Current status before force registration:', currentStatus);
      
      // Check Firebase
      if (!this.firebaseMessaging) {
        console.error('❌ [DEBUG] Firebase Messaging not initialized');
        await this.initializeFirebase();
      }
      
      // Check permissions
      if (this._permissionStatus() !== 'granted') {
        console.error('❌ [DEBUG] Permissions not granted. Current:', this._permissionStatus());
        const permissions = await this.requestPermissions();
        console.log('🔑 [DEBUG] Permission request result:', permissions);
        return;
      }
      
      // Force register token
      console.log('🔑 [DEBUG] Forcing push token registration...');
      const token = await this.registerPushToken();
      console.log('🎉 [DEBUG] Force registration successful! Token:', !!token);
      
      // Log final state
      const finalStatus = this.getStatus();
      console.log('📊 [DEBUG] Final status after force registration:', finalStatus);
      
    } catch (error) {
      console.error('❌ [DEBUG] Force registration failed:', error);
      
      // Detailed error analysis
      if (error instanceof Error) {
        console.error('❌ [DEBUG] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5)
        });
      }
    }
  }

  // 🧪 TESTING & DEBUG METHODS (Remove in production)
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
      user: { full_name: 'Test User' }
    };

    const payload = await this.buildNotificationPayload(type, testBooking);
    
    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data
    });

    await this.logEvent('test_notification_sent', { type, payload });
    console.log('🧪 Test notification sent:', payload);
  }

  /**
   * 🚨 MÉTODO CRÍTICO: Determinar canales de entrega disponibles
   */
  private getAvailableDeliveryChannels(): string[] {
    const channels: string[] = [];
    
    // 1. Database logging - SIEMPRE disponible
    channels.push('database');
    
    // 2. Push notifications - Solo si hay token válido
    if (this.canSendPushNotifications()) {
      channels.push('push');
      console.log('✅ [CRITICAL] Push notifications enabled with valid token');
    } else {
      console.log('⚠️ [CRITICAL] Push notifications disabled - will use database only');
      console.log('📋 [INFO] Reasons: Permission:', this._permissionStatus(), 'Token:', !!this._pushToken());
    }
    
    // 3. Email (futuro)
    const preferences = this._preferences();
    if (preferences?.email_notifications_enabled) {
      channels.push('email');
    }
    
    console.log('📡 [CRITICAL] Final delivery channels:', channels);
    return channels;
  }

  // 📈 PUBLIC STATUS METHODS
  getStatus() {
    return {
      initialized: this._isInitialized(),
      supported: this.isNotificationSupported(),
      permission: this._permissionStatus(),
      hasToken: !!this._pushToken(),
      canSend: this.canSendNotifications(),
      canSchedule: this.canScheduleNotifications(),
      canSendPush: this.canSendPushNotifications(),
      hasPreferences: !!this._preferences(),
      loading: this._isLoading()
    };
  }
}