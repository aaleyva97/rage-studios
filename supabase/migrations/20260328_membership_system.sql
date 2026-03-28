-- ============================================================================
-- MIGRATION: Membership System for VIP Clients
-- Date: 2026-03-28
-- Description: Adds recurring membership functionality allowing admin to assign
--              specific beds in specific schedule slots to VIP clients.
-- ============================================================================

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- Table: memberships
-- Stores VIP client memberships (can be linked to a registered user or not)
CREATE TABLE public.memberships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

COMMENT ON TABLE public.memberships IS 'Membresías VIP: clientes con acceso recurrente a horarios específicos';
COMMENT ON COLUMN public.memberships.client_name IS 'Nombre del cliente (puede no ser usuario del sistema)';
COMMENT ON COLUMN public.memberships.user_id IS 'FK a auth.users si el cliente es usuario registrado (nullable)';

-- Table: membership_schedules
-- Links a membership to specific schedule slots with specific beds
CREATE TABLE public.membership_schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  schedule_slot_id uuid NOT NULL REFERENCES public.schedule_slots(id) ON DELETE CASCADE,
  bed_numbers integer[] NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  CONSTRAINT unique_membership_schedule UNIQUE (membership_id, schedule_slot_id)
);

COMMENT ON TABLE public.membership_schedules IS 'Horarios asignados a cada membresía con camas específicas';
COMMENT ON COLUMN public.membership_schedules.bed_numbers IS 'Camas asignadas en este horario (ej: {3, 7})';

-- ============================================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_schedules ENABLE ROW LEVEL SECURITY;

-- memberships: Read for all authenticated (needed for booking availability checks)
CREATE POLICY "Enable read access for all users" ON public.memberships
  FOR SELECT USING (true);

-- memberships: Write for admins only
CREATE POLICY "Enable insert/update/delete for admins" ON public.memberships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- membership_schedules: Read for all authenticated
CREATE POLICY "Enable read access for all users" ON public.membership_schedules
  FOR SELECT USING (true);

-- membership_schedules: Write for admins only
CREATE POLICY "Enable insert/update/delete for admins" ON public.membership_schedules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ============================================================================
-- 3. MODIFY EXISTING FUNCTIONS (CRITICAL - affects booking availability)
-- ============================================================================

-- 3a. get_occupied_beds_public: Now includes membership beds
-- USED BY: booking-dialog step 3 (bed map) + create_booking_atomic_v2 (atomic validation)
CREATE OR REPLACE FUNCTION public.get_occupied_beds_public(
  p_session_date date,
  p_session_time time without time zone
)
RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  occupied_beds integer[];
BEGIN
  SELECT ARRAY(
    -- Beds from regular bookings (existing logic)
    SELECT unnest(b.bed_numbers)
    FROM bookings b
    WHERE b.session_date = p_session_date
      AND b.session_time = p_session_time
      AND b.status = 'active'

    UNION ALL

    -- Beds from active memberships for this day_of_week and time
    SELECT unnest(ms.bed_numbers)
    FROM membership_schedules ms
    JOIN memberships m ON m.id = ms.membership_id
    JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
    WHERE m.is_active = true
      AND ms.is_active = true
      AND ss.is_active = true
      AND ss.day_of_week = EXTRACT(ISODOW FROM p_session_date)::integer
      AND ss.start_time = p_session_time
  ) INTO occupied_beds;

  RETURN COALESCE(occupied_beds, ARRAY[]::integer[]);
END;
$function$;

-- 3b. validate_bed_availability trigger: Now checks membership beds too
-- USED BY: trigger BEFORE INSERT on bookings (last line of defense)
CREATE OR REPLACE FUNCTION public.validate_bed_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    occupied_beds integer[];
    conflicting_beds integer[];
BEGIN
    -- Only validate on INSERT of active bookings
    IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
        -- Get occupied beds from bookings + memberships
        SELECT ARRAY(
            -- Regular bookings
            SELECT unnest(b.bed_numbers)
            FROM bookings b
            WHERE b.session_date = NEW.session_date
                AND b.session_time = NEW.session_time
                AND b.status = 'active'
                AND b.id != COALESCE(NEW.id, gen_random_uuid())

            UNION ALL

            -- Membership beds
            SELECT unnest(ms.bed_numbers)
            FROM membership_schedules ms
            JOIN memberships m ON m.id = ms.membership_id
            JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
            WHERE m.is_active = true
              AND ms.is_active = true
              AND ss.is_active = true
              AND ss.day_of_week = EXTRACT(ISODOW FROM NEW.session_date)::integer
              AND ss.start_time = NEW.session_time
        ) INTO occupied_beds;

        -- Check for conflicts
        SELECT ARRAY(
            SELECT unnest(NEW.bed_numbers)
            INTERSECT
            SELECT unnest(occupied_beds)
        ) INTO conflicting_beds;

        -- Reject if conflicting
        IF array_length(conflicting_beds, 1) > 0 THEN
            RAISE EXCEPTION 'Las siguientes camas ya están ocupadas: %',
                array_to_string(conflicting_beds, ', ')
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ============================================================================
-- 4. NEW FUNCTIONS
-- ============================================================================

-- 4a. Get all occupied beds for an entire date (bookings + memberships)
-- USED BY: booking.service.ts getAvailableSlots() - replaces direct bookings query
CREATE OR REPLACE FUNCTION public.get_occupied_beds_for_date(p_session_date date)
RETURNS TABLE(session_time time, bed_numbers integer[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
    -- Regular bookings for this date
    SELECT b.session_time, b.bed_numbers
    FROM bookings b
    WHERE b.session_date = p_session_date
      AND b.status = 'active'

    UNION ALL

    -- Membership beds for this day of week
    SELECT ss.start_time AS session_time, ms.bed_numbers
    FROM membership_schedules ms
    JOIN memberships m ON m.id = ms.membership_id
    JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
    WHERE m.is_active = true
      AND ms.is_active = true
      AND ss.is_active = true
      AND ss.day_of_week = EXTRACT(ISODOW FROM p_session_date)::integer;
END;
$function$;

-- 4b. Validate that beds are available for a membership schedule assignment
-- Checks against OTHER memberships only (not bookings, since bookings are per-date)
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
  conflicting_beds integer[];
BEGIN
  -- Get beds already assigned to other active memberships for this schedule slot
  SELECT ARRAY(
    SELECT unnest(ms.bed_numbers)
    FROM membership_schedules ms
    JOIN memberships m ON m.id = ms.membership_id
    WHERE ms.schedule_slot_id = p_schedule_slot_id
      AND ms.is_active = true
      AND m.is_active = true
      AND (p_exclude_membership_id IS NULL OR ms.membership_id != p_exclude_membership_id)
  ) INTO conflicting_beds;

  -- Check intersection with requested beds
  SELECT ARRAY(
    SELECT unnest(p_bed_numbers)
    INTERSECT
    SELECT unnest(COALESCE(conflicting_beds, ARRAY[]::integer[]))
  ) INTO conflicting_beds;

  IF array_length(conflicting_beds, 1) > 0 THEN
    RETURN jsonb_build_object(
      'available', false,
      'conflicting_beds', to_jsonb(conflicting_beds),
      'message', 'Las camas ' || array_to_string(conflicting_beds, ', ') || ' ya están asignadas a otra membresía en este horario'
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'conflicting_beds', '[]'::jsonb
  );
END;
$function$;

-- 4c. Get all memberships with their schedules (for admin listing)
CREATE OR REPLACE FUNCTION public.get_memberships_with_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(membership_row ORDER BY membership_row->>'client_name')
    FROM (
      SELECT jsonb_build_object(
        'id', m.id,
        'client_name', m.client_name,
        'user_id', m.user_id,
        'is_active', m.is_active,
        'notes', m.notes,
        'created_by', m.created_by,
        'created_at', m.created_at,
        'updated_at', m.updated_at,
        'user_full_name', p.full_name,
        'schedules', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', ms.id,
              'schedule_slot_id', ms.schedule_slot_id,
              'bed_numbers', to_jsonb(ms.bed_numbers),
              'is_active', ms.is_active,
              'day_of_week', ss.day_of_week,
              'day_name', ss.day_name,
              'start_time', ss.start_time,
              'end_time', ss.end_time,
              'slot_is_active', ss.is_active
            ) ORDER BY ss.day_of_week, ss.start_time
          )
          FROM membership_schedules ms
          JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
          WHERE ms.membership_id = m.id
        ), '[]'::jsonb)
      ) AS membership_row
      FROM memberships m
      LEFT JOIN profiles p ON p.id = m.user_id
    ) sub
  ), '[]'::jsonb);
END;
$function$;

-- 4d. Get membership reservations for a date range (for admin-reservas view)
CREATE OR REPLACE FUNCTION public.get_membership_reservations_for_dates(
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_data)
    FROM (
      SELECT jsonb_build_object(
        'membership_id', m.id,
        'client_name', m.client_name,
        'user_id', m.user_id,
        'user_full_name', p.full_name,
        'schedule_slot_id', ms.schedule_slot_id,
        'bed_numbers', to_jsonb(ms.bed_numbers),
        'total_attendees', jsonb_array_length(to_jsonb(ms.bed_numbers)),
        'day_of_week', ss.day_of_week,
        'day_name', ss.day_name,
        'start_time', ss.start_time,
        'end_time', ss.end_time,
        'coach_names', COALESCE((
          SELECT string_agg(c.name, '/' ORDER BY ssc.is_primary DESC)
          FROM schedule_slot_coaches ssc
          JOIN coaches c ON c.id = ssc.coach_id
          WHERE ssc.schedule_slot_id = ss.id
        ), '')
      ) AS row_data
      FROM membership_schedules ms
      JOIN memberships m ON m.id = ms.membership_id
      JOIN schedule_slots ss ON ss.id = ms.schedule_slot_id
      LEFT JOIN profiles p ON p.id = m.user_id
      WHERE m.is_active = true
        AND ms.is_active = true
        AND ss.is_active = true
        -- Filter: only days that fall within the date range
        AND EXISTS (
          SELECT 1 FROM generate_series(p_start_date, p_end_date, '1 day'::interval) d
          WHERE EXTRACT(ISODOW FROM d)::integer = ss.day_of_week
        )
      ORDER BY ss.day_of_week, ss.start_time, m.client_name
    ) sub
  ), '[]'::jsonb);
END;
$function$;
