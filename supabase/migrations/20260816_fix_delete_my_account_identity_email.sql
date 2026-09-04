-- ============================================================================
-- MIGRATION: delete_my_account() — no se puede escribir en auth.identities.email
-- Date: 2026-08-16
-- Description:
--   delete_my_account() fallaba SIEMPRE, en la primera llamada real. La app
--   pintaba "No pudimos contactar al servidor. Tu cuenta sigue activa", que
--   suena a problema de red y no lo era: era SQL inválido.
--
--   La causa, en una línea. Esta era la sentencia (bloque 2.3 de
--   20260808_account_deletion.sql):
--
--     UPDATE auth.identities
--        SET email         = v_tombstone,   -- ← imposible
--            identity_data = jsonb_build_object('sub', …, 'email', v_tombstone),
--            updated_at    = now()
--      WHERE user_id = v_uid;
--
--   auth.identities.email NO es una columna normal. GoTrue la declara así:
--
--     email  text  GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED
--
--   Verificado contra producción (information_schema.columns.is_generated =
--   'ALWAYS', pg_attribute.attgenerated = 's'). PostgreSQL prohíbe asignar a
--   una columna generada: lanza 428C9 "column \"email\" can only be updated to
--   DEFAULT". No hay ajuste ni permiso que lo permita — es del lenguaje.
--
--   Y como la función no lleva bloque EXCEPTION a propósito —queremos que un
--   fallo revierta la anonimización entera, no que la deje a medias—, la
--   excepción subía hasta PostgREST y el cliente la recogía en su catch
--   genérico. De ahí el mensaje de red.
--
--   Que sea una sola transacción es lo que salvó los datos: cada intento
--   revirtió por completo. No hay cuentas medio anonimizadas en producción;
--   comprobado sobre las filas de prueba, que conservan deleted_at NULL y su
--   full_name original.
--
-- Arreglo:
--   Se deja de escribir `email` y se escribe sólo `identity_data`. La columna
--   generada se recalcula sola a partir de ese jsonb, así que el estado final
--   es EXACTAMENTE el que la migración anterior pretendía: la identidad acaba
--   con el correo tombstone, sólo que derivado en vez de asignado.
--
--   v_tombstone ya se construye en minúsculas (uuid en hex + literal), así que
--   el lower() de la expresión generada no lo altera.
--
--   Nada más cambia. El resto del cuerpo se reproduce verbatim porque
--   CREATE OR REPLACE FUNCTION exige la función entera; el único diff frente a
--   20260808_account_deletion.sql es la línea eliminada.
--
-- Barrido de seguridad:
--   En todo el esquema auth sólo hay dos columnas generadas: identities.email
--   (la que rompía) y users.confirmed_at, que esta función no toca. Las demás
--   columnas que escribe —bookings.cancelled_at, waitlist_entries.cancelled_at,
--   memberships.client_name, profiles.deleted_at, y las de auth.users— existen
--   todas y son normales. O sea que no hay un segundo fallo esperando detrás.
--
-- Impacto en clientes:
--   NINGUNO. No hace falta build nuevo de la app ni desplegar la web: el
--   contrato de la función (jsonb con status_code) no cambia.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- Todo va calificado con su esquema aquí dentro, así que el search_path sólo
-- existe para no heredar el de quien llama. Sin pg_temp: es SECURITY DEFINER.
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  -- No recibe parámetros a propósito: el sujeto es siempre quien llama, así
  -- que no hay ningún id que falsificar desde el cliente.
  v_uid                 uuid := auth.uid();
  v_role                text;
  v_deleted_at          timestamptz;
  v_tombstone           text;
  -- Misma convención que close_past_bookings(): el negocio está en Monterrey
  -- y session_date/session_time son hora local, no instantes.
  v_today               date := (now() AT TIME ZONE 'America/Monterrey')::date;
  v_now_time            time := (now() AT TIME ZONE 'America/Monterrey')::time;
  v_cancelled_bookings  integer := 0;
  v_cancelled_waitlist  integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'status_code', 'NOT_AUTHENTICATED',
      'message', 'Tu sesión expiró. Vuelve a iniciar sesión e inténtalo otra vez.'
    );
  END IF;

  -- FOR UPDATE serializa dos toques al botón: el segundo espera al primero y
  -- entonces ve deleted_at escrito, y sale por ALREADY_DELETED.
  -- Calificado con alias: `role` es palabra clave de Postgres y sin cualificar
  -- depende de que el parser la trate como columna.
  SELECT p.role, p.deleted_at
    INTO v_role, v_deleted_at
    FROM public.profiles p
   WHERE p.id = v_uid
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status_code', 'PROFILE_NOT_FOUND',
      'message', 'No encontramos tu perfil. Contacta al estudio.'
    );
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status_code', 'ALREADY_DELETED',
      'message', 'Esta cuenta ya fue eliminada.'
    );
  END IF;

  -- Un admin no puede darse de baja desde la app. No es una regla de producto:
  -- es que su fila está referenciada por gift_cards.created_by (RESTRICT) y por
  -- otras cinco columnas NO ACTION, y además puede ser dueño de objetos en
  -- Storage —los 95 objetos de hoy pertenecen a 3 admins—, cosa que Supabase
  -- no deja borrar. Mejor decirlo que fallar a medias.
  IF v_role = 'admin' THEN
    RETURN jsonb_build_object(
      'status_code', 'ADMIN_NOT_ALLOWED',
      'message', 'Las cuentas de administración no se eliminan desde la app. Contacta al estudio.'
    );
  END IF;

  -- Único en toda la tabla gracias al uuid, que es lo que exige el índice
  -- users_email_partial_key. El TLD .invalid está reservado por la RFC 2606:
  -- nadie puede recibir correo ahí.
  v_tombstone := 'deleted-' || replace(v_uid::text, '-', '') || '@cuenta-eliminada.invalid';

  -- --------------------------------------------------------------------------
  -- 2.1 Soltar los compromisos futuros
  -- --------------------------------------------------------------------------
  -- LA LISTA DE ESPERA VA PRIMERO, Y EL ORDEN NO ES ESTÉTICO.
  --
  -- Cancelar una reserva dispara trg_bookings_promote_waitlist, que promueve a
  -- la siguiente en cola de ESA misma sesión: le crea una reserva y le cobra
  -- créditos. Normalmente la persona que se da de baja no puede estar en la
  -- cola de una clase que ya tiene reservada —enroll_in_waitlist rechaza el
  -- caso 'ya-reservado'—, pero sí puede llegar ahí por el camino largo:
  -- apuntarse a la lista, que se libere una cama, y reservarla a mano antes de
  -- que corra la promoción. Con las dos filas vivas, cancelar su reserva la
  -- promovería a sí misma y la cuenta acabaría de eliminarse con una reserva
  -- activa recién creada. Anulando la cola primero, no queda a quién promover.
  UPDATE public.waitlist_entries
     SET status       = 'cancelled',
         cancelled_at = now()
   WHERE user_id = v_uid
     AND status = 'waiting';
  GET DIAGNOSTICS v_cancelled_waitlist = ROW_COUNT;

  -- Una reserva viva de alguien que ya no existe deja un reformer ocupado para
  -- una clase a la que nadie va a ir. Cancelarla dispara dos triggers que
  -- juegan a favor: trg_bookings_promote_waitlist promueve a la siguiente de
  -- la lista de espera, y trigger_cancel_obsolete_notifications apaga sus
  -- recordatorios pendientes.
  --
  -- "Futura" se decide por reloj, no por status: close_past_bookings() sólo
  -- corre a la 01:00, así que la clase de las 06:00 de hoy sigue 'active' toda
  -- la jornada. Filtrar por status arrasaría con una clase de esta mañana a la
  -- que sí fue. Por eso también se exige attendance_status IS NULL: si ya
  -- pasó por recepción, esa fila es historia y no se toca.
  UPDATE public.bookings
     SET status            = 'cancelled',
         cancelled_at      = now(),
         attendance_status = NULL,
         updated_at        = now()
   WHERE user_id = v_uid
     AND status = 'active'
     AND attendance_status IS NULL
     AND (
           session_date > v_today
        OR (session_date = v_today AND session_time > v_now_time)
         );
  GET DIAGNOSTICS v_cancelled_bookings = ROW_COUNT;

  -- --------------------------------------------------------------------------
  -- 2.2 Borrar los datos personales, conservando la forma de los datos
  -- --------------------------------------------------------------------------
  -- Los acompañantes son nombres de terceros. Se sustituyen por un marcador en
  -- vez de vaciar el array, para que total_attendees y bed_numbers sigan
  -- cuadrando y la lista de una clase pasada siga diciendo cuánta gente vino.
  UPDATE public.bookings b
     SET attendees = ARRAY(
           SELECT 'Acompañante ' || g
             FROM generate_series(1, array_length(b.attendees, 1)) AS g
         )
   WHERE b.user_id = v_uid
     AND b.attendees IS NOT NULL
     AND array_length(b.attendees, 1) > 0;

  UPDATE public.waitlist_entries w
     SET attendees = ARRAY(
           SELECT 'Acompañante ' || g
             FROM generate_series(1, array_length(w.attendees, 1)) AS g
         )
   WHERE w.user_id = v_uid
     AND array_length(w.attendees, 1) > 0;

  -- client_name es NOT NULL, así que se reemplaza en vez de anularse.
  UPDATE public.memberships
     SET client_name = 'Cuenta eliminada',
         updated_at  = now()
   WHERE user_id = v_uid;

  -- Las tres tablas sin FK. Aquí vive lo más sensible: push_token,
  -- message_body con nombre y hora, ip_address, user_agent y device_info.
  -- Se borran, no se anonimizan: no hay nada que el estudio necesite de un
  -- log de entrega de push de una cuenta que ya no existe.
  DELETE FROM public.notification_schedules        WHERE user_id = v_uid;
  DELETE FROM public.notification_logs             WHERE user_id = v_uid;
  DELETE FROM public.user_notification_preferences WHERE user_id = v_uid;

  -- full_name se reemplaza en vez de anularse porque el panel de admin sigue
  -- pintando esta columna en el histórico, vía el embed profiles!user_id de
  -- getAdminBookings: un NULL dejaría en blanco la lista de una clase pasada.
  -- 'Cuenta eliminada' no es un dato personal y se lee solo.
  --
  -- Los SELECTORES de usuario son otra cosa: searchUsers ya filtra
  -- `deleted_at is null` (mismo commit, en el repo de la web), porque sirven
  -- para actuar sobre alguien y aquí no hay nadie.
  UPDATE public.profiles
     SET full_name  = 'Cuenta eliminada',
         phone      = NULL,
         deleted_at = now(),
         updated_at = now()
   WHERE id = v_uid;

  -- La fila de user_blacklist NO se toca. Decidido a conciencia: la lista es
  -- por user_id, así que volver a registrarse ya la evade hoy, con o sin esta
  -- función. Borrarla sólo le quitaría al estudio el motivo del bloqueo.

  -- --------------------------------------------------------------------------
  -- 2.3 Cerrar la identidad
  -- --------------------------------------------------------------------------
  -- identity_data guarda email, full_name, email_verified y sub. Se deja sólo
  -- lo estructural. Ojo: la unique de esta tabla es (provider_id, provider) y
  -- provider_id es el uuid del usuario, NO el correo — comprobado sobre las
  -- 991 filas de producción. Por eso cambiar el correo aquí no colisiona con
  -- nada, ni ahora ni cuando esa dirección se vuelva a registrar.
  --
  -- AQUÍ ESTÁ EL ARREGLO DE ESTA MIGRACIÓN: `email` es una columna GENERATED
  -- ALWAYS ... STORED sobre lower(identity_data->>'email'). Asignarle un valor
  -- es un error de Postgres (428C9), no un permiso que falte. Se escribe sólo
  -- identity_data y la columna se recalcula sola al tombstone.
  UPDATE auth.identities
     SET identity_data = jsonb_build_object('sub', v_uid::text, 'email', v_tombstone),
         updated_at    = now()
   WHERE user_id = v_uid;

  -- encrypted_password a NULL destruye la credencial. banned_until y
  -- deleted_at son el cinturón y los tirantes: GoTrue rechaza a un usuario
  -- soft-deleted, y el ban cubre el caso de que alguien reviva la fila a mano.
  -- Los tokens se vacían con '' y no con NULL porque los índices únicos
  -- parciales de auth.users excluyen justamente lo que casa con '^[0-9 ]*$',
  -- y la cadena vacía casa — así que dos cuentas eliminadas no chocan.
  UPDATE auth.users
     SET email                      = v_tombstone,
         encrypted_password         = NULL,
         raw_user_meta_data         = '{}'::jsonb,
         phone                      = NULL,
         confirmation_token         = '',
         recovery_token             = '',
         email_change               = '',
         email_change_token_new     = '',
         email_change_token_current = '',
         phone_change               = '',
         reauthentication_token     = '',
         banned_until               = now() + interval '100 years',
         deleted_at                 = now(),
         updated_at                 = now()
   WHERE id = v_uid;

  -- Un JWT ya emitido sigue siendo válido hasta que expira —lo dice la propia
  -- documentación de Supabase—, así que lo que se corta aquí es la renovación.
  -- El cliente además hace signOut inmediatamente después.
  DELETE FROM auth.refresh_tokens  WHERE user_id = v_uid::text;
  DELETE FROM auth.sessions        WHERE user_id = v_uid;
  DELETE FROM auth.one_time_tokens WHERE user_id = v_uid;
  DELETE FROM auth.mfa_factors     WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'status_code', 'OK',
    'message', 'Tu cuenta fue eliminada.',
    'cancelled_bookings', v_cancelled_bookings,
    'cancelled_waitlist_entries', v_cancelled_waitlist
  );
END;
$function$;

COMMENT ON FUNCTION public.delete_my_account() IS
  'Elimina la cuenta de quien llama (App Store 5.1.1(v)). Anonimiza en vez de '
  'borrar filas: destruye la credencial, libera el correo, borra toda la PII '
  'y conserva compras, reservas y movimientos de crédito de-identificados '
  'para la analítica del estudio. Devuelve jsonb con status_code. '
  'Rev. 2026-08-16: no escribe auth.identities.email, que es GENERATED ALWAYS.';

-- CREATE OR REPLACE conserva los privilegios existentes, pero se repiten para
-- que esta migración sea válida también sobre una base recreada desde cero.
REVOKE ALL     ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.delete_my_account() FROM anon;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO   authenticated;
