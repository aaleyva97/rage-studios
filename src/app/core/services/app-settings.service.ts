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
  private _bookingAvailabilityMode = signal<'available_now' | 'date_range'>('available_now'); // Modo de disponibilidad
  private _bookingDateRangeStart = signal<string | null>(null); // Fecha inicio del rango
  private _bookingDateRangeEnd = signal<string | null>(null); // Fecha fin del rango
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

  get bookingAvailabilityMode() {
    return this._bookingAvailabilityMode.asReadonly();
  }

  get bookingDateRangeStart() {
    return this._bookingDateRangeStart.asReadonly();
  }

  get bookingDateRangeEnd() {
    return this._bookingDateRangeEnd.asReadonly();
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

      const availabilityMode = await this.getSetting('booking_availability_mode');
      if (availabilityMode === 'available_now' || availabilityMode === 'date_range') {
        this._bookingAvailabilityMode.set(availabilityMode);
      }

      const dateRangeStart = await this.getSetting('booking_date_range_start');
      if (dateRangeStart !== null) {
        this._bookingDateRangeStart.set(dateRangeStart);
      }

      const dateRangeEnd = await this.getSetting('booking_date_range_end');
      if (dateRangeEnd !== null) {
        this._bookingDateRangeEnd.set(dateRangeEnd);
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
        'booking_availability_mode',
        'booking_date_range_start',
        'booking_date_range_end'
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
   */
  async verifyBookingsEnabled(): Promise<boolean> {
    try {
      console.log('🔍 Verificando estado actual de reservas...');

      // Consulta directa a BD sin usar cache
      const { data, error } = await this.supabaseService.client
        .from('app_settings')
        .select('value')
        .eq('key', 'bookings_enabled')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No existe la configuración, usar valor por defecto
          console.log('⚠️ Configuración bookings_enabled no encontrada, usando valor por defecto: true');
          return true;
        }
        throw error;
      }

      const isEnabled = data.value === 'true';

      // Actualizar el signal con el valor fresco
      this._bookingsEnabled.set(isEnabled);
      this._lastUpdated.set(new Date());

      // Actualizar cache con el valor fresco
      this.setCachedValue('bookings_enabled', data.value);

      console.log(`✅ Estado de reservas verificado: ${isEnabled ? 'habilitadas' : 'deshabilitadas'}`);
      return isEnabled;

    } catch (error: any) {
      console.error('❌ Error verificando estado de reservas:', error);

      // En caso de error, devolver el valor actual del signal como fallback
      const fallbackValue = this._bookingsEnabled();
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
   * 📅 Actualizar configuración de disponibilidad de fechas para reservas
   */
  async updateBookingAvailability(
    mode: 'available_now' | 'date_range',
    startDate: string | null = null,
    endDate: string | null = null
  ): Promise<{ success: boolean; error?: string }> {
    // Validaciones
    if (mode === 'date_range') {
      if (!startDate || !endDate) {
        return {
          success: false,
          error: 'En modo "Dentro de un intervalo de fechas" debes proporcionar ambas fechas'
        };
      }

      // Validar que la fecha de fin sea posterior a la de inicio
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end <= start) {
        return {
          success: false,
          error: 'La fecha de fin debe ser posterior a la fecha de inicio'
        };
      }
    }

    console.log(`📅 Actualizando configuración de disponibilidad a modo: ${mode}...`);

    try {
      this._isLoading.set(true);

      // Actualizar el modo
      const modeResult = await this.updateSetting(
        'booking_availability_mode',
        mode,
        `Modo de disponibilidad de reservas configurado como ${mode === 'available_now' ? 'disponible ahora' : 'rango de fechas'}`
      );

      if (!modeResult.success) {
        return modeResult;
      }

      // Actualizar fechas
      if (mode === 'date_range' && startDate && endDate) {
        const startResult = await this.updateSetting(
          'booking_date_range_start',
          startDate,
          `Fecha de inicio del rango de disponibilidad: ${startDate}`
        );

        if (!startResult.success) {
          return startResult;
        }

        const endResult = await this.updateSetting(
          'booking_date_range_end',
          endDate,
          `Fecha de fin del rango de disponibilidad: ${endDate}`
        );

        if (!endResult.success) {
          return endResult;
        }
      } else {
        // Si es modo "available_now", limpiar las fechas
        await this.updateSetting(
          'booking_date_range_start',
          '',
          'Rango de fechas no aplica en modo disponible ahora'
        );
        await this.updateSetting(
          'booking_date_range_end',
          '',
          'Rango de fechas no aplica en modo disponible ahora'
        );
      }

      console.log('✅ Configuración de disponibilidad actualizada exitosamente');
      return { success: true };

    } catch (error: any) {
      console.error('❌ Error actualizando configuración de disponibilidad:', error);
      return { success: false, error: error.message };
    } finally {
      this._isLoading.set(false);
    }
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
