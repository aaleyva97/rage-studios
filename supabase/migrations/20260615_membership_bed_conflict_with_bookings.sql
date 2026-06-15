-- ============================================================================
-- MIGRATION: Las membresías no pueden ocupar camas ya reservadas
-- Date: 2026-06-15
-- Description:
--   Cierra una validación ASIMÉTRICA que permitía doble ocupación de cama:
--     - Al crear una RESERVA sí se valida contra membresías (get_occupied_beds_public
--       + trigger validate_bed_availability).
--     - Al asignar/editar una MEMBRESÍA NO se validaba contra reservas: la función
--       validate_membership_beds solo miraba otras membresías, y no existía ningún
--       trigger en membership_schedules.
--   Resultado real (13/06/2026, LOVATA, 10:00, cama 3): una reserva normal y una
--   membresía quedaron con la misma cama porque la membresía se asignó 9 días
--   después de la reserva sin detectar el conflicto.
--
--   Esta migración:
--     1. Extiende validate_membership_beds para considerar también las RESERVAS
--        activas futuras que caen en el mismo día de la semana + hora del slot.
--        (Esto a su vez hace que el selector de camas del admin las deshabilite,
--         porque la UI ya pinta como ocupadas las camas que devuelve esta función.)
--     2. Agrega un trigger BEFORE INSERT/UPDATE en membership_schedules como
--        última línea de defensa (espejo del que ya protege bookings).
--
--   Política: las reservas existentes NO se tocan. Si una cama ya está ocupada
--   (por reserva o por otra membresía) en ese horario, simplemente se bloquea la
--   asignación de la membresía y se informa qué camas chocan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. validate_membership_beds: ahora también bloquea contra reservas futuras
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_membership_beds(
  p_schedule_slot_id uuid,
  p_bed_numbers integer[],
  p_exclude_membership_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_day_of_week   integer;
  v_start_time    time;
  v_exclude_user  uuid;
  v_today         date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  occupied_beds   integer[];
  conflicting_beds integer[];
BEGIN
  -- Datos del slot (día de la semana ISODOW + hora de inicio)
  SELECT ss.day_of_week, ss.start_time
    INTO v_day_of_week, v_start_time
  FROM schedule_slots ss
  WHERE ss.id = p_schedule_slot_id;

  IF v_day_of_week IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'conflicting_beds', '[]'::jsonb,
      'message', 'Horario no encontrado'
    );
  END IF;

  -- Usuario de la membresía que estamos editando: sus propias reservas NO
  -- cuentan como conflicto (es la misma persona).
  IF p_exclude_membership_id IS NOT NULL THEN
    SELECT m.user_id INTO v_exclude_user
    FROM memberships m
    WHERE m.id = p_exclude_membership_id;
  END IF;

  SELECT ARRAY(
    -- Camas de OTRAS membresías activas en este slot
    SELECT unnest(ms.bed_numbers)
    FROM membership_schedules ms
    JOIN memberships m ON m.id = ms.membership_id
    WHERE ms.schedule_slot_id = p_schedule_slot_id
      AND ms.is_active = true
      AND m.is_active = true
      AND (p_exclude_membership_id IS NULL OR ms.membership_id != p_exclude_membership_id)

    UNION ALL

    -- Camas de RESERVAS activas futuras que caen en este día de la semana + hora
    SELECT unnest(b.bed_numbers)
    FROM bookings b
    WHERE b.status = 'active'
      AND b.session_date >= v_today
      AND b.session_time = v_start_time
      AND EXTRACT(ISODOW FROM b.session_date)::integer = v_day_of_week
      AND (v_exclude_user IS NULL OR b.user_id IS DISTINCT FROM v_exclude_user)
  ) INTO occupied_beds;

  -- Intersección con las camas solicitadas
  SELECT ARRAY(
    SELECT DISTINCT unnest(p_bed_numbers)
    INTERSECT
    SELECT unnest(COALESCE(occupied_beds, ARRAY[]::integer[]))
  ) INTO conflicting_beds;

  IF array_length(conflicting_beds, 1) > 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'conflicting_beds', to_jsonb(conflicting_beds),
      'message', 'Las camas ' || array_to_string(conflicting_beds, ', ') ||
                 ' ya están ocupadas por una reserva o membresía en este horario'
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'conflicting_beds', '[]'::jsonb
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. Trigger en membership_schedules: última línea de defensa
--    (espejo de validate_bed_availability sobre bookings)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_membership_schedule_beds()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_day_of_week    integer;
  v_start_time     time;
  v_member_active  boolean;
  v_user           uuid;
  v_today          date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  occupied_beds    integer[];
  conflicting_beds integer[];
BEGIN
  -- Solo validar cuando la fila quede ACTIVA (una pausada no reserva camas)
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT m.is_active, m.user_id
    INTO v_member_active, v_user
  FROM memberships m
  WHERE m.id = NEW.membership_id;

  -- Si la membresía está pausada, sus camas no están reservadas: no validar
  IF v_member_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT ss.day_of_week, ss.start_time
    INTO v_day_of_week, v_start_time
  FROM schedule_slots ss
  WHERE ss.id = NEW.schedule_slot_id;

  IF v_day_of_week IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(
    -- Otras membresías activas en este slot
    SELECT unnest(ms.bed_numbers)
    FROM membership_schedules ms
    JOIN memberships m ON m.id = ms.membership_id
    WHERE ms.schedule_slot_id = NEW.schedule_slot_id
      AND ms.is_active = true
      AND m.is_active = true
      AND ms.id != COALESCE(NEW.id, gen_random_uuid())

    UNION ALL

    -- Reservas activas futuras en este día de la semana + hora,
    -- excluyendo las del propio titular de la membresía.
    SELECT unnest(b.bed_numbers)
    FROM bookings b
    WHERE b.status = 'active'
      AND b.session_date >= v_today
      AND b.session_time = v_start_time
      AND EXTRACT(ISODOW FROM b.session_date)::integer = v_day_of_week
      AND (v_user IS NULL OR b.user_id IS DISTINCT FROM v_user)
  ) INTO occupied_beds;

  SELECT ARRAY(
    SELECT unnest(NEW.bed_numbers)
    INTERSECT
    SELECT unnest(occupied_beds)
  ) INTO conflicting_beds;

  IF array_length(conflicting_beds, 1) > 0 THEN
    RAISE EXCEPTION 'Las camas % ya están ocupadas por una reserva o membresía en este horario',
      array_to_string(conflicting_beds, ', ')
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_membership_schedule_beds ON public.membership_schedules;
CREATE TRIGGER trg_validate_membership_schedule_beds
  BEFORE INSERT OR UPDATE ON public.membership_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_membership_schedule_beds();
