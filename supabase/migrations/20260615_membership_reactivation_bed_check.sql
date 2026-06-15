-- ============================================================================
-- MIGRATION: Revalidar camas al REACTIVAR una membresía (salir de pausa)
-- Date: 2026-06-15
-- Description:
--   Complementa 20260615_membership_bed_conflict_with_bookings.sql.
--
--   El trigger trg_validate_membership_schedule_beds protege INSERT/UPDATE de
--   membership_schedules, pero NO se dispara cuando se reactiva la MEMBRESÍA
--   completa (memberships.is_active de false -> true), porque ese cambio ocurre
--   en otra tabla y no toca las filas de membership_schedules.
--
--   Escenario a cubrir:
--     1. Se pausa una membresía -> sus camas quedan libres para reservas.
--     2. Una clienta reserva una de esas camas en ese horario.
--     3. Se reactiva la membresía -> SIN esta validación, volvería a ocupar la
--        cama ya reservada (doble ocupación).
--
--   Este trigger revisa, en la transición a activa, TODOS los horarios activos
--   de la membresía contra otras membresías activas y reservas activas futuras
--   (excluyendo las reservas del propio titular). Si alguna cama choca, bloquea
--   la reactivación e informa el horario y las camas en conflicto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_membership_reactivation_beds()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_today          date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  r                record;
  occupied_beds    integer[];
  conflicting_beds integer[];
BEGIN
  -- Solo validar en la transición pausada/inactiva -> ACTIVA
  IF NOT (NEW.is_active = true AND COALESCE(OLD.is_active, false) = false) THEN
    RETURN NEW;
  END IF;

  -- Revisar cada horario ACTIVO de esta membresía
  FOR r IN
    SELECT ms.schedule_slot_id, ms.bed_numbers,
           ss.day_of_week, ss.start_time, ss.day_name
    FROM membership_schedules ms
    JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
    WHERE ms.membership_id = NEW.id
      AND ms.is_active = true
  LOOP
    SELECT ARRAY(
      -- Otras membresías activas en este slot
      SELECT unnest(ms2.bed_numbers)
      FROM membership_schedules ms2
      JOIN memberships m2 ON m2.id = ms2.membership_id
      WHERE ms2.schedule_slot_id = r.schedule_slot_id
        AND ms2.is_active = true
        AND m2.is_active = true
        AND ms2.membership_id != NEW.id

      UNION ALL

      -- Reservas activas futuras en este día de la semana + hora,
      -- excluyendo las del propio titular de la membresía.
      SELECT unnest(b.bed_numbers)
      FROM bookings b
      WHERE b.status = 'active'
        AND b.session_date >= v_today
        AND b.session_time = r.start_time
        AND EXTRACT(ISODOW FROM b.session_date)::integer = r.day_of_week
        AND (NEW.user_id IS NULL OR b.user_id IS DISTINCT FROM NEW.user_id)
    ) INTO occupied_beds;

    SELECT ARRAY(
      SELECT unnest(r.bed_numbers)
      INTERSECT
      SELECT unnest(occupied_beds)
    ) INTO conflicting_beds;

    IF array_length(conflicting_beds, 1) > 0 THEN
      RAISE EXCEPTION 'No se puede reactivar: las camas % del horario % ya están ocupadas por una reserva o membresía',
        array_to_string(conflicting_beds, ', '),
        r.day_name || ' ' || to_char(r.start_time, 'HH24:MI')
        USING ERRCODE = 'unique_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_membership_reactivation_beds ON public.memberships;
CREATE TRIGGER trg_validate_membership_reactivation_beds
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_membership_reactivation_beds();
