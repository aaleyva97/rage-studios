import { Injectable, effect, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { SwPush, SwUpdate } from '@angular/service-worker';
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

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  
  // 🔥 ANGULAR SWPUSH NATIVO - PROFESIONAL
  private readonly swPush = inject(SwPush, { optional: true });
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  
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
      
      // 3. Service Worker Analysis
      if (capabilities.serviceWorkerSupported) {
        console.log('🔧 [SMART] Service Worker supported, checking registration...');
        await this.analyzeServiceWorkerStatus();
        
        // 4. Try to get existing push token (con fallback inteligente)
        await this.tryGetExistingPushTokenWithFallback();
        
        // 5. Setup service worker message handlers (opcional)
        await this.setupServiceWorkerHandlersWithFallback();
      } else {
        console.warn('⚠️ [SMART] Service Worker not supported - notifications will be database-only');
      }
      
      this._isInitialized.set(true);
      
      const finalStatus = this.getStatus();
      console.log('✅ [SMART] NotificationService initialized successfully:', finalStatus);

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

  /**
   * 🔧 ANÁLISIS PROFESIONAL CON ANGULAR SWPUSH
   */
  private async analyzeServiceWorkerStatus(): Promise<void> {
    try {
      console.log('🔧 [SWPUSH] Analyzing Angular Service Worker status...');
      
      // Check if SwPush is available
      if (!this.swPush) {
        console.warn('⚠️ [SWPUSH] Angular SwPush not available (SSR or not configured)');
        return;
      }
      
      // Check if SwPush is enabled
      if (!this.swPush.isEnabled) {
        console.warn('⚠️ [SWPUSH] Angular SwPush is disabled');
        return;
      }
      
      console.log('✅ [SWPUSH] Angular SwPush is available and enabled');
      
      // Setup push notification handlers using Angular SwPush
      this.setupSwPushHandlers();
      
    } catch (error) {
      console.error('❌ [SWPUSH] Error analyzing Service Worker status:', error);
    }
  }

  /**
   * 🔥 SETUP ANGULAR SWPUSH HANDLERS - PROFESIONAL
   */
  private setupSwPushHandlers(): void {
    if (!this.swPush || !this.swPush.isEnabled) {
      console.warn('⚠️ [SWPUSH] SwPush not available for handlers setup');
      return;
    }
    
    console.log('🔧 [SWPUSH] Setting up Angular SwPush handlers...');
    
    // Listen for push messages using Angular SwPush
    this.swPush.messages.subscribe(message => {
      console.log('🔔 [SWPUSH] Push message received:', message);
      this.handlePushMessage(message);
    });
    
    // Listen for notification clicks using Angular SwPush
    this.swPush.notificationClicks.subscribe(click => {
      console.log('🔔 [SWPUSH] Notification clicked:', click);
      this.handleNotificationClick(click);
    });
    
    // Listen for Service Worker updates
    if (this.swUpdate && this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        console.log('🔄 [SWUPDATE] Version update:', event.type);
        
        if (event.type === 'VERSION_READY') {
          // Optionally prompt user to reload
          console.log('🔄 [SWUPDATE] New version ready');
        }
      });
    }
    
    console.log('✅ [SWPUSH] Angular SwPush handlers setup complete');
  }
  
  /**
   * 📨 HANDLE PUSH MESSAGE FROM ANGULAR SWPUSH
   */
  private handlePushMessage(message: any): void {
    console.log('📨 [SWPUSH] Processing push message:', message);
    
    // Emit to reactive stream for components
    this._notificationReceived.next(message);
    
    // Log the event
    this.logInteraction('push_message_received', { message });
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
        console.log('✅ Permission granted, registering push token...');
        
        // Auto-register push token after permission granted
        result.token = await this.registerPushToken();
        
        // Log successful permission
        await this.logEvent('permission_granted', {
          previousPermission: 'default',
          token: !!result.token
        });
        
        console.log('🎉 Permissions and token setup complete');
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

  // 📱 PUSH TOKEN MANAGEMENT CON ANGULAR SWPUSH
  private async tryGetExistingPushTokenWithFallback(): Promise<void> {
    try {
      console.log('🔍 [SWPUSH] Checking for existing push subscription...');
      
      if (!this.swPush || !this.swPush.isEnabled) {
        console.log('ℹ️ [SWPUSH] Angular SwPush not available, skipping token check');
        return;
      }
      
      // Get existing subscription using Angular SwPush
      const subscription = await this.swPush.subscription.toPromise();
      
      if (subscription) {
        const token = this.extractTokenFromSubscription(subscription);
        this._pushToken.set(token);
        
        // Update last seen timestamp in database (async, no bloquear)
        this.updateTokenLastSeen(token).catch(() => {
          console.warn('⚠️ Could not update token timestamp (non-blocking)');
        });
        
        console.log('✅ [SWPUSH] Found existing push subscription');
      } else {
        console.log('ℹ️ [SWPUSH] No existing push subscription found');
      }
    } catch (error) {
      console.warn('⚠️ [SWPUSH] Could not check existing subscription, will retry later:', error);
      // NO fallar la inicialización por esto
      // Programar reintentos en background
      this.scheduleTokenRetrieval();
    }
  }

  private scheduleTokenRetrieval(): void {
    // Reintento después de 5 segundos
    setTimeout(() => {
      if (!this._pushToken() && this._permissionStatus() === 'granted') {
        console.log('🔄 [RETRY] Attempting push token retrieval...');
        this.tryGetExistingPushToken().catch(() => {
          console.warn('⚠️ [RETRY] Push token retrieval failed, will try again later');
        });
      }
    }, 5000);
  }

  private async tryGetExistingPushToken(): Promise<void> {
    try {
      console.log('🔍 [SWPUSH-RETRY] Checking for existing push token...');
      
      if (!this.swPush || !this.swPush.isEnabled) {
        console.warn('⚠️ [SWPUSH-RETRY] Angular SwPush not available');
        return;
      }
      
      const subscription = await this.swPush.subscription.toPromise();
      
      if (subscription) {
        const token = this.extractTokenFromSubscription(subscription);
        this._pushToken.set(token);
        
        // Update last seen timestamp in database
        await this.updateTokenLastSeen(token);
        
        console.log('✅ [SWPUSH-RETRY] Found existing push token');
      } else {
        console.log('ℹ️ [SWPUSH-RETRY] No existing push subscription found');
      }
    } catch (error) {
      console.warn('⚠️ [SWPUSH-RETRY] Could not get existing push token:', error);
    }
  }

  async registerPushToken(): Promise<string> {
    if (!this.isNotificationSupported() || this._permissionStatus() !== 'granted') {
      throw new Error('Cannot register push token: permissions not granted or not supported');
    }

    if (!this.swPush || !this.swPush.isEnabled) {
      throw new Error('Angular SwPush not available or enabled');
    }

    try {
      console.log('📱 [SWPUSH] Registering push token with Angular SwPush...');
      
      // 🚨 TIMEOUT CRÍTICO: Máximo 8 segundos para registro completo
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Push token registration timeout')), 8000)
      );

      const registrationPromise = this.performSwPushTokenRegistration();
      
      return await Promise.race([registrationPromise, timeoutPromise]);
      
    } catch (error) {
      console.error('❌ [SWPUSH] Error registering push token:', error);
      await this.logEvent('token_registration_failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async performSwPushTokenRegistration(): Promise<string> {
    console.log('📱 [SWPUSH] Starting push token registration with Angular SwPush...');
    
    if (!this.swPush || !this.swPush.isEnabled) {
      throw new Error('Angular SwPush not available');
    }
    
    // Check if already subscribed using Angular SwPush
    let subscription = await this.swPush.subscription.toPromise();
    
    if (!subscription) {
      console.log('🔔 [SWPUSH] Creating new push subscription...');
      
      // Request subscription using Angular SwPush with timeout
      const vapidKey = this.getVapidPublicKeyForSwPush();
      
      const subscribePromise = this.swPush.requestSubscription({ 
        serverPublicKey: vapidKey 
      });
      
      const subscribeTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Angular SwPush subscription timeout')), 5000)
      );
      
      subscription = await Promise.race([subscribePromise, subscribeTimeoutPromise]);
      console.log('✅ [SWPUSH] New push subscription created with Angular SwPush');
    } else {
      console.log('✅ [SWPUSH] Using existing Angular SwPush subscription');
    }
    
    const token = this.extractTokenFromSubscription(subscription);
    const deviceInfo = this.getDeviceInfo();
    
    // Store in Supabase database con timeout
    const dbPromise = this.storeTokenInDatabase(token, deviceInfo);
    const dbTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Database storage timeout')), 2000)
    );
    
    await Promise.race([dbPromise, dbTimeoutPromise]);
    
    this._pushToken.set(token);
    
    console.log('🎉 [SWPUSH] Push token registered and stored successfully with Angular SwPush');
    
    // Log event de forma asíncrona (no bloquear)
    this.logEvent('token_registered', {
      deviceType: 'web',
      deviceInfo,
      method: 'angular_swpush'
    }).catch(() => {
      // Ignore logging errors
    });
    
    return token;
  }

  private extractTokenFromSubscription(subscription: PushSubscription): string {
    // Convert PushSubscription to token string for storage
    const subscriptionObject = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.getKey('p256dh') ? 
          btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))) : null,
        auth: subscription.getKey('auth') ? 
          btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))) : null
      }
    };
    
    return btoa(JSON.stringify(subscriptionObject));
  }

  /**
   * 🔧 VAPID KEY FOR ANGULAR SWPUSH (STRING FORMAT)
   */
  private getVapidPublicKeyForSwPush(): string {
    // Angular SwPush expects string format, not Uint8Array
    const isDevelopment = this.isDevelopmentEnvironment();
    
    if (isDevelopment) {
      console.log('🔧 [SWPUSH-DEV] Using development VAPID key');
      return this.getDevelopmentVapidKey();
    } else {
      console.log('🏭 [SWPUSH-PROD] Using production VAPID key');
      return 'BG6JhFh9ZQi-_0LD9vkRyHGOzF-vYfIjXpVcOyM4L4w8pQZrYr7_HiAJ0bMqC7-RGXdYFRqIwLwZvVcGHNlRq_k';
    }
  }
  
  /**
   * 🔧 LEGACY VAPID KEY (UINT8ARRAY FORMAT) - MANTENER PARA COMPATIBILIDAD
   */
  private getVapidPublicKey(): Uint8Array {
    // 🔧 DESARROLLO: VAPID keys válidas generadas para localhost testing
    // En producción, estas deberían venir del environment/servidor
    
    let vapidPublicKey: string;
    
    // 🚨 DETECCIÓN INTELIGENTE DE AMBIENTE SIN window.location
    const isDevelopment = this.isDevelopmentEnvironment();
    
    if (isDevelopment) {
      // 🧪 DESARROLLO: Keys válidas para testing local
      console.log('🔧 [DEV] Using development VAPID keys for localhost');
      vapidPublicKey = this.getDevelopmentVapidKey();
    } else {
      // 🏭 PRODUCCIÓN: Keys reales del servidor
      console.log('🏭 [PROD] Using production VAPID keys');  
      vapidPublicKey = 'BG6JhFh9ZQi-_0LD9vkRyHGOzF-vYfIjXpVcOyM4L4w8pQZrYr7_HiAJ0bMqC7-RGXdYFRqIwLwZvVcGHNlRq_k';
    }
    
    // 🚨 SAFE atob() - protegido contra SSR
    if (!this.isBrowser || typeof window === 'undefined' || !window.atob) {
      console.warn('⚠️ [SSR] Cannot process VAPID key on server side');
      return new Uint8Array();
    }
    
    try {
      const padding = '='.repeat((4 - vapidPublicKey.length % 4) % 4);
      const base64 = (vapidPublicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
    } catch (error) {
      console.error('❌ Error converting VAPID key:', error);
      // Return empty array as fallback - notifications will work in database-only mode
      return new Uint8Array();
    }
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

  /**
   * 🧪 DESARROLLO: VAPID key válida para testing localhost
   * Generada con web-push library para desarrollo local
   */
  private getDevelopmentVapidKey(): string {
    // Esta key fue generada específicamente para desarrollo localhost
    // No tiene servidor backend real pero permite testing de Service Worker
    return 'BLc4xRzdHz2mmw-9EsrTRhmyHnEzOzTbZqXYEcH-IUvhP_RlBtdz_iBhf6IxCz8LrEBLyv_vD8YAX2hf6vKOZsU';
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

  private async storeTokenInDatabase(token: string, deviceInfo: DeviceInfo): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('User not authenticated');

    console.log('💾 Storing push token in database...');

    const { error } = await this.supabase.client.rpc('upsert_push_token', {
      p_user_id: user.id,
      p_token: token,
      p_device_type: 'web',
      p_device_name: `${deviceInfo.platform} - ${this.getBrowserName()}`
    });

    if (error) {
      console.error('❌ Error storing push token in database:', error);
      throw error;
    }

    console.log('✅ Push token stored in database successfully');
  }

  private getBrowserName(): string {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown';
  }

  private async updateTokenLastSeen(token: string): Promise<void> {
    const user = await this.getCurrentUser();
    if (!user) return;

    try {
      const { error } = await this.supabase.client
        .from('user_notification_preferences')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) {
        console.warn('⚠️ Could not update token last seen:', error);
      }
    } catch (error) {
      console.warn('⚠️ Error updating token last seen:', error);
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
        session_date: new Date(booking.session_date).toLocaleDateString('es-MX', {
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

  // 🔧 SERVICE WORKER INTEGRATION CON ANGULAR SWPUSH
  private async setupServiceWorkerHandlersWithFallback(): Promise<void> {
    if (!this.swPush || !this.swPush.isEnabled) {
      console.log('ℹ️ [SWPUSH] Angular SwPush not available, skipping handlers setup');
      return;
    }

    try {
      // Setup handlers using Angular SwPush (already done in analyzeServiceWorkerStatus)
      console.log('✅ [SWPUSH] Service Worker handlers already configured via Angular SwPush');
      
    } catch (error) {
      console.warn('⚠️ [SWPUSH] Service Worker handlers setup failed, system will still work:', error);
    }
  }

  // 📨 LEGACY SERVICE WORKER MESSAGE HANDLER - REMOVED (USING ANGULAR SWPUSH HANDLERS)

  private async handleNotificationClick(payload: any): Promise<void> {
    console.log('🔔 Notification clicked:', payload);
    
    try {
      // Log the interaction
      await this.logInteraction('notification_clicked', payload);
      
      // Handle navigation based on payload data
      if (payload.data?.actionUrl) {
        // Use Angular Router for navigation if available
        // For now, fallback to window.location
        window.location.href = payload.data.actionUrl;
      }
      
    } catch (error) {
      console.error('❌ Error handling notification click:', error);
    }
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
   * 
   * PUSH TOKEN: Es un identificador único que permite al servidor enviar 
   * notificaciones push directamente al navegador del usuario, incluso cuando
   * la pestaña está cerrada. SIN PUSH TOKEN, las notificaciones solo funcionan
   * cuando el usuario está activo en la web.
   * 
   * Para RageStudios, las notificaciones push son CRÍTICAS porque:
   * 1. Recordatorios de clases (24h y 1h antes)
   * 2. Confirmaciones de reservas
   * 3. Avisos de cancelaciones
   * 4. Notificaciones admin urgentes
   * 
   * El sistema debe funcionar SIEMPRE, con o sin push token.
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