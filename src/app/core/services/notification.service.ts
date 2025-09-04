import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase-service';
import { 
  UserNotificationPreferences, 
  NotificationPayload,
  NotificationPermissionResult,
  NotificationSchedule,
  NotificationType
} from '../interfaces/notification.interface';

// Firebase v10 modular imports
import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getMessaging, 
  getToken, 
  onMessage, 
  Messaging,
  isSupported,
  MessagePayload 
} from 'firebase/messaging';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  
  // 🔥 Firebase Instances (v10 modular)
  private firebaseApp: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  
  // 🔄 Reactive State Management
  private readonly _permissionStatus = signal<NotificationPermission>('default');
  private readonly _pushToken = signal<string | null>(null);
  private readonly _preferences = signal<UserNotificationPreferences | null>(null);
  private readonly _isInitialized = signal(false);
  private readonly _isLoading = signal(false);
  private readonly _serviceWorkerReady = signal(false);
  
  // 📊 Public Computed Properties
  readonly permissionStatus = this._permissionStatus.asReadonly();
  readonly pushToken = this._pushToken.asReadonly();
  readonly preferences = this._preferences.asReadonly();
  readonly isInitialized = this._isInitialized.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly serviceWorkerReady = this._serviceWorkerReady.asReadonly();
  
  // 🔄 Separar scheduling de push delivery
  readonly canScheduleNotifications = computed(() => 
    this._preferences()?.notifications_enabled === true
  );
  
  readonly canSendPushNotifications = computed(() => 
    this._permissionStatus() === 'granted' && 
    this._pushToken() !== null &&
    this._preferences()?.push_notifications_enabled === true &&
    this._serviceWorkerReady() === true
  );
  
  readonly isNotificationSupported = computed(() => 
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
    apiKey: "AIzaSyA6cVv2nk-xMzVYqM8DQBQ-JeicvyhS8a4",
    authDomain: "rage-studios.firebaseapp.com",
    projectId: "rage-studios",
    storageBucket: "rage-studios.firebasestorage.app",
    messagingSenderId: "401067010518",
    appId: "1:401067010518:web:b716d612274887ba6a9c77"
  };

  private readonly vapidKey = 'BAZuWOr2cwR2etuTiZ6Xyxi8fYOTzpcfZUX3p0qugWGvI2jVkbckMi8Ltq6mHBDkc-5sSmQK2L_gXfonstfSDlM';

  constructor() {
    console.log('🔔 [NotificationService] Constructor initialized');
    
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
        console.log('🔄 [INIT] Starting intelligent initialization...');
        
        this.supabase.currentUser$.subscribe(user => {
          if (user && !this._isInitialized()) {
            console.log('👤 [AUTH] User authenticated, initializing notifications...');
            this.initialize().catch(err => {
              console.error('❌ Auto-initialization failed:', err);
            });
          } else if (!user) {
            console.log('👤 [AUTH] User logged out, resetting notifications...');
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
      console.log('🔄 [INIT] Starting notification service initialization...');

      // Check browser capabilities
      if (!this.isNotificationSupported()) {
        console.warn('⚠️ [CAPABILITY] Push notifications not supported');
        return;
      }

      // Check current permission
      this._permissionStatus.set(Notification.permission);
      console.log('🔐 [PERMISSION] Current status:', this._permissionStatus());
      
      // Load user preferences
      await this.loadUserPreferences();
      console.log('📋 [PREFS] User preferences loaded');
      
      // Initialize Firebase
      await this.initializeFirebase();
      
      // Register Service Worker
      await this.registerServiceWorker();
      
      // Try to get existing token if permissions granted
      if (this._permissionStatus() === 'granted' && this._serviceWorkerReady()) {
        await this.tryGetExistingToken();
      }
      
      // Setup message handlers
      this.setupMessageHandlers();
      
      this._isInitialized.set(true);
      
      const status = this.getStatus();
      console.log('✅ [INIT] NotificationService initialized:', status);
      
      // Expose debug tools in development
      if (this.isDevelopment()) {
        (window as any).debugNotifications = {
          getStatus: () => this.getStatus(),
          testNotification: () => this.testNotification(),
          forceRegister: () => this.forceRegisterToken(),
          triggerEdgeFunction: () => this.triggerNotificationProcessing()
        };
        console.log('🔧 [DEBUG] Tools available: window.debugNotifications');
      }
      
    } catch (error) {
      console.error('❌ [INIT] Initialization failed:', error);
      // Don't throw - allow app to continue
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * 🔥 INITIALIZE FIREBASE (v10 Modular API)
   */
  private async initializeFirebase(): Promise<void> {
    try {
      console.log('🔥 [FIREBASE] Initializing Firebase Messaging...');
      
      // Check if messaging is supported
      const supported = await isSupported();
      if (!supported) {
        console.warn('⚠️ [FIREBASE] Messaging not supported in this browser');
        return;
      }
      
      // Initialize Firebase App
      if (!this.firebaseApp) {
        this.firebaseApp = initializeApp(this.firebaseConfig);
        console.log('✅ [FIREBASE] App initialized');
      }
      
      // Get Messaging instance
      this.messaging = getMessaging(this.firebaseApp);
      console.log('✅ [FIREBASE] Messaging instance created');
      
    } catch (error) {
      console.error('❌ [FIREBASE] Initialization error:', error);
      // Don't throw - continue without push
    }
  }

  /**
   * 🔧 REGISTER SERVICE WORKER
   */
  private async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ [SW] Service Worker not supported');
      return;
    }
    
    try {
      console.log('📦 [SW] Registering Service Worker...');
      
      // Unregister old workers first
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        if (reg.scope !== new URL('/', location.origin).href) {
          await reg.unregister();
          console.log('🔄 [SW] Unregistered old worker:', reg.scope);
        }
      }
      
      // Register new worker
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      
      console.log('✅ [SW] Service Worker registered:', registration.scope);
      
      // Wait for activation
      await navigator.serviceWorker.ready;
      this._serviceWorkerReady.set(true);
      console.log('✅ [SW] Service Worker ready and active');
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        console.log('🔄 [SW] New version available');
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('✅ [SW] New version activated');
              this.tryGetExistingToken();
            }
          });
        }
      });
      
    } catch (error) {
      console.error('❌ [SW] Registration failed:', error);
      this._serviceWorkerReady.set(false);
    }
  }

  /**
   * 🔍 TRY TO GET EXISTING TOKEN
   */
  private async tryGetExistingToken(): Promise<void> {
    if (!this.messaging || !this._serviceWorkerReady()) {
      console.log('ℹ️ [TOKEN] Not ready for token retrieval');
      return;
    }
    
    try {
      console.log('🔍 [TOKEN] Checking for existing FCM token...');
      
      const currentToken = await getToken(this.messaging, {
        vapidKey: this.vapidKey,
        serviceWorkerRegistration: await navigator.serviceWorker.ready
      });
      
      if (currentToken) {
        console.log('✅ [TOKEN] Found existing token:', currentToken.substring(0, 20) + '...');
        this._pushToken.set(currentToken);
        await this.updateTokenInDatabase(currentToken);
      } else {
        console.log('ℹ️ [TOKEN] No existing token found');
      }
    } catch (error) {
      console.warn('⚠️ [TOKEN] Could not get existing token:', error);
    }
  }

  /**
   * 📨 SETUP MESSAGE HANDLERS
   */
  private setupMessageHandlers(): void {
    if (!this.messaging) return;
    
    console.log('🔧 [HANDLERS] Setting up message handlers...');
    
    // Handle foreground messages with proper typing
    onMessage(this.messaging, (payload: MessagePayload) => {
      console.log('📨 [MESSAGE] Foreground message received:', payload);
      
      // Convert to our NotificationPayload type
      const notification: NotificationPayload = {
        title: payload.notification?.title || 'RageStudios',
        body: payload.notification?.body || 'Nueva notificación',
        icon: payload.notification?.icon,
        badge: payload.data?.badge,
        data: payload.data,
        tag: payload.data?.notificationType,
        timestamp: Date.now()
      };
      
      // Emit to subscribers
      this._notificationReceived.next(notification);
      
      // Show notification in foreground
      if (Notification.permission === 'granted') {
        const nativeNotification = new Notification(notification.title, {
          body: notification.body,
          icon: notification.icon || '/icons/icon-192x192.png',
          badge: notification.badge || '/icons/badge-72x72.png',
          data: notification.data
        });
        
        nativeNotification.onclick = () => {
          window.focus();
          const url = notification.data?.actionUrl || '/account/bookings';
          window.location.href = url;
          nativeNotification.close();
        };
      }
      
      // Log event
      this.logEvent('push_message_received', { 
        messageId: payload.messageId 
      });
    });
    
    console.log('✅ [HANDLERS] Message handlers setup complete');
  }

  /**
   * 🔐 REQUEST PERMISSIONS
   */
  async requestPermissions(): Promise<NotificationPermissionResult> {
    try {
      console.log('🔐 [PERMISSION] Requesting notification permissions...');
      
      // Ensure service worker is ready
      if (!this._serviceWorkerReady()) {
        await this.registerServiceWorker();
      }
      
      const permission = await Notification.requestPermission();
      this._permissionStatus.set(permission);
      
      const result: NotificationPermissionResult = {
        permission,
        granted: permission === 'granted',
        token: undefined // ← CORRECCIÓN: undefined en lugar de null
      };
      
      if (permission === 'granted') {
        console.log('✅ [PERMISSION] Granted, registering token...');
        
        try {
          const token = await this.registerPushToken();
          result.token = token;
        } catch (tokenError) {
          console.error('⚠️ [PERMISSION] Token registration failed:', tokenError);
          // Continue without token - db-only mode
        }
      }
      
      await this.logEvent('permission_requested', {
        permission,
        granted: result.granted,
        hasToken: !!result.token
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ [PERMISSION] Request error:', error);
      throw error;
    }
  }

  /**
   * 📱 REGISTER PUSH TOKEN
   */
  async registerPushToken(): Promise<string> {
    if (!this.messaging) {
      throw new Error('Firebase Messaging not initialized');
    }
    
    if (this._permissionStatus() !== 'granted') {
      throw new Error('Notification permissions not granted');
    }
    
    if (!this._serviceWorkerReady()) {
      throw new Error('Service Worker not ready');
    }
    
    try {
      console.log('📱 [TOKEN] Registering FCM token...');
      
      // Wait for SW to be ready
      const swRegistration = await navigator.serviceWorker.ready;
      
      // Get FCM token with SW registration
      const token = await getToken(this.messaging, {
        vapidKey: this.vapidKey,
        serviceWorkerRegistration: swRegistration
      });
      
      if (!token) {
        throw new Error('Failed to get FCM token');
      }
      
      console.log('✅ [TOKEN] FCM token obtained:', token.substring(0, 20) + '...');
      
      // Save token
      this._pushToken.set(token);
      
      // Save to database
      await this.updateTokenInDatabase(token);
      
      // Log event
      await this.logEvent('token_registered', {
        deviceType: 'web',
        method: 'firebase_fcm_v10'
      });
      
      return token;
      
    } catch (error) {
      console.error('❌ [TOKEN] Registration error:', error);
      await this.logEvent('token_registration_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 💾 UPDATE TOKEN IN DATABASE
   */
  private async updateTokenInDatabase(token: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) {
      console.warn('⚠️ [DB] No user authenticated');
      return;
    }

    try {
      console.log('💾 [DB] Updating FCM token...');
      
      const { error } = await this.supabase.client
        .from('user_notification_preferences')
        .upsert({
          user_id: user.id,
          primary_device_token: token,
          push_tokens: [{ 
            token, 
            type: 'fcm',
            deviceType: 'web',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString()
          }],
          last_token_updated_at: new Date().toISOString(),
          push_notifications_enabled: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      
      console.log('✅ [DB] Token stored successfully');
    } catch (error) {
      console.error('❌ [DB] Update error:', error);
    }
  }

  /**
   * 📅 SCHEDULE NOTIFICATIONS FOR BOOKING
   */
  async scheduleNotificationsForBooking(booking: any): Promise<{ success: boolean; reason?: string; count?: number }> {
    const canSchedule = this.canScheduleNotifications();
    const canSendPush = this.canSendPushNotifications();
    
    if (!canSchedule) {
      const reason = 'Notifications disabled in preferences';
      console.warn('⚠️ [SCHEDULE] Cannot schedule:', reason);
      return { success: false, reason };
    }

    try {
      console.log('📅 [SCHEDULE] Scheduling for booking:', booking.id);
      
      const user = await this.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const preferences = this._preferences();
      if (!preferences) throw new Error('User preferences not loaded');

      const notifications: Partial<NotificationSchedule>[] = [];
      const bookingDateTime = new Date(`${booking.session_date}T${booking.session_time}`);
      const now = new Date();

      // Determine delivery channels
      const channels = this.getAvailableDeliveryChannels();
      const pushToken = canSendPush ? this._pushToken() : undefined;

      console.log('📡 [SCHEDULE] Channels:', channels, 'Token:', !!pushToken);

      // 1. Booking Confirmation (immediate)
      if (preferences.booking_confirmation_enabled !== false) {
        notifications.push({
          booking_id: booking.id,
          user_id: user.id,
          notification_type: 'booking_confirmation',
          scheduled_for: now.toISOString(),
          status: 'scheduled',
          priority: 5,
          retry_count: 0,
          max_retries: 3,
          message_payload: this.buildNotificationPayload('booking_confirmation', booking),
          push_token: pushToken,
          delivery_channels: channels,
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
        });
      }

      // 2. 24 Hour Reminder
      if (preferences.reminder_24h_enabled !== false) {
        const reminder24h = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now) {
          notifications.push({
            booking_id: booking.id,
            user_id: user.id,
            notification_type: 'reminder_24h',
            scheduled_for: reminder24h.toISOString(),
            status: 'scheduled',
            priority: 4,
            retry_count: 0,
            max_retries: 3,
            message_payload: this.buildNotificationPayload('reminder_24h', booking),
            push_token: pushToken,
            delivery_channels: channels,
            expires_at: bookingDateTime.toISOString()
          });
        }
      }

      // 3. 1 Hour Reminder
      if (preferences.reminder_1h_enabled !== false) {
        const reminder1h = new Date(bookingDateTime.getTime() - 60 * 60 * 1000);
        if (reminder1h > now) {
          notifications.push({
            booking_id: booking.id,
            user_id: user.id,
            notification_type: 'reminder_1h',
            scheduled_for: reminder1h.toISOString(),
            status: 'scheduled',
            priority: 5,
            retry_count: 0,
            max_retries: 3,
            message_payload: this.buildNotificationPayload('reminder_1h', booking),
            push_token: pushToken,
            delivery_channels: channels,
            expires_at: new Date(bookingDateTime.getTime() + 30 * 60 * 1000).toISOString()
          });
        }
      }

      // Save to database
      if (notifications.length > 0) {
        const { error } = await this.supabase.client
          .from('notification_schedules')
          .insert(notifications);

        if (error) throw error;

        console.log(`✅ [SCHEDULE] ${notifications.length} notifications scheduled`);
        
        // Trigger immediate processing for confirmation
        if (preferences.booking_confirmation_enabled !== false) {
          setTimeout(() => this.triggerNotificationProcessing(), 2000);
        }
        
        return { success: true, count: notifications.length };
      }

      return { success: true, count: 0 };
      
    } catch (error) {
      console.error('❌ [SCHEDULE] Error:', error);
      return { 
        success: false, 
        reason: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 🔔 BUILD NOTIFICATION PAYLOAD
   */
  private buildNotificationPayload(type: NotificationType, booking: any): NotificationPayload {
    const templates = {
      booking_confirmation: {
        title: '✅ Reserva Confirmada',
        body: `Tu clase ${booking.class_name} ha sido reservada para el ${new Date(booking.session_date).toLocaleDateString('es-MX')}`
      },
      reminder_24h: {
        title: '⏰ Recordatorio - Mañana',
        body: `Mañana tienes ${booking.class_name} a las ${booking.session_time.substring(0, 5)}`
      },
      reminder_1h: {
        title: '🔔 ¡Tu clase empieza pronto!',
        body: `${booking.class_name} empieza en 1 hora - Cama ${booking.bed_numbers?.join(', ')}`
      },
      cancellation_user: {
        title: '❌ Reserva Cancelada',
        body: `Tu reserva de ${booking.class_name} ha sido cancelada`
      },
      cancellation_admin: {
        title: '⚠️ Clase Cancelada',
        body: `${booking.class_name} ha sido cancelada por el estudio`
      },
      class_update: {
        title: '📝 Cambio en tu Clase',
        body: `Hay cambios en tu reserva de ${booking.class_name}`
      }
    };

    const template = templates[type];

    return {
      title: template.title,
      body: template.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: {
        bookingId: booking.id,
        notificationType: type,
        actionUrl: `/account/bookings/${booking.id}`,
        classDate: booking.session_date,
        classTime: booking.session_time
      },
      tag: type,
      requireInteraction: type === 'reminder_1h',
      timestamp: Date.now()
    };
  }

  /**
   * 🚀 TRIGGER EDGE FUNCTION FOR PROCESSING
   */
  private async triggerNotificationProcessing(): Promise<void> {
    try {
      console.log('🚀 [EDGE] Triggering notification processing...');
      
      const { data, error } = await this.supabase.client.functions.invoke('process-notifications', {
        body: { trigger: 'manual' }
      });

      if (error) throw error;
      
      console.log('✅ [EDGE] Processing triggered:', data);
    } catch (error) {
      console.error('❌ [EDGE] Trigger failed:', error);
    }
  }

  /**
   * 📡 GET AVAILABLE DELIVERY CHANNELS
   */
  private getAvailableDeliveryChannels(): string[] {
    const channels: string[] = ['database'];
    
    if (this.canSendPushNotifications()) {
      channels.push('push');
    }
    
    const prefs = this._preferences();
    if (prefs?.email_notifications_enabled) {
      channels.push('email');
    }
    
    return channels;
  }

  /**
   * 📋 LOAD USER PREFERENCES
   */
  private async loadUserPreferences(): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return;

      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('❌ [PREFS] Load error:', error);
        return;
      }

      if (data) {
        this._preferences.set(data);
      } else {
        await this.createDefaultPreferences();
      }

    } catch (error) {
      console.error('❌ [PREFS] Error:', error);
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
      push_notifications_enabled: true,
      email_notifications_enabled: true,
      booking_confirmation_enabled: true,
      reminder_24h_enabled: true,
      reminder_1h_enabled: true,
      timezone_identifier: Intl.DateTimeFormat().resolvedOptions().timeZone,
      preferred_language: navigator.language.startsWith('es') ? 'es' : 'en'
    };

    try {
      const { data, error } = await this.supabase.client
        .from('user_notification_preferences')
        .insert(defaultPrefs)
        .select()
        .single();

      if (!error && data) {
        this._preferences.set(data);
      }
    } catch (error) {
      console.error('❌ [PREFS] Default creation error:', error);
    }
  }

  /**
   * 👤 GET CURRENT USER
   */
  private async getCurrentUser() {
    const { data: { user } } = await this.supabase.client.auth.getUser();
    return user;
  }

  /**
   * 📊 GET STATUS
   */
  getStatus() {
    return {
      initialized: this._isInitialized(),
      loading: this._isLoading(),
      permission: this._permissionStatus(),
      hasToken: !!this._pushToken(),
      token: this._pushToken()?.substring(0, 20),
      preferencesLoaded: !!this._preferences(),
      notificationsEnabled: this._preferences()?.notifications_enabled,
      pushEnabled: this._preferences()?.push_notifications_enabled,
      canSchedule: this.canScheduleNotifications(),
      canSendPush: this.canSendPushNotifications(),
      serviceWorkerReady: this._serviceWorkerReady(),
      firebaseInitialized: !!this.messaging
    };
  }

  /**
   * 🧪 TEST NOTIFICATION
   */
  async testNotification(type: NotificationType = 'booking_confirmation'): Promise<void> {
    console.log('🧪 [TEST] Testing notification...');
    
    if (Notification.permission !== 'granted') {
      throw new Error('Permissions not granted');
    }

    const testBooking = {
      id: 'test-' + Date.now(),
      class_name: 'Test Class',
      session_date: new Date().toISOString().split('T')[0],
      session_time: '10:00:00',
      bed_numbers: ['1', '2']
    };

    const payload = this.buildNotificationPayload(type, testBooking);

    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge
    });

    setTimeout(() => notification.close(), 5000);
  }

  /**
   * 📝 LOG EVENT
   */
  private async logEvent(event: string, details: any = {}): Promise<void> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return;

      await this.supabase.client
        .from('notification_logs')
        .insert({
          user_id: user.id,
          log_type: 'user_interaction',
          notification_type: details.notificationType,
          success: true,
          user_action: event,
          action_data: details,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Log error:', error);
    }
  }

  /**
   * 🔄 RESET SERVICE
   */
  reset(): void {
    this._isInitialized.set(false);
    this._permissionStatus.set('default');
    this._pushToken.set(null);
    this._preferences.set(null);
    this._serviceWorkerReady.set(false);
    console.log('🔄 [RESET] Service reset');
  }

  /**
   * 🔍 CHECK IF DEVELOPMENT
   */
  private isDevelopment(): boolean {
    if (!this.isBrowser) return false;
    const hostname = window.location?.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  /**
   * 🔧 FORCE REGISTER TOKEN (Debug)
   */
  async forceRegisterToken(): Promise<void> {
    console.log('🔧 [DEBUG] Force registering token...');
    
    try {
      if (!this.messaging) {
        await this.initializeFirebase();
      }
      
      if (!this._serviceWorkerReady()) {
        await this.registerServiceWorker();
      }
      
      if (this._permissionStatus() !== 'granted') {
        await this.requestPermissions();
      }
      
      await this.registerPushToken();
      console.log('✅ [DEBUG] Force registration complete');
    } catch (error) {
      console.error('❌ [DEBUG] Force registration failed:', error);
      throw error;
    }
  }
}