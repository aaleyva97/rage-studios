export interface UserNotificationPreferences {
  id: string;
  userId: string;
  notificationsEnabled: boolean;
  timezoneIdentifier: string;
  preferredLanguage: string;
  
  // Notification type preferences
  bookingConfirmationEnabled: boolean;
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  cancellationNotificationsEnabled: boolean;
  classUpdateNotificationsEnabled: boolean;
  marketingNotificationsEnabled: boolean;
  
  // Channel preferences
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  
  // Do Not Disturb
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimezone: string;
  
  // Push tokens
  pushTokens: PushToken[];
  primaryDeviceToken?: string;
  lastTokenUpdatedAt?: string;
  
  // Content preferences
  messageStyle: 'minimal' | 'standard' | 'detailed';
  includeCoachInfo: boolean;
  includeLocationInfo: boolean;
  includeQuickActions: boolean;
  
  // Privacy settings
  shareAttendanceStatus: boolean;
  allowAdminOverride: boolean;
  
  // Metadata
  notificationSound: string;
  vibrationPattern: string;
  customSettings: Record<string, any>;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface PushToken {
  token: string;
  deviceType: 'web' | 'android' | 'ios';
  deviceName: string;
  registeredAt: string;
  lastSeen: string;
  isActive: boolean;
}

export interface NotificationSchedule {
  id: string;
  bookingId: string;
  userId: string;
  notificationType: NotificationType;
  scheduledFor: string;
  timezoneOffset: number;
  
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'expired';
  priority: number;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: string;
  lastError?: string;
  
  sentAt?: string;
  cancelledAt?: string;
  expiresAt?: string;
  
  pushToken?: string;
  messagePayload: NotificationPayload;
  deliveryChannels: string[];
  
  sessionData?: Record<string, any>;
  userPreferences?: Record<string, any>;
  
  createdAt: string;
  updatedAt: string;
}

export interface NotificationLog {
  id: string;
  scheduleId?: string;
  userId: string;
  bookingId?: string;
  
  logType: 'scheduled' | 'sent_success' | 'sent_failure' | 'delivery_confirmed' | 
           'delivery_failed' | 'user_interaction' | 'cancelled' | 'retry_attempt' | 
           'expired' | 'token_invalid' | 'preference_blocked';
  
  notificationType?: NotificationType;
  channelUsed?: string;
  providerUsed?: string;
  
  messageTitle?: string;
  messageBody?: string;
  pushTokenUsed?: string;
  
  success: boolean;
  httpStatusCode?: number;
  providerResponse?: Record<string, any>;
  errorCode?: string;
  errorMessage?: string;
  
  processingTimeMs?: number;
  deliveryTimeMs?: number;
  scheduledFor?: string;
  sentAt?: string;
  deliveredAt?: string;
  
  userAction?: string;
  actionData?: Record<string, any>;
  interactionAt?: string;
  
  deviceInfo?: DeviceInfo;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  campaignId?: string;
  abTestGroup?: string;
  businessContext?: Record<string, any>;
  
  createdAt: string;
}

export interface NotificationTemplate {
  id: string;
  templateKey: string;
  templateName: string;
  notificationType: NotificationType;
  category: string;
  priorityLevel: number;
  
  languageCode: string;
  countryCode: string;
  
  titleTemplate: string;
  bodyTemplate: string;
  actionText?: string;
  actionUrl?: string;
  
  channelConfig: Record<string, any>;
  requiredVariables: string[];
  optionalVariables: string[];
  variableValidation: Record<string, any>;
  
  sendConditions: Record<string, any>;
  rateLimiting: Record<string, any>;
  
  testVariant: string;
  testGroupPercentage: number;
  
  advanceTimeMinutes?: number;
  expirationMinutes: number;
  retryConfig: Record<string, any>;
  
  isActive: boolean;
  version: number;
  parentTemplateId?: string;
  
  description?: string;
  usageNotes?: string;
  tags: string[];
  
  usageCount: number;
  successRate?: number;
  clickThroughRate?: number;
  lastUsedAt?: string;
  
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, any>;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export type NotificationType = 
  | 'booking_confirmation'
  | 'reminder_24h' 
  | 'reminder_1h'
  | 'cancellation_user'
  | 'cancellation_admin'
  | 'class_update';

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

export interface NotificationServiceConfig {
  vapidPublicKey?: string;
  swUrl?: string;
  enableLogging?: boolean;
  retryAttempts?: number;
}