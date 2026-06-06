import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase-service';

export type WaitlistStatus =
  | 'waiting'
  | 'promoted'
  | 'expired'
  | 'cancelled'
  | 'failed_promotion';

export interface WaitlistEntry {
  id: string;
  user_id: string;
  session_date: string;
  session_time: string;
  coach_name: string;
  attendees: string[];
  total_attendees: number;
  credits_required: number;
  status: WaitlistStatus;
  position: number;
  promoted_to_booking_id: string | null;
  promoted_at: string | null;
  cancelled_at: string | null;
  failure_reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionAvailability {
  success: boolean;
  capacity?: number;
  occupied?: number;
  free?: number;
  is_full?: boolean;
  is_past?: boolean;
  waitlist_count?: number;
  session_date?: string;
  session_time?: string;
  error?: string;
  error_message?: string;
}

export interface EnrollResult {
  success: boolean;
  entry_id?: string;
  position?: number;
  expires_at?: string;
  error?: string;
  required?: number;
  available?: number;
  free?: number;
  max?: number;
}

export interface CancelResult {
  success: boolean;
  entry_id?: string;
  error?: string;
  current_status?: WaitlistStatus;
}

@Injectable({
  providedIn: 'root',
})
export class WaitlistService {
  private supabaseService = inject(SupabaseService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private _activeWaitlistCount = signal(0);
  private _userEntries = signal<WaitlistEntry[]>([]);
  private _isLoading = signal(false);
  private _currentUserId: string | null = null;

  readonly activeWaitlistCount = this._activeWaitlistCount.asReadonly();
  readonly userEntries = this._userEntries.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();

  setCurrentUser(userId: string | null) {
    this._currentUserId = userId;
    if (userId && this.isBrowser) {
      this.refreshUserEntries();
    } else {
      this._userEntries.set([]);
      this._activeWaitlistCount.set(0);
    }
  }

  async refreshUserEntries(): Promise<void> {
    if (!this._currentUserId || !this.isBrowser) return;

    this._isLoading.set(true);
    try {
      const { data, error } = await this.supabaseService.client
        .from('waitlist_entries')
        .select('*')
        .eq('user_id', this._currentUserId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user waitlist entries:', error);
        return;
      }

      const entries = (data || []) as WaitlistEntry[];
      this._userEntries.set(entries);
      this._activeWaitlistCount.set(
        entries.filter((e) => e.status === 'waiting').length
      );
    } catch (err) {
      console.error('Unexpected error in refreshUserEntries:', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Disponibilidad de un slot: capacidad, ocupado, libre, lleno, pasado, conteo waitlist
   */
  async getSessionAvailability(
    sessionDate: string,
    sessionTime: string
  ): Promise<SessionAvailability> {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'get_session_availability',
        {
          p_session_date: sessionDate,
          p_session_time: sessionTime,
        }
      );

      if (error) {
        console.error('Error in get_session_availability:', error);
        return { success: false, error: 'rpc_error', error_message: error.message };
      }

      return data as SessionAvailability;
    } catch (err: any) {
      console.error('Unexpected error in getSessionAvailability:', err);
      return { success: false, error: 'unexpected_error', error_message: err?.message };
    }
  }

  /**
   * Inscribir al usuario actual en la lista de espera del slot.
   * NO descuenta créditos (solo valida que tenga suficientes).
   */
  async enrollInWaitlist(params: {
    userId: string;
    sessionDate: string;
    sessionTime: string;
    coachName: string;
    attendees: string[];
    totalAttendees: number;
  }): Promise<EnrollResult> {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'enroll_in_waitlist',
        {
          p_user_id: params.userId,
          p_session_date: params.sessionDate,
          p_session_time: params.sessionTime,
          p_coach_name: params.coachName,
          p_attendees: params.attendees ?? [],
          p_total_attendees: params.totalAttendees,
        }
      );

      if (error) {
        console.error('Error in enroll_in_waitlist:', error);
        return { success: false, error: error.message };
      }

      const result = data as EnrollResult;
      if (result.success) {
        await this.refreshUserEntries();
      }
      return result;
    } catch (err: any) {
      console.error('Unexpected error in enrollInWaitlist:', err);
      return { success: false, error: err?.message || 'unexpected_error' };
    }
  }

  /**
   * Cancelar una entrada propia (o del usuario, si es admin).
   */
  async cancelWaitlistEntry(entryId: string): Promise<CancelResult> {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'cancel_waitlist_entry',
        { p_entry_id: entryId }
      );

      if (error) {
        console.error('Error in cancel_waitlist_entry:', error);
        return { success: false, error: error.message };
      }

      const result = data as CancelResult;
      if (result.success) {
        await this.refreshUserEntries();
      }
      return result;
    } catch (err: any) {
      console.error('Unexpected error in cancelWaitlistEntry:', err);
      return { success: false, error: err?.message || 'unexpected_error' };
    }
  }

  /**
   * Admin: listar todas las entradas de un slot (incluye datos del usuario via RLS).
   */
  async getEntriesForSlot(
    sessionDate: string,
    sessionTime: string
  ): Promise<WaitlistEntry[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('waitlist_entries')
        .select('*')
        .eq('session_date', sessionDate)
        .eq('session_time', sessionTime)
        .order('position', { ascending: true });

      if (error) {
        console.error('Error fetching waitlist for slot:', error);
        return [];
      }

      return (data || []) as WaitlistEntry[];
    } catch (err) {
      console.error('Unexpected error in getEntriesForSlot:', err);
      return [];
    }
  }

  /**
   * Admin: listar todas las entradas en un rango de fechas.
   */
  async getEntriesForDateRange(
    fromDate: string,
    toDate: string,
    statusFilter: 'all' | WaitlistStatus = 'all'
  ): Promise<WaitlistEntry[]> {
    try {
      let query = this.supabaseService.client
        .from('waitlist_entries')
        .select('*')
        .gte('session_date', fromDate)
        .lte('session_date', toDate)
        .order('session_date', { ascending: true })
        .order('session_time', { ascending: true })
        .order('position', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching admin waitlist entries:', error);
        return [];
      }

      return (data || []) as WaitlistEntry[];
    } catch (err) {
      console.error('Unexpected error in getEntriesForDateRange:', err);
      return [];
    }
  }
}
