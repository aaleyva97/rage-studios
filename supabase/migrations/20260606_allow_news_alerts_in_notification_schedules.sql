-- Drop NOT NULL constraint on booking_id in notification_schedules
ALTER TABLE notification_schedules ALTER COLUMN booking_id DROP NOT NULL;

-- Recreate notification_type check constraint to include news_alert
ALTER TABLE notification_schedules DROP CONSTRAINT IF EXISTS notification_schedules_notification_type_check;

ALTER TABLE notification_schedules ADD CONSTRAINT notification_schedules_notification_type_check 
  CHECK (notification_type = ANY (ARRAY[
    'booking_confirmation'::text, 
    'reminder_24h'::text, 
    'reminder_1h'::text, 
    'cancellation_user'::text, 
    'cancellation_admin'::text, 
    'class_update'::text, 
    'waitlist_enrolled'::text, 
    'waitlist_promoted'::text, 
    'waitlist_failed_promotion'::text, 
    'news_alert'::text
  ]));
