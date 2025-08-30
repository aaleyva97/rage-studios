// ===== EXACT SUPABASE SCHEMA MATCH =====
// This interface MUST match the exact column names in Supabase

export interface UserNotificationPreferences {
  id: string;
  user_id: string; // matches DB column
  notifications_enabled: boolean;
  timezone_identifier?: string;
  preferred_language?: string;
  
  // Notification type preferences
  booking_confirmation_enabled?: boolean;
  reminder_24h_enabled?: boolean;
  reminder_1h_enabled?: boolean;
  cancellation_notifications_enabled?: boolean;
  class_update_notifications_enabled?: boolean;
  marketing_notifications_enabled?: boolean;
  
  // Channel preferences
  push_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  
  // Do Not Disturb
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string; // time format
  quiet_hours_end?: string; // time format  
  quiet_hours_timezone?: string;
  
  // Reminder advance time (JSONB field)
  reminder_advance_time?: {
    booking_confirmation?: number;
    reminder_24h?: number;
    reminder_1h?: number;
    custom_reminder_1?: number | null;
    custom_reminder_2?: number | null;
  };
  
  // Push tokens (JSONB array)
  push_tokens?: PushToken[];
  primary_device_token?: string;
  last_token_updated_at?: string;
  
  // Content preferences
  message_style?: 'minimal' | 'standard' | 'detailed';
  include_coach_info?: boolean;
  include_location_info?: boolean;
  include_quick_actions?: boolean;
  
  // Privacy settings
  share_attendance_status?: boolean;
  allow_admin_override?: boolean; // matches DB column exactly
  
  // Metadata
  notification_sound?: string;
  vibration_pattern?: string;
  custom_settings?: Record<string, any>; // JSONB field
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface NotificationSchedule {
  id: string;
  booking_id: string; // matches DB column
  user_id: string; // matches DB column
  notification_type: NotificationType;
  scheduled_for: string;
  timezone_offset?: number;
  
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'expired';
  priority: number;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  last_error?: string;
  
  sent_at?: string;
  cancelled_at?: string;
  expires_at?: string;
  
  push_token?: string;
  message_payload: NotificationPayload; // JSONB field
  delivery_channels?: string[];
  session_data?: Record<string, any>; // JSONB field  
  user_preferences?: Record<string, any>; // JSONB field
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface NotificationLog {
  id: string;
  schedule_id?: string;
  user_id: string;
  booking_id?: string;
  log_type: 'scheduled' | 'sent_success' | 'sent_failure' | 'delivery_confirmed' | 
           'delivery_failed' | 'user_interaction' | 'cancelled' | 'retry_attempt' | 
           'expired' | 'token_invalid' | 'preference_blocked';
  notification_type?: NotificationType;
  channel_used?: string;
  provider_used?: string;
  
  // Message details
  message_title?: string;
  message_body?: string;
  push_token_used?: string;
  
  // Status and response
  success: boolean;
  http_status_code?: number;
  provider_response?: Record<string, any>; // JSONB field
  error_code?: string;
  error_message?: string;
  
  // Performance metrics
  processing_time_ms?: number;
  delivery_time_ms?: number;
  
  // Timestamps
  scheduled_for?: string;
  sent_at?: string;
  delivered_at?: string;
  
  // User interaction
  user_action?: string;
  action_data?: Record<string, any>; // JSONB field
  interaction_at?: string;
  
  // Device and session
  device_info?: Record<string, any>; // JSONB field
  session_id?: string;
  ip_address?: string; // inet type
  user_agent?: string;
  
  // Analytics
  campaign_id?: string;
  a_b_test_group?: string;
  business_context?: Record<string, any>; // JSONB field
  
  created_at?: string;
}

export interface NotificationTemplate {
  id: string;
  template_key: string;
  template_name: string;
  notification_type: NotificationType;
  category?: string;
  priority_level?: number;
  language_code: string;
  country_code?: string;
  
  // Template content
  title_template: string;
  body_template: string;
  action_text?: string;
  action_url?: string;
  
  // Configuration
  channel_config?: Record<string, any>; // JSONB field
  required_variables?: string[];
  optional_variables?: string[];
  variable_validation?: Record<string, any>; // JSONB field
  send_conditions?: Record<string, any>; // JSONB field
  rate_limiting?: Record<string, any>; // JSONB field
  
  // A/B Testing
  test_variant?: string;
  test_group_percentage?: number;
  
  // Timing
  advance_time_minutes?: number;
  expiration_minutes?: number;
  retry_config?: Record<string, any>; // JSONB field
  
  // Status and versioning
  is_active?: boolean;
  version?: number;
  parent_template_id?: string;
  
  // Metadata
  description?: string;
  usage_notes?: string;
  tags?: string[];
  
  // Analytics
  usage_count?: number;
  success_rate?: number;
  click_through_rate?: number;
  last_used_at?: string;
  
  // Audit
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// Supporting interfaces remain the same
export type NotificationType = 
  | 'booking_confirmation'
  | 'reminder_24h' 
  | 'reminder_1h'
  | 'cancellation_user'
  | 'cancellation_admin'
  | 'class_update';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, any>;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
  tag?: string;
  renotify?: boolean;
  vibrate?: number[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface DeviceInfo {
  platform: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
}

export interface NotificationPermissionResult {
  granted: boolean;
  permission: NotificationPermission;
  token?: string;
}

export interface PushToken {
  token: string;
  deviceType: 'web' | 'android' | 'ios';
  deviceName?: string;
  isActive: boolean;
  lastUsedAt: string;
  createdAt: string;
}