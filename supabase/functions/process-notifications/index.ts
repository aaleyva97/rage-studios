import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * 🔥 RAGE STUDIOS - PROCESS NOTIFICATIONS V5
 *
 * Igual que la V4 salvo en UNA cosa: a quién se le manda cada aviso.
 *
 * La V4 mandaba a un solo token — `notification_schedules.push_token`, y si
 * estaba vacío, `user_notification_preferences.primary_device_token`. Esa
 * columna es una sola y la comparten los dos clientes, así que una socia con
 * el sitio abierto y la app instalada recibía en uno de los dos: el último que
 * hubiera escrito. Nunca en los dos.
 *
 * La V5 lee `push_tokens`, que es el array por dispositivo, y reparte a todos.
 * Las dos fuentes viejas se conservan como respaldo al final de la lista, así
 * que una cuenta sin array —144 de las 360 filas de hoy— se comporta
 * exactamente igual que antes.
 *
 * Depende del trigger `merge_push_tokens_on_update`
 * (20260808_push_tokens_coexist.sql), que impide que el sitio borre el token
 * del teléfono al guardar el suyo. Sin él este reparto casi nunca vería más de
 * un token, porque el array se quedaba con un elemento.
 *
 * También honra `push_notifications_enabled`. La V4 lo ignoraba, de modo que
 * apagar las notificaciones desde la web no apagaba nada. Hoy no cambia el
 * comportamiento de nadie: las 360 filas lo tienen en `true`.
 *
 * Lo que NO hace, a propósito: limpiar tokens muertos. FCM devuelve
 * `UNREGISTERED` para ~1 200 tokens que nadie borra, pero escribir en
 * `push_tokens` desde aquí pelearía con el trigger de fusión —una entrada
 * menos se lee como un alta parcial y se resucitaría—. Va aparte.
 */

// Función para obtener Access Token usando Service Account
async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const signature = await signJWT(signingInput, privateKey);
  const jwt = `${signingInput}.${signature}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function importPrivateKey(privateKeyPem) {
  const privateKeyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryData = atob(privateKeyData);
  const keyBuffer = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    keyBuffer[i] = binaryData.charCodeAt(i);
  }
  return await crypto.subtle.importKey('pkcs8', keyBuffer, {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-256'
  }, false, ['sign']);
}

async function signJWT(data, privateKey) {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(data));
  const signatureArray = new Uint8Array(signature);
  let binaryString = '';
  for (let i = 0; i < signatureArray.length; i++) {
    binaryString += String.fromCharCode(signatureArray[i]);
  }
  return btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Todos los tokens a los que hay que entregar este aviso, sin repetidos.
 *
 * Orden deliberado: primero el array por dispositivo, después las dos fuentes
 * que usaba la V4. Así una cuenta que todavía no tiene array se comporta igual
 * que antes, y una que sí lo tiene no pierde el respaldo si el array viniera
 * incompleto.
 */
function resolveTokens(notification, prefs) {
  // Sólo se respeta un "no" explícito: la ausencia de fila no es una negativa,
  // es una cuenta que nunca tocó el interruptor.
  if (prefs && prefs.push_notifications_enabled === false) return [];

  const tokens = [];
  const add = (value) => {
    if (typeof value === 'string' && value.length > 0 && !tokens.includes(value)) {
      tokens.push(value);
    }
  };

  if (prefs && Array.isArray(prefs.push_tokens)) {
    for (const device of prefs.push_tokens) {
      // `isActive` lo escribe la web; la app no lo pone. Sólo se descarta
      // cuando dice explícitamente que no.
      if (device && device.isActive !== false) add(device.token);
    }
  }

  add(notification.push_token);
  add(prefs?.primary_device_token);

  return tokens;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let requestBody = '';
    let serviceRoleKey = null;

    try {
      requestBody = await req.text();
      if (requestBody) {
        const bodyData = JSON.parse(requestBody);
        if (bodyData.service_role_key) {
          serviceRoleKey = bodyData.service_role_key;
          console.log('📅 Using service role key from request body');
        }
      }
    } catch (e) {
      console.log('⚠️ Could not parse request body');
    }

    console.log('🔔 Starting notification processing V5 (multi-device)...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const envServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const firebaseServiceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    const finalServiceKey = serviceRoleKey || envServiceKey;

    if (!firebaseServiceAccountJson || !finalServiceKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT or SERVICE_ROLE_KEY not configured');
    }

    const serviceAccount = JSON.parse(firebaseServiceAccountJson);
    const projectId = serviceAccount.project_id;
    const accessToken = await getAccessToken(serviceAccount);
    console.log('✅ Got FCM access token');

    const supabase = createClient(supabaseUrl, finalServiceKey);

    const { data: pendingNotifications, error: fetchError } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .limit(50);

    if (fetchError) {
      console.error('❌ Error fetching notifications:', fetchError);
      throw fetchError;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log('ℹ️ No pending notifications');
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending notifications',
        processed: 0,
        version: 'v5-multidevice'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Una sola consulta para todo el lote, no una por aviso: 50 notificaciones
    // suelen ser de muchas menos personas.
    const userIds = [...new Set(pendingNotifications.map((n) => n.user_id).filter(Boolean))];
    const prefsByUser = new Map();

    if (userIds.length > 0) {
      const { data: prefsRows, error: prefsError } = await supabase
        .from('user_notification_preferences')
        .select('user_id, primary_device_token, push_tokens, push_notifications_enabled')
        .in('user_id', userIds);

      if (prefsError) {
        // No es fatal: sin preferencias se cae al `push_token` estampado en
        // cada fila, que es exactamente lo que hacía la V4.
        console.warn('⚠️ Could not load preferences, falling back to stamped tokens:', prefsError.message);
      } else {
        for (const row of prefsRows ?? []) prefsByUser.set(row.user_id, row);
      }
    }

    console.log(`📨 Processing ${pendingNotifications.length} notifications for ${userIds.length} users`);

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const notification of pendingNotifications) {
      try {
        await supabase.from('notification_schedules').update({
          status: 'processing',
          updated_at: new Date().toISOString()
        }).eq('id', notification.id);

        const tokens = resolveTokens(notification, prefsByUser.get(notification.user_id));

        if (tokens.length === 0) {
          console.log(`⚠️ No FCM token for notification ${notification.id}`);
          await supabase.from('notification_schedules').update({
            status: 'failed',
            last_error: 'No FCM token available',
            updated_at: new Date().toISOString()
          }).eq('id', notification.id);
          failureCount++;
          continue;
        }

        console.log(`📡 Sending notification ${notification.id} to ${tokens.length} device(s)`);

        let delivered = 0;
        let lastError = null;

        for (const fcmToken of tokens) {
          const fcmMessage = {
            message: {
              token: fcmToken,
              notification: {
                title: notification.message_payload.title || 'RageStudios',
                body: notification.message_payload.body || 'Nueva notificación'
              },
              data: {
                notificationId: notification.id,
                bookingId: notification.booking_id || '',
                notificationType: notification.notification_type,
                actionUrl: notification.message_payload.data?.actionUrl || '/account/bookings',
                priority: String(notification.priority || 3),
                timestamp: new Date().toISOString()
              },
              webpush: {
                headers: { Urgency: notification.priority >= 4 ? 'high' : 'normal' },
                notification: {
                  icon: notification.message_payload.icon || '/icons/icon-192x192.png',
                  badge: notification.message_payload.badge || '/icons/badge-72x72.png',
                  requireInteraction: notification.priority >= 5,
                  tag: notification.notification_type,
                  data: {
                    actionUrl: notification.message_payload.data?.actionUrl || '/account/bookings'
                  }
                }
              },
              android: {
                priority: notification.priority >= 4 ? 'high' : 'normal',
                notification: {
                  icon: 'ic_notification',
                  color: '#FF6B6B',
                  sound: 'default',
                  clickAction: 'OPEN_BOOKING'
                }
              }
            }
          };

          const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(fcmMessage)
          });

          const fcmResult = await fcmResponse.json();

          if (fcmResponse.ok && fcmResult.name) {
            delivered++;
            await supabase.from('notification_logs').insert({
              schedule_id: notification.id,
              user_id: notification.user_id,
              booking_id: notification.booking_id,
              log_type: 'sent_success',
              notification_type: notification.notification_type,
              channel_used: 'push',
              provider_used: 'fcm_v1',
              message_title: notification.message_payload.title,
              message_body: notification.message_payload.body,
              push_token_used: fcmToken.substring(0, 50),
              success: true,
              http_status_code: fcmResponse.status,
              provider_response: fcmResult,
              sent_at: new Date().toISOString()
            });
          } else {
            lastError = fcmResult.error?.message || 'Unknown FCM error';
            console.warn(`⚠️ FCM rejected one device for ${notification.id}: ${lastError}`);
            await supabase.from('notification_logs').insert({
              schedule_id: notification.id,
              user_id: notification.user_id,
              booking_id: notification.booking_id,
              log_type: 'sent_failure',
              notification_type: notification.notification_type,
              channel_used: 'push',
              provider_used: 'fcm_v1',
              push_token_used: fcmToken.substring(0, 50),
              success: false,
              http_status_code: fcmResponse.status,
              error_message: lastError,
              provider_response: fcmResult
            });
          }
        }

        // Un aviso se considera entregado si llegó a ALGÚN dispositivo. Marcarlo
        // como fallido porque el navegador que la socia no abre desde marzo
        // tiene un token muerto sería mentir sobre un recordatorio que sí sonó
        // en su teléfono — y además lo reintentaría.
        if (delivered > 0) {
          await supabase.from('notification_schedules').update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq('id', notification.id);

          successCount++;
          results.push({ id: notification.id, status: 'success', delivered, attempted: tokens.length });
        } else {
          await supabase.from('notification_schedules').update({
            status: 'failed',
            last_error: lastError || 'All devices rejected',
            retry_count: notification.retry_count + 1,
            updated_at: new Date().toISOString()
          }).eq('id', notification.id);

          failureCount++;
          results.push({ id: notification.id, status: 'failed', attempted: tokens.length, error: lastError });
        }
      } catch (error) {
        console.error(`❌ Error processing notification ${notification.id}:`, error);
        failureCount++;
      }
    }

    console.log(`✅ Processing complete. Success: ${successCount}, Failed: ${failureCount}`);

    return new Response(JSON.stringify({
      success: true,
      processed: pendingNotifications.length,
      successful: successCount,
      failed: failureCount,
      results: results,
      version: 'v5-multidevice'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
