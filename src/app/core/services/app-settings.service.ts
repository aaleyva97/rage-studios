import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface AppSetting {
  key: string;
  value: string;
  description: string;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppSettingsService {
  private supabaseService = inject(SupabaseService);
  
  // 🔄 SIGNALS para configuraciones críticas
  private _bookingsEnabled = signal(true); // Valor por defecto: habilitado
  private _cancellationHoursBefore = signal(6); // Valor por defecto: 6 horas
  private _bookingsScheduleMode = signal<'manual' | 'scheduled'>('manual'); // Modo de programación
  private _bookingsCloseDate = signal<Date | null>(null); // Fecha/hora de cierre programada
  private _bookingsOpenDate = signal<Date | null>(null); // Fecha/hora de apertura programada
  private _isLoading = signal(false);
  private _lastUpdated = signal<Date | null>(null);
  
  // 📦 Cache de configuraciones
  private settingsCache = new Map<string, string>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
  
  constructor() {
    // Cargar configuraciones al inicializar
    this.loadCriticalSettings();
  }
  
  // 📊 GETTERS PÚBLICOS (READONLY)
  get bookingsEnabled() {
    return this._bookingsEnabled.asReadonly();
  }

  get cancellationHoursBefore() {
    return this._cancellationHoursBefore.asReadonly();
  }

  get bookingsScheduleMode() {
    return this._bookingsScheduleMode.asReadonly();
  }

  get bookingsCloseDate() {
    return this._bookingsCloseDate.asReadonly();
  }

  get bookingsOpenDate() {
    return this._bookingsOpenDate.asReadonly();
  }

  get isLoading() {
    return this._isLoading.asReadonly();
  }

  get lastUpdated() {
    return this._lastUpdated.asReadonly();
  }
  
  /**
   * 🚀 Cargar configuraciones críticas al inicializar la app
   */
  private async loadCriticalSettings(): Promise<void> {
    try {
      console.log('🔧 Cargando configuraciones críticas de la aplicación...');

      const bookingsEnabled = await this.getSetting('bookings_enabled');
      if (bookingsEnabled !== null) {
        this._bookingsEnabled.set(bookingsEnabled === 'true');
      }

      const cancellationHours = await this.getSetting('cancellation_hours_before');
      if (cancellationHours !== null) {
        const hours = parseInt(cancellationHours, 10);
        if (!isNaN(hours) && hours >= 0) {
          this._cancellationHoursBefore.set(hours);
        }
      }

      // Cargar configuraciones de programación de reservas
      const scheduleMode = await this.getSetting('bookings_schedule_mode');
      if (scheduleMode !== null && (scheduleMode === 'manual' || scheduleMode === 'scheduled')) {
        this._bookingsScheduleMode.set(scheduleMode);
      }

      const closeDateTime = await this.getSetting('bookings_close_datetime');
      if (closeDateTime !== null && closeDateTime !== '') {
        try {
          this._bookingsCloseDate.set(new Date(closeDateTime));
        } catch (error) {
          console.warn('⚠️ Formato inválido en bookings_close_datetime:', closeDateTime);
        }
      }

      const openDateTime = await this.getSetting('bookings_open_datetime');
      if (openDateTime !== null && openDateTime !== '') {
        try {
          this._bookingsOpenDate.set(new Date(openDateTime));
        } catch (error) {
          console.warn('⚠️ Formato inválido en bookings_open_datetime:', openDateTime);
        }
      }

      this._lastUpdated.set(new Date());
      console.log('✅ Configuraciones críticas cargadas exitosamente');
    } catch (error) {
      console.warn('⚠️ Error cargando configuraciones críticas, usando valores por defecto:', error);
      // Mantener valores por defecto en caso de error
    }
  }
  
  /**
   * 📖 Obtener una configuración específica (con cache inteligente)
   */
  async getSetting(key: string): Promise<string | null> {
    try {
      // 🏃‍♂️ Verificar cache primero
      const cached = this.getCachedValue(key);
      if (cached !== null) {
        return cached;
      }
      
      // 🔍 Buscar en base de datos
      const { data, error } = await this.supabaseService.client
        .from('app_settings')
        .select('value')
        .eq('key', key)
        .single();
      
      if (error) {
        // Si no existe la key, retornar null (no es error crítico)
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      
      // 💾 Guardar en cache
      this.setCachedValue(key, data.value);
      return data.value;
      
    } catch (error) {
      console.error(`❌ Error obteniendo configuración '${key}':`, error);
      return null;
    }
  }
  
  /**
   * ✏️ Actualizar una configuración (solo para administradores)
   */
  async updateSetting(
    key: string, 
    value: string, 
    description: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this._isLoading.set(true);
      
      // 🔍 Verificar si existe o crear nueva
      const { data: existing } = await this.supabaseService.client
        .from('app_settings')
        .select('key')
        .eq('key', key)
        .single();
      
      let result;
      
      if (existing) {
        // Actualizar existente
        result = await this.supabaseService.client
          .from('app_settings')
          .update({
            value,
            description,
            updated_at: new Date().toISOString()
          })
          .eq('key', key);
      } else {
        // Crear nueva
        result = await this.supabaseService.client
          .from('app_settings')
          .insert({
            key,
            value,
            description
          });
      }
      
      if (result.error) {
        throw result.error;
      }
      
      // 🔄 Actualizar cache y signals
      this.setCachedValue(key, value);
      await this.refreshCriticalSettings();
      this._lastUpdated.set(new Date());
      
      console.log(`✅ Configuración '${key}' actualizada exitosamente`);
      return { success: true };
      
    } catch (error: any) {
      console.error(`❌ Error actualizando configuración '${key}':`, error);
      return { success: false, error: error.message };
    } finally {
      this._isLoading.set(false);
    }
  }
  
  /**
   * 🔄 Refrescar configuraciones críticas (forzar recarga)
   */
  async refreshCriticalSettings(): Promise<void> {
    try {
      // Limpiar cache de configuraciones críticas
      this.clearCache([
        'bookings_enabled',
        'cancellation_hours_before',
        'bookings_schedule_mode',
        'bookings_close_datetime',
        'bookings_open_datetime'
      ]);

      // Recargar desde BD
      await this.loadCriticalSettings();

      console.log('🔄 Configuraciones críticas refrescadas');
    } catch (error) {
      console.error('❌ Error refrescando configuraciones críticas:', error);
    }
  }
  
  /**
   * ✅ Verificar estado actual de reservas (consulta fresca sin cache)
   * Método específico para verificaciones críticas en tiempo de uso
   * Considera tanto el modo manual como el programado
   */
  async verifyBookingsEnabled(): Promise<boolean> {
    try {
      console.log('🔍 Verificando estado actual de reservas...');

      // Recargar todas las configuraciones críticas desde BD
      await this.refreshCriticalSettings();

      // Evaluar si las reservas deben estar habilitadas según modo y programación
      const isEnabled = this.shouldBookingsBeEnabled();

      const mode = this._bookingsScheduleMode();
      if (mode === 'scheduled') {
        const closeDate = this._bookingsCloseDate();
        const openDate = this._bookingsOpenDate();
        console.log(`📅 Modo programado activo. Cierre: ${closeDate?.toISOString() || 'N/A'}, Apertura: ${openDate?.toISOString() || 'N/A'}`);
      }

      console.log(`✅ Estado de reservas verificado: ${isEnabled ? 'habilitadas' : 'deshabilitadas'}`);
      return isEnabled;

    } catch (error: any) {
      console.error('❌ Error verificando estado de reservas:', error);

      // En caso de error, evaluar con los valores actuales en memoria
      const fallbackValue = this.shouldBookingsBeEnabled();
      console.warn(`🛡️ Usando valor fallback para reservas: ${fallbackValue}`);
      return fallbackValue;
    }
  }
  
  /**
   * 🎛️ Habilitar/deshabilitar reservas (método específico)
   */
  async toggleBookings(enabled: boolean): Promise<{ success: boolean; error?: string }> {
    console.log(`🎛️ ${enabled ? 'Habilitando' : 'Deshabilitando'} sistema de reservas...`);

    const result = await this.updateSetting(
      'bookings_enabled',
      enabled.toString(),
      `Sistema de reservas ${enabled ? 'habilitado' : 'deshabilitado'} por administrador`
    );

    if (result.success) {
      console.log(`✅ Sistema de reservas ${enabled ? 'habilitado' : 'deshabilitado'} exitosamente`);
    }

    return result;
  }

  /**
   * ⏰ Actualizar horas mínimas antes de cancelación (método específico)
   */
  async updateCancellationHours(hours: number): Promise<{ success: boolean; error?: string }> {
    // Validar que las horas sean un número válido y positivo
    if (!Number.isInteger(hours) || hours < 0 || hours > 72) {
      return {
        success: false,
        error: 'Las horas deben ser un número entero entre 0 y 72'
      };
    }

    console.log(`⏰ Actualizando horas mínimas de cancelación a ${hours}...`);

    const result = await this.updateSetting(
      'cancellation_hours_before',
      hours.toString(),
      `Horas mínimas antes de cancelación actualizadas a ${hours} por administrador`
    );

    if (result.success) {
      console.log(`✅ Horas mínimas de cancelación actualizadas a ${hours} exitosamente`);
    }

    return result;
  }
  
  /**
   * 📅 Actualizar programación de reservas
   */
  async updateBookingsSchedule(
    mode: 'manual' | 'scheduled',
    closeDateTime?: Date,
    openDateTime?: Date
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this._isLoading.set(true);
      console.log(`📅 Actualizando programación de reservas a modo: ${mode}`);

      // Validaciones
      if (mode === 'scheduled') {
        if (!closeDateTime || !openDateTime) {
          return {
            success: false,
            error: 'Las fechas de cierre y apertura son requeridas en modo programado'
          };
        }

        const now = new Date();
        if (closeDateTime <= now) {
          return {
            success: false,
            error: 'La fecha de cierre debe ser futura'
          };
        }

        if (openDateTime <= closeDateTime) {
          return {
            success: false,
            error: 'La fecha de apertura debe ser posterior a la fecha de cierre'
          };
        }
      }

      // Actualizar modo
      const modeResult = await this.updateSetting(
        'bookings_schedule_mode',
        mode,
        `Modo de programación: ${mode}`
      );

      if (!modeResult.success) {
        return modeResult;
      }

      // Actualizar fechas si está en modo programado
      if (mode === 'scheduled' && closeDateTime && openDateTime) {
        // 📅 Convertir fechas a ISO string (UTC) para almacenamiento
        // Supabase las interpretará en zona horaria del servidor (México -06)
        const closeISO = closeDateTime.toISOString();
        const openISO = openDateTime.toISOString();

        console.log('📅 Guardando fechas programadas:');
        console.log('   - Cierre (local):', closeDateTime.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
        console.log('   - Cierre (ISO/UTC):', closeISO);
        console.log('   - Apertura (local):', openDateTime.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
        console.log('   - Apertura (ISO/UTC):', openISO);

        const closeResult = await this.updateSetting(
          'bookings_close_datetime',
          closeISO,
          'Fecha y hora de cierre programado'
        );

        if (!closeResult.success) {
          return closeResult;
        }

        const openResult = await this.updateSetting(
          'bookings_open_datetime',
          openISO,
          'Fecha y hora de apertura programada'
        );

        if (!openResult.success) {
          return openResult;
        }
      } else {
        // En modo manual, limpiar las fechas
        await this.updateSetting('bookings_close_datetime', '', 'Fecha de cierre vacía (modo manual)');
        await this.updateSetting('bookings_open_datetime', '', 'Fecha de apertura vacía (modo manual)');
      }

      console.log('✅ Programación de reservas actualizada exitosamente');
      return { success: true };

    } catch (error: any) {
      console.error('❌ Error actualizando programación de reservas:', error);
      return { success: false, error: error.message };
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * 🕒 Verificar si las reservas deberían estar habilitadas según programación
   * Evalúa el modo programado y retorna true si las reservas deben estar activas
   *
   * IMPORTANTE: Las fechas se comparan en la zona horaria local del navegador.
   * JavaScript automáticamente convierte los timestamps de BD a Date objects locales.
   */
  private shouldBookingsBeEnabled(): boolean {
    const mode = this._bookingsScheduleMode();

    // En modo manual, usar el valor del switch
    if (mode === 'manual') {
      return this._bookingsEnabled();
    }

    // En modo programado, evaluar fechas
    const now = new Date();
    const closeDate = this._bookingsCloseDate();
    const openDate = this._bookingsOpenDate();

    // Si no hay fechas configuradas, usar el valor manual
    if (!closeDate || !openDate) {
      console.warn('⚠️ Modo programado activo pero sin fechas configuradas, usando valor manual');
      return this._bookingsEnabled();
    }

    // Log de comparación de fechas para debugging
    console.log('🕒 Evaluando disponibilidad programada:');
    console.log('   - Ahora (local):', now.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
    console.log('   - Cierre (local):', closeDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
    console.log('   - Apertura (local):', openDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));

    // Si estamos entre el cierre y la apertura, las reservas están deshabilitadas
    if (now >= closeDate && now < openDate) {
      console.log('🔒 Reservas CERRADAS (entre cierre y apertura)');
      return false;
    }

    // Si ya pasó la fecha de apertura, las reservas están habilitadas
    if (now >= openDate) {
      console.log('🔓 Reservas ABIERTAS (pasó fecha de apertura)');
      return true;
    }

    // Si aún no llega la fecha de cierre, usar el estado manual actual
    const manualState = this._bookingsEnabled();
    console.log(`⏰ Antes de la fecha de cierre, usando estado manual: ${manualState ? 'ABIERTAS' : 'CERRADAS'}`);
    return manualState;
  }

  /**
   * 📋 Obtener todas las configuraciones (para panel administrativo)
   */
  async getAllSettings(): Promise<AppSetting[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('app_settings')
        .select('*')
        .order('key', { ascending: true });
      
      if (error) throw error;
      
      return data || [];
    } catch (error) {
      console.error('❌ Error obteniendo todas las configuraciones:', error);
      return [];
    }
  }
  
  // 🏃‍♂️ MÉTODOS PRIVADOS DE CACHE
  
  private getCachedValue(key: string): string | null {
    const expiry = this.cacheExpiry.get(key);
    if (!expiry || Date.now() > expiry) {
      // Cache expirado
      this.settingsCache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    
    return this.settingsCache.get(key) || null;
  }
  
  private setCachedValue(key: string, value: string): void {
    this.settingsCache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_DURATION);
  }
  
  private clearCache(keys?: string[]): void {
    if (keys) {
      keys.forEach(key => {
        this.settingsCache.delete(key);
        this.cacheExpiry.delete(key);
      });
    } else {
      this.settingsCache.clear();
      this.cacheExpiry.clear();
    }
  }
}