-- 1. Add checkin_reminder_enabled to user_notification_preferences
ALTER TABLE public.user_notification_preferences 
  ADD COLUMN IF NOT EXISTS checkin_reminder_enabled BOOLEAN DEFAULT true;

-- 2. Update check constraint on notification_schedules to allow checkin_reminder
ALTER TABLE public.notification_schedules DROP CONSTRAINT IF EXISTS notification_schedules_notification_type_check;

ALTER TABLE public.notification_schedules ADD CONSTRAINT notification_schedules_notification_type_check 
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
    'news_alert'::text,
    'checkin_reminder'::text
  ]));

-- 3. Update check constraint on notification_templates to allow checkin_reminder
ALTER TABLE public.notification_templates DROP CONSTRAINT IF EXISTS notification_templates_notification_type_check;

ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_notification_type_check 
  CHECK (notification_type = ANY (ARRAY[
    'booking_confirmation'::text, 
    'reminder_24h'::text, 
    'reminder_1h'::text, 
    'cancellation_user'::text, 
    'cancellation_admin'::text, 
    'class_update'::text, 
    'marketing'::text, 
    'system_maintenance'::text, 
    'waitlist_enrolled'::text, 
    'waitlist_promoted'::text, 
    'waitlist_failed_promotion'::text,
    'news_alert'::text,
    'checkin_reminder'::text
  ]));

-- 4. Create the default template for checkin_reminder
INSERT INTO public.notification_templates (
  id,
  template_key,
  template_name,
  notification_type,
  category,
  priority_level,
  language_code,
  country_code,
  title_template,
  body_template,
  action_text,
  action_url,
  channel_config,
  required_variables,
  optional_variables,
  variable_validation,
  send_conditions,
  rate_limiting,
  test_variant,
  test_group_percentage,
  advance_time_minutes,
  expiration_minutes,
  retry_config,
  is_active,
  version
) VALUES (
  '9e17b8df-d6e6-42d8-b2ef-cf4fca14c330',
  'checkin_reminder_es',
  'Recordatorio de Check-In',
  'checkin_reminder',
  'operational',
  3,
  'es-MX',
  'MX',
  '¡Hora de hacer Check-In! 📲',
  'Hola {{user_name}}, tu clase de {{class_name}} comienza en 5 minutos. Haz check-in ahora para asegurar tu asistencia.',
  'Hacer Check-In',
  '/dashboard',
  '{"push": {"enabled": true, "priority": "high"}, "sms": {"enabled": false}, "email": {"enabled": false}, "in_app": {"icon": "notification", "enabled": true}}'::jsonb,
  ARRAY['user_name', 'class_name'],
  ARRAY[]::text[],
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  'control',
  100,
  5,
  1440,
  '{"max_retries": 3, "retry_intervals": [5, 15, 60]}'::jsonb,
  true,
  1
) ON CONFLICT (template_key, language_code) DO NOTHING;

-- 5. Recreate schedule_reminder_notification function to allow and calculate checkin_reminder
CREATE OR REPLACE FUNCTION public.schedule_reminder_notification(
  p_booking_id uuid,
  p_user_id uuid,
  p_session_date date,
  p_session_time time without time zone,
  p_reminder_type text,
  p_payload jsonb,
  p_token text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
  v_session_datetime TIMESTAMPTZ;
  v_scheduled_for TIMESTAMPTZ;
  v_priority INT;
  v_expires_offset INTERVAL;
  v_hours_before INT;
BEGIN
  -- Validar tipo de recordatorio
  IF p_reminder_type NOT IN ('reminder_24h', 'reminder_1h', 'checkin_reminder') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid reminder type'
    );
  END IF;
  
  -- Construir datetime de la sesión en zona horaria de México
  v_session_datetime := (p_session_date::TEXT || ' ' || p_session_time::TEXT)::TIMESTAMP 
                        AT TIME ZONE 'America/Mexico_City';
  
  -- Calcular cuándo enviar el recordatorio
  IF p_reminder_type = 'reminder_24h' THEN
    v_scheduled_for := v_session_datetime - INTERVAL '24 hours';
    v_priority := 4;
    v_expires_offset := INTERVAL '1 hour';
    v_hours_before := 24;
  ELSIF p_reminder_type = 'reminder_1h' THEN
    v_scheduled_for := v_session_datetime - INTERVAL '1 hour';
    v_priority := 5;
    v_expires_offset := INTERVAL '30 minutes';
    v_hours_before := 1;
  ELSIF p_reminder_type = 'checkin_reminder' THEN
    v_scheduled_for := v_session_datetime - INTERVAL '5 minutes';
    v_priority := 5;
    v_expires_offset := INTERVAL '15 minutes';
    v_hours_before := 0;
  END IF;
  
  -- Solo programar si es en el futuro
  IF v_scheduled_for <= NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reminder time has already passed',
      'scheduled_for', v_scheduled_for::TEXT,
      'current_time', NOW()::TEXT
    );
  END IF;
  
  INSERT INTO notification_schedules (
    booking_id,
    user_id,
    notification_type,
    scheduled_for,
    status,
    priority,
    retry_count,
    max_retries,
    message_payload,
    push_token,
    delivery_channels,
    expires_at,
    session_data
  ) VALUES (
    p_booking_id,
    p_user_id,
    p_reminder_type,
    v_scheduled_for,
    'scheduled',
    v_priority,
    0,
    3,
    p_payload,
    p_token,
    CASE 
      WHEN p_token IS NOT NULL AND p_token != '' 
      THEN ARRAY['database', 'push']::TEXT[] 
      ELSE ARRAY['database']::TEXT[]
    END,
    v_session_datetime + v_expires_offset,
    jsonb_build_object(
      'session_date', p_session_date::TEXT,
      'session_time', p_session_time::TEXT,
      'session_datetime_mexico', (v_session_datetime AT TIME ZONE 'America/Mexico_City')::TEXT,
      'reminder_time_mexico', (v_scheduled_for AT TIME ZONE 'America/Mexico_City')::TEXT,
      'hours_before', v_hours_before
    )
  ) RETURNING id INTO v_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'notification_id', v_id,
    'scheduled_for', v_scheduled_for::TEXT,
    'scheduled_for_mexico', (v_scheduled_for AT TIME ZONE 'America/Mexico_City')::TEXT,
    'type', p_reminder_type
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- 6. Drop the old schedule_all_booking_notifications signature first
DROP FUNCTION IF EXISTS public.schedule_all_booking_notifications(uuid, uuid, date, time without time zone, jsonb, jsonb, jsonb, text, jsonb);

-- 7. Recreate schedule_all_booking_notifications to include checkin_reminder_payload
CREATE OR REPLACE FUNCTION public.schedule_all_booking_notifications(
  p_booking_id uuid,
  p_user_id uuid,
  p_session_date date,
  p_session_time time without time zone,
  p_confirmation_payload jsonb,
  p_reminder_24h_payload jsonb,
  p_reminder_1h_payload jsonb,
  p_token text DEFAULT NULL::text,
  p_preferences jsonb DEFAULT '{}'::jsonb,
  p_checkin_reminder_payload jsonb DEFAULT NULL::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_results JSONB[];
  v_result JSONB;
  v_total_scheduled INT := 0;
BEGIN
  -- 1. Programar confirmación si está habilitada
  IF COALESCE((p_preferences->>'booking_confirmation_enabled')::BOOLEAN, true) THEN
    v_result := schedule_confirmation_notification(
      p_booking_id,
      p_user_id,
      p_confirmation_payload,
      p_token
    );
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_results := array_append(v_results, v_result);
      v_total_scheduled := v_total_scheduled + 1;
    END IF;
  END IF;
  
  -- 2. Programar recordatorio 24h si está habilitado
  IF COALESCE((p_preferences->>'reminder_24h_enabled')::BOOLEAN, true) THEN
    v_result := schedule_reminder_notification(
      p_booking_id,
      p_user_id,
      p_session_date,
      p_session_time,
      'reminder_24h',
      p_reminder_24h_payload,
      p_token
    );
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_results := array_append(v_results, v_result);
      v_total_scheduled := v_total_scheduled + 1;
    END IF;
  END IF;
  
  -- 3. Programar recordatorio 1h si está habilitado
  IF COALESCE((p_preferences->>'reminder_1h_enabled')::BOOLEAN, true) THEN
    v_result := schedule_reminder_notification(
      p_booking_id,
      p_user_id,
      p_session_date,
      p_session_time,
      'reminder_1h',
      p_reminder_1h_payload,
      p_token
    );
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_results := array_append(v_results, v_result);
      v_total_scheduled := v_total_scheduled + 1;
    END IF;
  END IF;
  
  -- 4. Programar recordatorio Check-In 5 minutos antes si está habilitado y el payload no es nulo
  IF COALESCE((p_preferences->>'checkin_reminder_enabled')::BOOLEAN, true) AND p_checkin_reminder_payload IS NOT NULL THEN
    v_result := schedule_reminder_notification(
      p_booking_id,
      p_user_id,
      p_session_date,
      p_session_time,
      'checkin_reminder',
      p_checkin_reminder_payload,
      p_token
    );
    
    IF (v_result->>'success')::BOOLEAN THEN
      v_results := array_append(v_results, v_result);
      v_total_scheduled := v_total_scheduled + 1;
    END IF;
  END IF;
  
  -- Retornar resumen
  RETURN jsonb_build_object(
    'success', true,
    'count', v_total_scheduled,
    'server_time', NOW()::TEXT,
    'server_time_mexico', (NOW() AT TIME ZONE 'America/Mexico_City')::TEXT,
    'notifications', array_to_json(v_results)::JSONB
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'count', 0,
    'error', SQLERRM
  );
END;
$function$;
