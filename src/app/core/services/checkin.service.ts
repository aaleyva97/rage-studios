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
  client_id?: string;
  next_booking?: {
    session_date: string;
    session_time: string;
    bed_numbers: number[];
    coach_name: string;
    is_membership: boolean;
  } | null;
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

  /**
   * Difunde el resultado del escaneo al canal en tiempo real del cliente.
   * Esto permite que el teléfono del cliente reaccione de forma inmediata (éxito/error).
   */
  async broadcastScanResult(clientId: string, result: ScanResult): Promise<void> {
    console.log(`CheckinService: Attempting to broadcast scan result to client ${clientId}...`, result);
    const channel = this.supabaseService.client.channel(`checkin-status:${clientId}`);
    return new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status) => {
        console.log(`CheckinService: Broadcast channel subscription status: ${status} for client ${clientId}`);
        if (status === 'SUBSCRIBED') {
          try {
            console.log(`CheckinService: Sending broadcast event 'scan-result' with payload...`);
            const sendResult = await channel.send({
              type: 'broadcast',
              event: 'scan-result',
              payload: result
            });
            console.log(`CheckinService: Broadcast sent successfully:`, sendResult);
            resolve();
          } catch (err) {
            console.error(`CheckinService: Error sending broadcast:`, err);
            reject(err);
          } finally {
            // Espera un momento antes de desuscribirse para asegurar el envío del mensaje
            setTimeout(() => {
              console.log(`CheckinService: Unsubscribing temp broadcast channel.`);
              channel.unsubscribe();
            }, 1000);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`CheckinService: Failed to subscribe for broadcast status=${status}`);
          reject(new Error(`Failed to subscribe for broadcast: ${status}`));
        }
      });
    });
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
