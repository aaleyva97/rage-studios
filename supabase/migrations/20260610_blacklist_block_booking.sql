-- Blacklist enforcement at the booking chokepoint.
-- create_booking_atomic_v2 is the single entry point used by every booking flow,
-- so a blacklisted user is rejected here regardless of any client-side bypass.
-- The error message is intentionally neutral: it must NOT reveal that the account
-- is blacklisted (business requirement).
CREATE OR REPLACE FUNCTION public.create_booking_atomic_v2(
    p_user_id uuid,
    p_session_date date,
    p_session_time time without time zone,
    p_bed_numbers integer[],
    p_attendees text[] DEFAULT ARRAY[]::text[],
    p_total_attendees integer DEFAULT 1,
    p_credits_used integer DEFAULT 1,
    p_credit_batch_id uuid DEFAULT NULL::uuid,
    p_coach_name text DEFAULT 'Coach'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    occupied_beds integer[];
    conflicting_beds integer[];
    booking_record bookings%ROWTYPE;
  BEGIN
    -- 🚫 Bloqueo silencioso para usuarios en lista de bloqueo.
    -- Mensaje neutral: no se revela el motivo real.
    IF EXISTS (SELECT 1 FROM user_blacklist WHERE user_id = p_user_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Por el momento no es posible completar esta operación.',
        'error_code', 'ACCOUNT_RESTRICTED'
      );
    END IF;

    -- Usar función SECURITY DEFINER para obtener TODAS las camas ocupadas
    SELECT get_occupied_beds_public(p_session_date, p_session_time) INTO occupied_beds;

    -- Verificar conflictos
    SELECT ARRAY(
      SELECT unnest(p_bed_numbers)
      INTERSECT
      SELECT unnest(occupied_beds)
    ) INTO conflicting_beds;

    -- Si hay conflictos, retornar error detallado
    IF array_length(conflicting_beds, 1) > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Las siguientes camas ya están ocupadas: ' || array_to_string(conflicting_beds, ', '),
        'conflicting_beds', conflicting_beds,
        'occupied_beds', occupied_beds
      );
    END IF;

    -- Crear reserva atómica
    INSERT INTO bookings (
      user_id, session_date, session_time, bed_numbers,
      attendees, total_attendees, credits_used,
      credit_batch_id, coach_name, status
    ) VALUES (
      p_user_id, p_session_date, p_session_time, p_bed_numbers,
      p_attendees, p_total_attendees, p_credits_used,
      p_credit_batch_id, p_coach_name, 'active'
    ) RETURNING * INTO booking_record;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', booking_record.id,
      'beds_reserved', p_bed_numbers,
      'message', 'Reserva creada exitosamente'
    );

  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Error: ' || SQLERRM,
        'error_code', SQLSTATE
      );
  END;
  $function$;
