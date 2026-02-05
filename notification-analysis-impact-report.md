# Push Notifications Analysis - Impact Report
**Date**: February 5, 2026
**Investigation Period**: Last 7 days (Jan 29 - Feb 5)

---

## Executive Summary

Push notifications are failing to reach **97% of users** due to FCM tokens not being saved in the database. Despite code optimizations deployed, token registration remains critically broken with a **disconnect between successful log events and actual database updates**.

**Critical Finding**: Token registration appears to succeed in application logs but fails to persist in the database, suggesting a database-level constraint or permissions issue blocking updates.

---

## Current State Metrics

### Token Registration Status
- **Total Users**: 203
- **Users WITH FCM Tokens**: 6 (2.96%)
- **Users WITHOUT Tokens**: 197 (97.04%)
- **Last Successful Token Update in DB**: January 24, 2026 (12+ days ago)

### Notification Delivery (Last 7 Days)
- **Total Scheduled**: 486 notifications
- **Successfully Sent**: 3 (0.7% success rate)
- **Failed**: 81 (17.7%)
- **Still Waiting (No Token)**: 374 (82.3%)
- **Primary Failure Reason**: "No FCM token available for user"

### User Activity vs Token Registration
- **Active Users (Made Bookings)**: 187 unique users in last 7 days
- **New Token Registrations**: 2 attempts on February 2, 2026
- **Successful DB Updates from Those Attempts**: 0 confirmed
- **Activity-to-Registration Ratio**: 93.5:1 (for every 93 active users, only 1 attempts token registration)

---

## Code Changes Deployed (Confirmed Active)

### Optimizations Made to notification.service.ts

1. **Rate Limiting Reduction**
   - Before: 10 minute cooldown between DB updates
   - After: 2 minute cooldown
   - Impact: 80% reduction in wait time

2. **Debounce Elimination**
   - Before: 30 second delay before saving token
   - After: Immediate save
   - Impact: Eliminates token loss when users close app quickly

3. **Service Worker Timeout Optimization**
   - Before: 30 seconds (production)
   - After: 10 seconds (production)
   - Impact: 67% faster initialization

4. **Retry Logic Enhancement**
   - Before: 2 retry attempts
   - After: 3 retry attempts with exponential backoff (1s, 2s, 4s)
   - Impact: 50% more chances to retrieve token

5. **Token Monitoring Conservatism**
   - Before: Every 4-8 hours
   - After: Every 24 hours with 48h cooldown
   - Impact: 75% reduction in background checks, prevents rate limiting

6. **Immediate Token Retrieval**
   - New: Automatically attempts token retrieval when SW ready + permissions granted
   - Impact: Proactive registration without waiting for next check interval

---

## Critical Issue: Database Update Failure

### Evidence of Disconnect

**Case Study: User bafbd813-9b3b-4035-bc13-5f8d27f5e178**

```
Application Logs (Feb 2, 2026):
✅ token_registered - success: true
✅ permission_requested - granted: true

Database Record:
❌ last_token_updated_at: 2026-01-24 (9 days earlier)
❌ primary_device_token: [NOT UPDATED]
```

This proves token registration logic executes successfully but the database update silently fails.

### Notification Scheduling Anomalies

Many notifications scheduled with invalid data:
```json
{
  "action": "notifications_scheduled",
  "count": 0,           // ❌ No notifications scheduled
  "types": []           // ❌ Empty notification types array
}
```

This suggests:
1. Users may have preferences enabled but no actual notification types selected
2. Token retrieval might be failing before scheduling logic runs
3. Permission grants may be superficial (UI level) but not actually functional

---

## Root Cause Analysis

### Hypothesis 1: Database Permissions/RLS Policy Blocking Updates ⭐ MOST LIKELY
The `user_notification_preferences` table may have Row Level Security (RLS) policies that prevent token updates even with valid authentication. The application logs "success" before the actual database transaction completes/fails.

**Evidence**:
- Logs show successful token retrieval
- Database shows no corresponding update
- No error messages captured in notification_logs
- Pattern consistent with silent RLS policy rejection

### Hypothesis 2: Upsert Logic Conflict
The `upsert` operation with `onConflict: 'user_id'` may have a constraint mismatch or the conflict resolution isn't working as expected.

**Evidence**:
- Only initial records (Jan 24) persist
- Subsequent updates don't override existing records
- Suggests upsert isn't updating, only attempting insert

### Hypothesis 3: Client-Side Transaction Rollback
Token registration may be wrapped in a transaction that's being rolled back before commit, possibly due to:
- Timeout issues
- Network interruptions
- Other operations in the same transaction failing

**Evidence**:
- Timing matches SW initialization (users may close app before commit)
- Even with immediate save, network latency could cause rollback
- No retry mechanism at database update level (only at token retrieval level)

### Hypothesis 4: Permission Grants Not Actually Functional
Users may be clicking "Allow" but:
- Browser settings override the permission
- PWA installation state affects permission validity
- iOS/Android system settings block despite browser permission

**Evidence**:
- Very low registration attempt rate (2 in 7 days vs 187 active users)
- Many notifications schedule with count:0 and empty types arrays
- High user activity but minimal permission request attempts logged

---

## Impact Assessment

### Business Impact
- **97% of users** cannot receive time-sensitive notifications for:
  - Class reminders
  - Booking confirmations
  - Schedule changes
  - Important announcements
- **374 notifications** currently in limbo waiting for tokens that may never come
- **User engagement risk**: Users may miss classes due to lack of reminders
- **Retention risk**: Users may perceive app as unreliable

### Technical Debt
- Code optimizations deployed but ineffective until database issue resolved
- Extensive logging now in place but no actionable errors captured
- Edge function operating correctly but underutilized (only 3 sends in 7 days)
- Firebase integration healthy but starved of tokens to send to

---

## Recommended Next Steps (Priority Order)

### 🔴 CRITICAL - Immediate Investigation Required

1. **Verify Database Permissions**
   ```sql
   -- Check RLS policies on user_notification_preferences
   SELECT * FROM pg_policies WHERE tablename = 'user_notification_preferences';

   -- Test manual token update for affected user
   UPDATE user_notification_preferences
   SET
     primary_device_token = 'test-token-123',
     last_token_updated_at = NOW()
   WHERE user_id = 'bafbd813-9b3b-4035-bc13-5f8d27f5e178';
   ```

2. **Add Database-Level Error Capture**
   Modify `performActualDatabaseUpdate()` to:
   - Capture actual Supabase error responses (not just try-catch)
   - Log the full error object including status codes
   - Add a verification query immediately after upsert to confirm it persisted

3. **Verify Upsert Behavior**
   ```typescript
   // Test if onConflict is working
   const { data, error, status, statusText } = await supabase.client
     .from('user_notification_preferences')
     .upsert({...}, { onConflict: 'user_id' });

   // Log EVERYTHING
   console.log('Upsert response:', { data, error, status, statusText });
   ```

### 🟡 HIGH PRIORITY - Within 24 Hours

4. **Implement DB Update Verification**
   After each token save attempt, immediately query the database to confirm it persisted:
   ```typescript
   // After upsert
   const verification = await supabase.client
     .from('user_notification_preferences')
     .select('primary_device_token, last_token_updated_at')
     .eq('user_id', user.id)
     .single();

   if (verification.data?.primary_device_token !== expectedToken) {
     // Token didn't save - log critical error
   }
   ```

5. **Add Transaction Retry Logic**
   Wrap database updates in retry logic with exponential backoff (similar to token retrieval).

6. **Investigate Permission Grant Flow**
   - Add tracking for when `requestPermission()` is called vs when it succeeds
   - Log browser/device info when permission requests occur
   - Track time between permission grant and token retrieval attempt

### 🟢 MEDIUM PRIORITY - This Week

7. **Analyze Empty Notification Types**
   Query users with `notifications_scheduled` events where `types: []`:
   ```sql
   SELECT user_id, action_data
   FROM notification_logs
   WHERE user_action = 'notifications_scheduled'
     AND action_data->>'types' = '[]'
   LIMIT 50;
   ```
   Cross-reference with their `user_notification_preferences` to see if they actually have preferences set.

8. **Monitor Token Expiration**
   FCM tokens can expire. Check if the 6 users with tokens have valid ones:
   - Attempt to send test notification to each token
   - Log any "InvalidRegistration" or "NotRegistered" errors
   - May need to add token refresh logic

9. **User Communication Strategy**
   Since 97% of users don't have working notifications:
   - Consider in-app prompt to re-enable notifications
   - Add troubleshooting UI showing notification status
   - Provide manual check for "Are notifications working?"

---

## Success Metrics to Track Post-Fix

1. **Token Registration Rate**
   - Target: >80% of active users have tokens within 7 days
   - Current: 3% (6 out of 203 users)

2. **Notification Delivery Success Rate**
   - Target: >95% of scheduled notifications delivered
   - Current: 0.7% (3 out of 486)

3. **Daily Token Updates**
   - Target: At least 5-10 new/refreshed tokens per day
   - Current: 0.3 per day average (2 attempts in 7 days)

4. **Database Update Success Rate**
   - Target: 100% of logged token retrievals persist in database
   - Current: 0% (logs show success but DB doesn't update)

---

## Conclusion

The notification system has been optimized at the application level but is blocked by a database persistence issue. The disconnect between successful application logs and failed database updates indicates either:

1. **RLS policies preventing updates** (most likely)
2. **Upsert conflict resolution failing**
3. **Transaction rollbacks before commit**
4. **Permission grants not being functionally valid**

**Immediate action required**: Database-level investigation to identify and resolve the persistence blocker. Until this is fixed, no amount of application-level optimization will improve the 3% token registration rate or 0.7% notification delivery success rate.

The edge function and FCM integration are working correctly. Once tokens can be successfully saved to the database, the system should function as designed.
