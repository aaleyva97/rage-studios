-- ============================================================================
-- MIGRATION: Walk-in — el trigger de camas también respeta el CHECK-IN
-- Date: 2026-06-27
-- Description:
--   La migración 20260621 actualizó admin_register_walkin para que una cama
--   solo se considere ocupada si alguien hizo check-in (attendance_status =
--   'attended'). Sin embargo, el trigger BEFORE INSERT validate_bed_availability
--   seguía bloqueando la cama por CUALQUIER reserva activa (no-show incluido).
--   Resultado: la RPC pasaba su validación, pero el INSERT disparaba el trigger
--   y devolvía "No se pudo registrar el walk-in: Las siguientes camas ya están
--   ocupadas: N".
--
--   Fix: cuando el INSERT proviene de recepción (check_in_source = 'walk_in'),
--   el trigger solo cuenta como ocupadas las camas con check-in confirmado,
--   igual que la RPC. Las reservas normales (página de reservas) y las
--   membresías siguen validándose exactamente igual que antes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_bed_availability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
    occupied_beds integer[];
    conflicting_beds integer[];
begin
    -- Solo validar en INSERT de reservas activas que NO sean materialización
    -- de check-in de membresía.
    if tg_op = 'INSERT'
       and new.status = 'active'
       and coalesce(new.check_in_source, '') <> 'qr_membership' then

        if coalesce(new.check_in_source, '') = 'walk_in' then
            -- Walk-in en recepción: una reserva sin check-in (no-show) NO bloquea.
            -- Solo bloquean las camas con check-in confirmado (attended). Esto
            -- mantiene la paridad con admin_register_walkin.
            select array(
                select unnest(b.bed_numbers)
                from bookings b
                where b.session_date = new.session_date
                    and b.session_time = new.session_time
                    and b.status = 'active'
                    and b.attendance_status = 'attended'
                    and b.id != coalesce(new.id, gen_random_uuid())
            ) into occupied_beds;
        else
            -- Reservas regulares (página de reservas): cuentan todas las reservas
            -- activas y las camas comprometidas por membresías en ese horario.
            select array(
                -- Reservas regulares
                select unnest(b.bed_numbers)
                from bookings b
                where b.session_date = new.session_date
                    and b.session_time = new.session_time
                    and b.status = 'active'
                    and b.id != coalesce(new.id, gen_random_uuid())

                union all

                -- Camas de membresías
                select unnest(ms.bed_numbers)
                from membership_schedules ms
                join memberships m on m.id = ms.membership_id
                join schedule_slots ss on ss.id = ms.schedule_slot_id
                where m.is_active = true
                  and ms.is_active = true
                  and ss.is_active = true
                  and ss.day_of_week = extract(isodow from new.session_date)::integer
                  and ss.start_time = new.session_time
            ) into occupied_beds;
        end if;

        select array(
            select unnest(new.bed_numbers)
            intersect
            select unnest(occupied_beds)
        ) into conflicting_beds;

        if array_length(conflicting_beds, 1) > 0 then
            raise exception 'Las siguientes camas ya están ocupadas: %',
                array_to_string(conflicting_beds, ', ')
                using errcode = 'unique_violation';
        end if;
    end if;

    return new;
end;
$function$;
