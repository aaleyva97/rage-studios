import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface CheckinPass {
  token: string;
  member_code: string;
  expires_at: string;
}

export type ScanStatus =
  | 'OK'
  | 'ALREADY_CHECKED_IN'
  | 'NO_CLASS_IN_WINDOW'
  | 'NO_BOOKING_TODAY'
  | 'EXPIRED_TOKEN'
  | 'INVALID_TOKEN'
  | 'NOT_ADMIN';

export interface ScanResult {
  status_code: ScanStatus;
  message: string;
  client_name?: string;
  class_name?: string;
  session_time?: string;
  member_code?: string;
  is_membership?: boolean;
}

export interface ClassInfo {
  session_time: string; // 'HH:MM'
  coach_name: string;
  expected: number;
  checked: number;
  is_current: boolean;
}

export interface RosterEntry {
  kind: 'booking' | 'membership';
  booking_id: string | null;
  membership_schedule_id: string | null;
  user_id: string | null;
  display_name: string;
  bed_numbers: number[];
  extra_attendees: number;
  attendance_status: 'attended' | 'missed' | null;
  attended: boolean;
  is_membership: boolean;
}

@Injectable({ providedIn: 'root' })
export class CheckinService {
  private supabaseService = inject(SupabaseService);

  /**
   * Emite un pase de acceso firmado por el servidor (token rotativo de ~90s)
   * para que la clienta lo muestre como QR. El servidor firma con HMAC; el
   * cliente nunca ve el secreto.
   */
  async issuePass(): Promise<CheckinPass> {
    const { data, error } = await this.supabaseService.client.rpc('issue_checkin_pass');
    if (error) throw error;
    return data as CheckinPass;
  }

  /**
   * Valida el token escaneado por el lector y marca la asistencia de la clienta.
   * El guard de administrador se valida dentro de la RPC (SECURITY DEFINER).
   */
  async scanPass(token: string): Promise<ScanResult> {
    const { data, error } = await this.supabaseService.client.rpc('checkin_scan_pass', { p_token: token });
    if (error) throw error;
    return data as ScanResult;
  }

  /** Clases de hoy con contadores (esperados/registrados) para el selector. */
  async getTodayClasses(): Promise<ClassInfo[]> {
    const { data, error } = await this.supabaseService.client.rpc('get_checkin_classes_today');
    if (error) throw error;
    return Array.isArray(data) ? (data as ClassInfo[]) : [];
  }

  /** Lista de personas esperadas en la clase de hoy a la hora indicada. */
  async getRoster(time: string): Promise<RosterEntry[]> {
    const { data, error } = await this.supabaseService.client.rpc('get_checkin_roster', { p_time: time });
    if (error) throw error;
    return Array.isArray(data) ? (data as RosterEntry[]) : [];
  }

  /** Marca manualmente la asistencia de una reserva existente. */
  async markBooking(bookingId: string, status: 'attended' | 'missed' | 'pending'): Promise<ScanResult> {
    const { data, error } = await this.supabaseService.client
      .rpc('admin_mark_booking_attendance', { p_booking_id: bookingId, p_status: status });
    if (error) throw error;
    return data as ScanResult;
  }

  /** Check-in manual de una socia VIP (materializa su reserva de hoy). */
  async checkinMembership(membershipScheduleId: string): Promise<ScanResult> {
    const { data, error } = await this.supabaseService.client
      .rpc('admin_checkin_membership_today', { p_membership_schedule_id: membershipScheduleId });
    if (error) throw error;
    return data as ScanResult;
  }
}
