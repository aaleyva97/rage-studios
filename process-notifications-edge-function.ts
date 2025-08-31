import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// CORS Headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * 🔥 RAGE STUDIOS - EDGE FUNCTION: PROCESS NOTIFICATIONS
 * 
 * Esta función procesa y envía notificaciones push programadas usando FCM v1 API
 * Tecnología: FCM v1 API + Service Account + VAPID Keys
 * Compatible con: Angular 20 SSR + Supabase
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔔 [RAGE] Starting notification processing...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // FCM v1 API Credentials (Service Account)
    const firebaseServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    
    if (!firebaseServiceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT not configured in environment variables');
    }

    const serviceAccount = JSON.parse(firebaseServiceAccount);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 🚨 STEP 1: Get pending notifications (CRÍTICO)
    const { data: pendingNotifications, error: fetchError } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false }) // Higher priority first
      .order('scheduled_for', { ascending: true }) // Older first
      .limit(50); // Process max 50 at a time

    if (fetchError) {
      console.error('❌ [RAGE] Error fetching notifications:', fetchError);
      throw fetchError;
    }

    if (!pendingNotifications || pendingNotifications.length === 0) {
      console.log('ℹ️ [RAGE] No pending notifications to process');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending notifications',
          processed: 0,
          timestamp: new Date().toISOString()
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    console.log(`🔄 [RAGE] Processing ${pendingNotifications.length} notifications`);

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    // 🚨 STEP 2: Process each notification
    for (const notification of pendingNotifications) {
      try {
        console.log(`📨 [RAGE] Processing notification ${notification.id} (${notification.notification_type})`);
        
        // Mark as processing
        await supabase
          .from('notification_schedules')
          .update({ 
            status: 'processing',
            updated_at: new Date().toISOString()
          })
          .eq('id', notification.id);

        // Get Firebase Access Token
        const accessToken = await getFirebaseAccessToken(serviceAccount);
        
        // Send FCM v1 notification
        const result = await sendFCMv1Notification(notification, serviceAccount.project_id, accessToken);
        
        if (result.success) {
          // Mark as sent
          await supabase
            .from('notification_schedules')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          // Log success
          await logNotificationEvent(supabase, notification.id, 'sent_success', true, result);
          successCount++;
          
          results.push({
            id: notification.id,
            type: notification.notification_type,
            status: 'success',
            messageId: result.messageId
          });
          
          console.log(`✅ [RAGE] Notification ${notification.id} sent successfully`);
        } else {
          // Calculate next retry
          const shouldRetry = notification.retry_count < notification.max_retries;
          const nextRetryAt = shouldRetry ? calculateNextRetry(notification.retry_count) : null;
          
          // Mark as failed or ready for retry
          await supabase
            .from('notification_schedules')
            .update({
              status: shouldRetry ? 'scheduled' : 'failed',
              retry_count: notification.retry_count + 1,
              last_error: result.error,
              next_retry_at: nextRetryAt,
              updated_at: new Date().toISOString()
            })
            .eq('id', notification.id);

          // Log failure
          await logNotificationEvent(supabase, notification.id, 'sent_failure', false, result);
          failureCount++;
          
          results.push({
            id: notification.id,
            type: notification.notification_type,
            status: 'failed',
            error: result.error,
            willRetry: shouldRetry
          });
          
          console.log(`❌ [RAGE] Notification ${notification.id} failed: ${result.error}`);
        }

      } catch (notificationError) {
        console.error(`❌ [RAGE] Error processing notification ${notification.id}:`, notificationError);
        
        // Mark as failed
        await supabase
          .from('notification_schedules')
          .update({
            status: 'failed',
            retry_count: notification.retry_count + 1,
            last_error: notificationError instanceof Error ? notificationError.message : String(notificationError),
            updated_at: new Date().toISOString()
          })
          .eq('id', notification.id);
        
        failureCount++;
        results.push({
          id: notification.id,
          status: 'error',
          error: notificationError instanceof Error ? notificationError.message : String(notificationError)
        });
      }
    }

    console.log(`🎉 [RAGE] Processing complete. Success: ${successCount}, Failures: ${failureCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingNotifications.length,
        successful: successCount,
        failed: failureCount,
        results: results,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ [RAGE] Fatal error in notification processing:', error);
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

/**
 * 🔥 GET FIREBASE ACCESS TOKEN (FCM v1 API)
 * Uses Service Account to get JWT token for FCM v1 API calls
 */
async function getFirebaseAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  // Create JWT payload
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // 1 hour
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  };
  
  // Encode header and payload
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  
  // Create signing input
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // Import private key for signing
  const privateKeyPem = serviceAccount.private_key;
  const privateKey = await importPrivateKey(privateKeyPem);
  
  // Sign the JWT
  const signature = await signJWT(signingInput, privateKey);
  const jwt = `${signingInput}.${signature}`;
  
  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * 🔥 IMPORT PRIVATE KEY FOR JWT SIGNING
 */
async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  // Remove PEM headers and footers, and whitespace
  const privateKeyData = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  // Convert base64 to ArrayBuffer
  const binaryData = atob(privateKeyData);
  const keyBuffer = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    keyBuffer[i] = binaryData.charCodeAt(i);
  }
  
  // Import the key
  return await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

/**
 * 🔥 SIGN JWT WITH PRIVATE KEY
 */
async function signJWT(data: string, privateKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(data)
  );
  
  // Convert ArrayBuffer to base64url
  const signatureArray = new Uint8Array(signature);
  let binaryString = '';
  for (let i = 0; i < signatureArray.length; i++) {
    binaryString += String.fromCharCode(signatureArray[i]);
  }
  
  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * 🚨 SEND FCM v1 NOTIFICATION (PROFESIONAL)
 * Uses modern FCM v1 API with proper token format
 */
async function sendFCMv1Notification(notification: any, projectId: string, accessToken: string) {
  try {
    if (!notification.push_token) {
      return {
        success: false,
        error: 'No push token available',
        code: 'NO_TOKEN'
      };
    }

    // Decode the push token (it's base64 encoded from Angular SwPush)
    const decodedToken = JSON.parse(atob(notification.push_token));
    
    // Extract registration token from FCM endpoint
    const endpoint = decodedToken.endpoint;
    const registrationToken = endpoint.replace('https://fcm.googleapis.com/fcm/send/', '');
    
    // Prepare FCM v1 payload
    const fcmPayload = {
      message: {
        token: registrationToken,
        notification: {
          title: notification.message_payload.title,
          body: notification.message_payload.body,
          image: notification.message_payload.image || notification.message_payload.icon
        },
        data: {
          ...notification.message_payload.data,
          notificationId: notification.id,
          bookingId: notification.booking_id,
          type: notification.notification_type,
          actionUrl: notification.message_payload.data?.actionUrl || '/account/bookings'
        },
        webpush: {
          headers: {
            Urgency: notification.priority >= 5 ? 'high' : 'normal'
          },
          notification: {
            icon: notification.message_payload.icon || '/icons/icon-192x192.png',
            badge: notification.message_payload.badge || '/icons/badge-72x72.png',
            tag: notification.notification_type,
            requireInteraction: notification.priority >= 5,
            actions: notification.message_payload.actions || []
          }
        }
      }
    };

    console.log(`📡 [FCM-v1] Sending to FCM v1 API:`, JSON.stringify(fcmPayload, null, 2));

    // Send to FCM v1 API
    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fcmPayload),
    });

    const fcmResult = await fcmResponse.json();
    console.log(`📡 [FCM-v1] Response:`, fcmResult);

    if (fcmResponse.ok && fcmResult.name) {
      return {
        success: true,
        fcmResponse: fcmResult,
        messageId: fcmResult.name
      };
    } else {
      return {
        success: false,
        error: fcmResult.error?.message || 'FCM send failed',
        fcmResponse: fcmResult,
        httpStatus: fcmResponse.status
      };
    }

  } catch (error) {
    console.error('❌ [FCM-v1] Send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: 'SEND_ERROR'
    };
  }
}

/**
 * 🚨 LOG NOTIFICATION EVENT
 */
async function logNotificationEvent(
  supabase: any, 
  scheduleId: string, 
  logType: string, 
  success: boolean, 
  result: any
) {
  try {
    await supabase.rpc('log_notification_event', {
      p_schedule_id: scheduleId,
      p_log_type: logType,
      p_channel_used: 'push',
      p_success: success,
      p_error_code: result.code || null,
      p_error_message: result.error || null,
      p_provider_response: result,
      p_processing_time_ms: null
    });
  } catch (logError) {
    console.error('⚠️ [LOG] Error logging event:', logError);
    // Don't throw - logging errors shouldn't stop the process
  }
}

/**
 * 🚨 CALCULATE NEXT RETRY TIME
 */
function calculateNextRetry(retryCount: number): string {
  // Exponential backoff: 5min, 15min, 60min
  const retryIntervals = [5, 15, 60]; // minutes
  const interval = retryIntervals[Math.min(retryCount, retryIntervals.length - 1)];
  
  const nextRetry = new Date();
  nextRetry.setMinutes(nextRetry.getMinutes() + interval);
  
  return nextRetry.toISOString();
}