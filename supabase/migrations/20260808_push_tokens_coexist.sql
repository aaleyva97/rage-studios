-- ============================================================================
-- MIGRATION: que los tokens de push de la web y de la app convivan
-- Date: 2026-08-08
-- Description:
--   Hoy una socia que usa el sitio Y la app recibe notificaciones en UNO de los
--   dos, el último que abrió. No es un fallo de entrega: es que los dos
--   clientes se pisan la misma fila.
--
--   Los cinco caminos de escritura sobre user_notification_preferences, leídos
--   uno por uno:
--
--   | quién                                   | primary_device_token | push_tokens        |
--   |-----------------------------------------|----------------------|--------------------|
--   | web  performActualDatabaseUpdate        | su token             | **[{web}] MACHACA**|
--   | web  recuperación de token (línea ~885) | NULL                 | no lo toca         |
--   | app  saveToken                          | su token             | fusiona el suyo    |
--   | app  releaseToken                       | NULL                 | quita el suyo      |
--   | app  setEnabled(false)                  | NULL                 | []                 |
--
--   O sea: la app ya se porta bien y la web no. Cada vez que alguien abre el
--   sitio, `push_tokens` queda con un solo elemento y el token del teléfono
--   desaparece. Comprobado en producción: 216 filas con token, 215 con
--   exactamente un elemento en el array, y **una sola** con dos.
--
--   Este trigger convierte esa disciplina en una propiedad de la base en vez de
--   una promesa de cada cliente. No hace falta tocar la web ni la app: la web
--   puede seguir mandando `[{web}]` y el trigger conserva lo demás.
--
--   Se apoya en una invariante verificada sobre las 216 filas: el
--   `primary_device_token` SIEMPRE está también dentro del array. Por eso
--   `primary IS NULL` sirve para distinguir una baja de un alta, que es la
--   única ambigüedad real — sin esa señal, fusionar resucitaría el token que
--   alguien acaba de soltar al cerrar sesión.
--
--   **No cambia el envío.** El emisor sigue mandando a un solo token después de
--   esto; lo que cambia es que el array deja de perder información. El reparto
--   a todos los dispositivos va en la segunda pieza (la edge function), que se
--   despliega aparte y a propósito: si algo sale mal allí, esto por sí solo ya
--   es una mejora y no rompe nada.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.merge_push_tokens()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_incoming jsonb := coalesce(NEW.push_tokens, '[]'::jsonb);
  v_existing jsonb := coalesce(OLD.push_tokens, '[]'::jsonb);
  v_types    text[];
  v_kept     jsonb;
BEGIN
  -- Defensa: si alguien mete algo que no es un array, no se toca nada. Vale
  -- más una fila rara que un trigger que revienta cada registro de token.
  IF jsonb_typeof(v_incoming) <> 'array' OR jsonb_typeof(v_existing) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- --------------------------------------------------------------------------
  -- BAJA: el cliente está soltando un token.
  -- --------------------------------------------------------------------------
  -- Poner primary_device_token a NULL es lo que hacen los tres caminos de baja,
  -- y ninguno de alta. Es la única señal fiable de intención que hay en la
  -- fila, porque el array no dice quién escribe.
  IF NEW.primary_device_token IS NULL AND OLD.primary_device_token IS NOT NULL THEN

    -- La app recalcula la lista que debe quedar (releaseToken, setEnabled).
    -- Si el array viene distinto, el cliente ya hizo el trabajo: se respeta.
    IF v_incoming IS DISTINCT FROM v_existing THEN
      RETURN NEW;
    END IF;

    -- La web anula la columna sin tocar el array. El dispositivo que se está
    -- soltando es exactamente el que era primario, así que se quita ése y sólo
    -- ése — no la entrada del teléfono, que es lo que pasaría si se vaciara.
    NEW.push_tokens := (
      SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements(v_existing) e
       WHERE e->>'token' IS DISTINCT FROM OLD.primary_device_token
    );
    RETURN NEW;
  END IF;

  -- --------------------------------------------------------------------------
  -- ALTA: el cliente declara los dispositivos que conoce.
  -- --------------------------------------------------------------------------
  -- Un cliente sólo puede hablar por su propia plataforma. Lo que manda
  -- sustituye a las entradas de ESE deviceType, y las demás se conservan.
  SELECT array_agg(DISTINCT e->>'deviceType')
    INTO v_types
    FROM jsonb_array_elements(v_incoming) e
   WHERE e->>'deviceType' IS NOT NULL;

  -- Escritura que no menciona tokens (por ejemplo encender el interruptor de
  -- Perfil): el array se queda como estaba.
  IF v_types IS NULL THEN
    NEW.push_tokens := v_existing;
    RETURN NEW;
  END IF;

  SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
    INTO v_kept
    FROM jsonb_array_elements(v_existing) e
   WHERE NOT (e->>'deviceType' = ANY (v_types));

  NEW.push_tokens := v_kept || v_incoming;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.merge_push_tokens() IS
  'Impide que un cliente borre los tokens push de otra plataforma al escribir '
  'su propio token. La web manda [{web}] y este trigger conserva el resto. '
  'primary_device_token = NULL distingue una baja de un alta.';

-- BEFORE UPDATE y no INSERT: en un alta no hay OLD con qué fusionar, y la fila
-- recién creada ya es exactamente lo que su cliente quiso escribir.
--
-- Se declara ANTES que sync_tokens_on_preference_update por orden alfabético
-- del nombre, pero da igual: aquél es AFTER y sólo mira primary_device_token,
-- que este trigger no toca nunca.
DROP TRIGGER IF EXISTS merge_push_tokens_on_update ON public.user_notification_preferences;

CREATE TRIGGER merge_push_tokens_on_update
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_push_tokens();
