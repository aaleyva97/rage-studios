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
}
