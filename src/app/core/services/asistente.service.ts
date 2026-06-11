import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface AsistenteToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface AsistenteResponse {
  report: string;
  toolCalls: AsistenteToolCall[];
}

export interface AsistenteRequest {
  prompt: string;
  user_id?: string;
  user_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AsistenteService {
  private supabaseService = inject(SupabaseService);

  /**
   * Invoca la Edge Function `admin-assistant`, que usa Claude (Sonnet 4.6) con
   * herramientas de solo lectura sobre la base de datos para generar un informe
   * de soporte. El guard de administrador se valida en el servidor.
   */
  async consultar(request: AsistenteRequest): Promise<AsistenteResponse> {
    const { data, error } = await this.supabaseService.client.functions.invoke(
      'admin-assistant',
      { body: request }
    );

    if (error) {
      // Las Edge Functions devuelven el cuerpo de error en error.context cuando el status != 2xx
      let detail = error.message;
      try {
        const parsed = await error.context?.json?.();
        if (parsed?.error) detail = parsed.error;
      } catch {
        // ignorar: usamos error.message
      }
      throw new Error(detail || 'Error al consultar el asistente');
    }

    return data as AsistenteResponse;
  }
}
