import { Injectable, effect, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, from } from 'rxjs';
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
  
  readonly canSendNotifications = computed(() => 
    this._permissionStatus() === 'granted' && 
    this._pushToken() !== null &&
    this._preferences()?.notifications_enabled === true
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
      // Auto-initialize when user authentication changes
      effect(() => {
        this.supabase.currentUser$.subscribe(user => {
          if (user && !this._isInitialized()) {
            this.initialize().catch(err => {
              console.error('❌ Auto-initialization failed:', err);
            });
          } else if (!user) {
            this.reset();
          }
        });
      });
    }
  }

  // 🚀 INITIALIZATION METHODS
  async initialize(): Promise<void> {
    if (this._isInitialized() || this._isLoading()) {
      return;
    }

    this._isLoading.set(true);
    
    try {
      console.log('🔄 NotificationService: Starting initialization...');

      if (!this.isNotificationSupported()) {
        console.warn('⚠️ Push notifications not supported in this browser');
        return;
      }

      // 1. Check current permission status
      this._permissionStatus.set(Notification.permission);
      console.log('🔐 Current permission status:', this._permissionStatus());
      
      // 2. Load user preferences from database
      await this.loadUserPreferences();
      
      // 3. Try to get existing push token
      await this.tryGetExistingPushToken();
      
      // 4. Setup service worker message handlers
      await this.setupServiceWorkerHandlers();
      
      this._isInitialized.set(true);
      
      console.log('✅ NotificationService initialized successfully:', {
        permission: this._permissionStatus(),
        hasToken: !!this._pushToken(),
        canSend: this.canSendNotifications(),
        preferences: !!this._preferences()
      });

      // Log initialization event
      await this.logEvent('service_initialized', {
        permission: this._permissionStatus(),
        hasToken: !!this._pushToken(),
        supported: this.isNotificationSupported()
      });
      
    } catch (error) {
      console.error('❌ NotificationService initialization failed:', error);
      await this.logEvent('initialization_failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      this._isLoading.set(false);
    }
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

  // 📱 PUSH TOKEN MANAGEMENT
  private async tryGetExistingPushToken(): Promise<void> {
    try {
      console.log('🔍 Checking for existing push token...');
      
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        const token = this.extractTokenFromSubscription(subscription);
        this._pushToken.set(token);
        
        // Update last seen timestamp in database
        await this.updateTokenLastSeen(token);
        
        console.log('✅ Found existing push token');
      } else {
        console.log('ℹ️ No existing push subscription found');
      }
    } catch (error) {
      console.warn('⚠️ Could not get existing push token:', error);
    }
  }

  async registerPushToken(): Promise<string> {
    if (!this.isNotificationSupported() || this._permissionStatus() !== 'granted') {
      throw new Error('Cannot register push token: permissions not granted or not supported');
    }

    try {
      console.log('📱 Registering push token...');
      
      // 🚨 TIMEOUT CRÍTICO: Máximo 8 segundos para registro completo
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Push token registration timeout')), 8000)
      );

      const registrationPromise = this.performTokenRegistration();
      
      return await Promise.race([registrationPromise, timeoutPromise]);
      
    } catch (error) {
      console.error('❌ Error registering push token:', error);
      await this.logEvent('token_registration_failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async performTokenRegistration(): Promise<string> {
    console.log('📱 Starting push token registration process...');
    
    // Timeout individual para service worker ready: 3 segundos
    const swReadyPromise = navigator.serviceWorker.ready;
    const swTimeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Service worker ready timeout')), 3000)
    );
    
    const registration = await Promise.race([swReadyPromise, swTimeoutPromise]);
    console.log('✅ Service worker ready');
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      console.log('🔔 Creating new push subscription...');
      
      // Timeout para crear subscripción: 3 segundos
      const vapidKey = this.getVapidPublicKey();
      const subscribePromise = registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey.length > 0 ? vapidKey as BufferSource : undefined
      });
      
      const subscribeTimeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Push subscription creation timeout')), 3000)
      );
      
      subscription = await Promise.race([subscribePromise, subscribeTimeoutPromise]);
      console.log('✅ New push subscription created');
    } else {
      console.log('✅ Using existing push subscription');
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
    
    console.log('🎉 Push token registered and stored successfully');
    
    // Log event de forma asíncrona (no bloquear)
    this.logEvent('token_registered', {
      deviceType: 'web',
      deviceInfo
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

  private getVapidPublicKey(): Uint8Array {
    // VAPID key for push notifications - should come from environment
    const vapidPublicKey = 'BG6JhFh9ZQi-_0LD9vkRyHGOzF-vYfIjXpVcOyM4L4w8pQZrYr7_HiAJ0bMqC7-RGXdYFRqIwLwZvVcGHNlRq_k';
    
    try {
      const padding = '='.repeat((4 - vapidPublicKey.length % 4) % 4);
      const base64 = (vapidPublicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
    } catch (error) {
      console.error('❌ Error converting VAPID key:', error);
      // Return empty array as fallback
      return new Uint8Array();
    }
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
    const canSend = this.canSendNotifications();
    const status = this.getStatus();
    
    if (!canSend) {
      const reason = `Missing requirements - Permission: ${status.permission}, HasToken: ${status.hasToken}, Preferences: ${status.hasPreferences}`;
      console.warn('⚠️ Cannot schedule notifications:', reason);
      return { success: false, reason };
    }

    try {
      console.log('📅 Scheduling notifications for booking:', booking.id);
      
      const user = await this.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const preferences = this._preferences();
      if (!preferences) throw new Error('User preferences not loaded');

      const notifications: Partial<NotificationSchedule>[] = [];
      const bookingDateTime = new Date(`${booking.session_date}T${booking.session_time}`);
      const now = new Date();

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
          push_token: this._pushToken() || undefined,
          delivery_channels: ['push'],
          expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
          session_data: this.extractSessionData(booking),
          user_preferences: { message_style: preferences.message_style }
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
            push_token: this._pushToken() || undefined,
            delivery_channels: ['push'],
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
            push_token: this._pushToken() || undefined,
            delivery_channels: ['push'],
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

  // 🔧 SERVICE WORKER INTEGRATION
  private async setupServiceWorkerHandlers(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('🔧 Setting up service worker message handlers...');
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });

      console.log('✅ Service worker handlers setup complete');
      
    } catch (error) {
      console.error('❌ Error setting up service worker handlers:', error);
    }
  }

  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, payload } = event.data || {};
    
    console.log('📨 Service worker message received:', type, payload);

    switch (type) {
      case 'NOTIFICATION_CLICKED':
        this.handleNotificationClick(payload);
        break;
      case 'NOTIFICATION_RECEIVED':
        this._notificationReceived.next(payload);
        this.logInteraction('notification_received', payload);
        break;
      case 'NOTIFICATION_CLOSED':
        this.logInteraction('notification_closed', payload);
        break;
      default:
        console.log('🔄 Unknown service worker message type:', type);
    }
  }

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

  // 📈 PUBLIC STATUS METHODS
  getStatus() {
    return {
      initialized: this._isInitialized(),
      supported: this.isNotificationSupported(),
      permission: this._permissionStatus(),
      hasToken: !!this._pushToken(),
      canSend: this.canSendNotifications(),
      hasPreferences: !!this._preferences(),
      loading: this._isLoading()
    };
  }
}