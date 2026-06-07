import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (_req) => {
  const debugLogs: string[] = [];
  try {
    const nowStr = new Date().toISOString();
    debugLogs.push(`Processing news notifications at ${nowStr}`);

    // Find news due for publishing (regardless of active status, since scheduling implies publication intent)
    const { data: dueNews, error: fetchError } = await supabase
      .from('news')
      .select('*')
      .lte('scheduled_at', nowStr)
      .is('published_at', null);

    if (fetchError) {
      debugLogs.push(`Fetch scheduled news error: ${fetchError.message}`);
      throw fetchError;
    }

    // Find immediate news that are active, need notifications, and haven't had them sent yet
    const { data: immediateNews, error: immediateError } = await supabase
      .from('news')
      .select('*')
      .is('scheduled_at', null)
      .eq('is_active', true)
      .eq('send_notification', true)
      .eq('notification_sent', false);

    if (immediateError) {
      debugLogs.push(`Fetch immediate news error: ${immediateError.message}`);
      throw immediateError;
    }

    const allNews = [
      ...(dueNews || []),
      ...(immediateNews || [])
    ];

    if (allNews.length === 0) {
      debugLogs.push('No pending scheduled news or immediate news notifications found');
      return new Response(JSON.stringify({ published: 0, debugLogs }), { status: 200 });
    }

    debugLogs.push(`Found ${allNews.length} total news items to process (${dueNews?.length || 0} scheduled, ${immediateNews?.length || 0} immediate)`);
    let published = 0;

    for (const item of allNews) {
      const isScheduled = !item.published_at;

      if (isScheduled) {
        // Mark as published and active
        const { error: updateError } = await supabase
          .from('news')
          .update({ 
            published_at: nowStr,
            is_active: true
          })
          .eq('id', item.id);

        if (updateError) {
          debugLogs.push(`Failed to publish scheduled news ${item.id}: ${updateError.message}`);
          console.error(`Failed to publish scheduled news ${item.id}:`, updateError);
          continue;
        }
        debugLogs.push(`Published scheduled news item ${item.id}`);
      }

      published++;

      // Queue push and in-app notifications if requested and not already sent
      if (item.send_notification && !item.notification_sent) {
        debugLogs.push(`Sending notifications is enabled for news ${item.id}`);
        const { data: users, error: usersError } = await supabase
          .from('user_notification_preferences')
          .select('user_id, primary_device_token')
          .eq('push_notifications_enabled', true);

        if (usersError) {
          debugLogs.push(`Failed to fetch users: ${usersError.message}`);
          console.error(`Failed to fetch users for news notification:`, usersError);
        } else {
          const userCount = users?.length || 0;
          debugLogs.push(`Fetched ${userCount} users with push enabled`);

          if (users && users.length > 0) {
            // Set scheduled_for to 60 seconds in the future to pass the (scheduled_for > created_at) check constraint
            const scheduledForStr = new Date(Date.now() + 60 * 1000).toISOString();
            
            const schedules = users.map((user: any) => ({
              user_id: user.user_id,
              notification_type: 'news_alert',
              status: 'scheduled',
              scheduled_for: scheduledForStr,
              priority: 3,
              retry_count: 0,
              max_retries: 3,
              delivery_channels: ['push', 'database'],
              push_token: user.primary_device_token || null,
              message_payload: {
                title: item.tag ? `[${item.tag}] ${item.title}` : item.title,
                body: item.body,
                icon: item.image_url || '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png',
                data: {
                  news_id: item.id,
                  actionUrl: item.link_url ?? '/'
                }
              }
            }));

            // Bulk insert notifications into the schedules table
            const { data: insertData, error: insertError } = await supabase
              .from('notification_schedules')
              .insert(schedules)
              .select();

            if (insertError) {
              debugLogs.push(`Failed to insert notification schedules: ${insertError.message} (code: ${insertError.code})`);
              console.error(`Failed to insert notification schedules for news ${item.id}:`, insertError);
            } else {
              debugLogs.push(`Successfully inserted ${insertData?.length || 0} notification schedules`);
            }
          }
        }

        // Mark notification as sent/scheduled on the news item
        const { error: markError } = await supabase
          .from('news')
          .update({ notification_sent: true })
          .eq('id', item.id);

        if (markError) {
          debugLogs.push(`Failed to update notification_sent on news item: ${markError.message}`);
        } else {
          debugLogs.push(`Marked notification_sent as true on news ${item.id}`);
        }
      } else {
        debugLogs.push(`Notification not requested or already sent for news ${item.id}: send_notification=${item.send_notification}, notification_sent=${item.notification_sent}`);
      }
    }

    return new Response(JSON.stringify({ published, debugLogs }), { status: 200 });
  } catch (err) {
    debugLogs.push(`Fatal error: ${String(err)}`);
    console.error('publish-scheduled-news error:', err);
    return new Response(JSON.stringify({ error: String(err), debugLogs }), { status: 500 });
  }
});
