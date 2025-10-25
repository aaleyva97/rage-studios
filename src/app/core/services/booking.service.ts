import { Injectable, inject } from '@angular/core';
import { signal } from '@angular/core';
import { ScheduleService } from './schedule.service';
import { SupabaseService } from './supabase-service';
import { AppSettingsService } from './app-settings.service';
import { getTodayLocalYYYYMMDD } from '../functions/date-utils';

export interface TimeSlot {
  time: string;
  coach: string;
  available: boolean;
  occupiedBeds: number;
}

export interface Booking {
  id?: string;
  user_id: string;
  session_date: string;
  session_time: string;
  coach_name: string;
  bed_numbers: number[];
  attendees: string[];
  total_attendees: number;
  credits_used: number;
  credit_batch_id?: string;
  status: string;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  // 🔄 SIGNAL REACTIVO CENTRALIZADO PARA ACTIVE BOOKINGS COUNT
  private _activeBookingsCount = signal(0);
  private _currentUserId: string | null = null;

  // 🔄 NUEVO: Servicio de horarios dinámicos
  private scheduleService = inject(ScheduleService);
  private supabaseService = inject(SupabaseService);
  private appSettingsService = inject(AppSettingsService);

  constructor() {
    // Ya no necesitamos crear una instancia independiente
  }
  
  // 📊 GETTER PÚBLICO PARA ACTIVE BOOKINGS COUNT (READONLY)
  get activeBookingsCount() {
    return this._activeBookingsCount.asReadonly();
  }
  
  // 👤 ESTABLECER USUARIO ACTUAL PARA TRACKING DE RESERVAS
  setCurrentUser(userId: string | null) {
    this._currentUserId = userId;
    if (userId) {
      this.refreshActiveBookingsCount();
    } else {
      this._activeBookingsCount.set(0);
    }
  }
  
  // 🔄 REFRESCAR COUNT DE RESERVAS ACTIVAS
  async refreshActiveBookingsCount(): Promise<void> {
    if (!this._currentUserId) {
      this._activeBookingsCount.set(0);
      return;
    }
    
    try {
      const activeBookings = await this.getUserActiveBookings(this._currentUserId);
      this._activeBookingsCount.set(activeBookings.length);
    } catch (error) {
      console.error('Error refreshing active bookings count:', error);
      // No resetear el count en caso de error para evitar parpadeo en UI
    }
  }

  // 🔄 NUEVO: Obtener horarios dinámicos desde BD
  async getDaySchedule(date: Date | string): Promise<TimeSlot[]> {
    try {
      return await this.scheduleService.getDayScheduleAsTimeSlots(date);
    } catch (error) {
      console.error('Error getting day schedule:', error);
      return [];
    }
  }

  async getAvailableSlots(date: string): Promise<TimeSlot[]> {
    const daySchedule = await this.getDaySchedule(date);

    // Obtener reservas existentes para esa fecha
    const { data: bookings, error } = await this.supabaseService.client
      .from('bookings')
      .select('session_time, bed_numbers')
      .eq('session_date', date)
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching bookings:', error);
      return daySchedule;
    }

    // Calcular disponibilidad
    return daySchedule.map((slot) => {
      const slotBookings =
        bookings?.filter((b) => b.session_time === slot.time + ':00') || [];
      const occupiedBeds = slotBookings.reduce(
        (acc, b) => acc + b.bed_numbers.length,
        0
      );

      return {
        ...slot,
        available: occupiedBeds < 14,
        occupiedBeds,
      };
    });
  }

  async getOccupiedBeds(date: string, time: string): Promise<number[]> {
    try {
      // 🔥 USAR FUNCIÓN SECURITY DEFINER PARA VER TODAS LAS CAMAS OCUPADAS
      const { data, error } = await this.supabaseService.client
        .rpc('get_occupied_beds_public', {
          p_session_date: date,
          p_session_time: time
        });

      if (error) {
        console.error('Error getting occupied beds via function:', error);
        // Fallback a consulta directa (puede estar filtrada por RLS)
        return this.getOccupiedBedsFallback(date, time);
      }

      return Array.isArray(data) ? [...new Set(data)] : [];
    } catch (error) {
      console.error('Error in getOccupiedBeds:', error);
      return this.getOccupiedBedsFallback(date, time);
    }
  }
  
  // 🛡️ FALLBACK: Consulta directa (filtrada por RLS)
  private async getOccupiedBedsFallback(date: string, time: string): Promise<number[]> {
    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('bed_numbers')
      .eq('session_date', date)
      .eq('session_time', time)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    const allBeds: number[] = [];
    data.forEach((booking: { bed_numbers: number[] }) => {
      allBeds.push(...booking.bed_numbers);
    });

    return [...new Set(allBeds)];
  }
  
  // 🔄 MÉTODO OPTIMIZADO: Obtener snapshot fresco con metadatos
  async getOccupiedBedsWithMetadata(date: string, time: string): Promise<{
    beds: number[];
    totalBookings: number;
    lastUpdated: Date;
  }> {
    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('bed_numbers, created_at, updated_at')
      .eq('session_date', date)
      .eq('session_time', time)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });

    if (error || !data) {
      return {
        beds: [],
        totalBookings: 0,
        lastUpdated: new Date()
      };
    }

    const allBeds: number[] = [];
    data.forEach((booking: { bed_numbers: number[] }) => {
      allBeds.push(...booking.bed_numbers);
    });

    return {
      beds: [...new Set(allBeds)],
      totalBookings: data.length,
      lastUpdated: new Date()
    };
  }

  async createBooking(
    booking: Booking
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // 🔥 USAR FUNCIÓN ATÓMICA V2 CON BYPASS RLS  
      const { data, error } = await this.supabaseService.client
        .rpc('create_booking_atomic_v2', {
          p_user_id: booking.user_id,
          p_session_date: booking.session_date,
          p_session_time: booking.session_time,
          p_bed_numbers: booking.bed_numbers,
          p_attendees: booking.attendees || [],
          p_total_attendees: booking.total_attendees,
          p_credits_used: booking.credits_used,
          p_credit_batch_id: booking.credit_batch_id,
          p_coach_name: booking.coach_name
        });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; booking_id?: string };

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 🔄 ACTUALIZAR COUNT DE RESERVAS ACTIVAS AUTOMÁTICAMENTE
      this.refreshActiveBookingsCount();

      return { success: true, data: { id: result.booking_id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Agregar estos métodos nuevos al BookingService
  async updateBookingBatchId(
    bookingId: string,
    batchId: string
  ): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('bookings')
        .update({ credit_batch_id: batchId })
        .eq('id', bookingId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating booking batch ID:', error);
    }
  }

  async cancelBooking(bookingId: string): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;
      
      // 🔄 ACTUALIZAR COUNT DE RESERVAS ACTIVAS AUTOMÁTICAMENTE
      this.refreshActiveBookingsCount();
    } catch (error) {
      console.error('Error cancelling booking:', error);
    }
  }

  // Verificar si una reserva puede ser cancelada (dinámico basado en configuración)
  canCancelBooking(bookingDate: string, bookingTime: string): boolean {
    const now = new Date();

    // ✅ FIX: Create date in LOCAL timezone (Mexico UTC-6) instead of UTC
    // BEFORE: new Date(`${bookingDate}T${bookingTime}`) - WRONG, interprets as UTC
    // AFTER: Parse components and create local date - CORRECT
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [hours, minutes, seconds] = bookingTime.split(':').map(Number);

    const bookingDateTime = new Date(year, month - 1, day, hours, minutes, seconds || 0);

    const hoursUntilBooking =
      (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // 🔄 USAR CONFIGURACIÓN DINÁMICA desde app_settings
    const requiredHoursBefore = this.appSettingsService.cancellationHoursBefore();

    return hoursUntilBooking >= requiredHoursBefore;
  }

  // Obtener las reservas del usuario
  async getUserBookings(userId: string): Promise<any[]> {
    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: false })
      .order('session_time', { ascending: true });

    if (error) {
      console.error('Error fetching user bookings:', error);
      return [];
    }

    return data || [];
  }

  // Obtener reservas activas del usuario desde hoy en adelante
  async getUserActiveBookings(userId: string): Promise<any[]> {
    // ✅ FIX: Use local timezone to get today's date
    // CRITICAL: Prevents timezone bugs in Mexico (UTC-6)
    const today = getTodayLocalYYYYMMDD();

    console.log('📅 [BookingService] Getting active bookings from today (local):', today);

    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true });

    if (error) {
      console.error('Error fetching user active bookings:', error);
      return [];
    }

    return data || [];
  }

  // Obtener reservas activas para una fecha específica
  async getUserBookingsForDate(userId: string, date: string): Promise<any[]> {
    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('session_date', date)
      .order('session_time', { ascending: true });

    if (error) {
      console.error('Error fetching user bookings for date:', error);
      return [];
    }

    return data || [];
  }

  // Obtener todas las fechas que tienen reservas activas para el usuario desde hoy en adelante
  async getUserBookingDates(userId: string): Promise<string[]> {
    // ✅ FIX: Use local timezone to get today's date
    // CRITICAL: Prevents timezone bugs in Mexico (UTC-6)
    const today = getTodayLocalYYYYMMDD();

    console.log('📅 [BookingService] Getting booking dates from today (local):', today);

    const { data, error } = await this.supabaseService.client
      .from('bookings')
      .select('session_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('session_date', today)
      .order('session_date', { ascending: true });

    if (error) {
      console.error('Error fetching user booking dates:', error);
      return [];
    }

    // Eliminar duplicados y retornar solo las fechas únicas
    const uniqueDates = [...new Set(data?.map(booking => booking.session_date) || [])];

    console.log(`📊 [BookingService] Found ${uniqueDates.length} unique booking dates`);

    return uniqueDates;
  }

  // Cancelar reserva y devolver créditos
  async cancelBookingWithRefund(
    bookingId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Obtener la reserva
      const { data: booking, error: bookingError } = await this.supabaseService.client
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .eq('user_id', userId)
        .single();

      if (bookingError || !booking) {
        return { success: false, error: 'Reserva no encontrada' };
      }

      // Verificar si se puede cancelar
      if (!this.canCancelBooking(booking.session_date, booking.session_time)) {
        const requiredHours = this.appSettingsService.cancellationHoursBefore();
        return {
          success: false,
          error: `No se puede cancelar con menos de ${requiredHours} hora${requiredHours !== 1 ? 's' : ''} de anticipación`,
        };
      }

      // Cancelar la reserva
      const { error: cancelError } = await this.supabaseService.client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (cancelError) {
        return { success: false, error: 'Error al cancelar la reserva' };
      }

      // 🔄 ACTUALIZAR COUNT DE RESERVAS ACTIVAS AUTOMÁTICAMENTE
      this.refreshActiveBookingsCount();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Método exclusivo para que administradores cancelen reservas de otros usuarios
  async cancelBookingAsAdmin(
    bookingId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Obtener la reserva sin filtrar por user_id (admin puede cancelar cualquiera)
      const { data: booking, error: bookingError } = await this.supabaseService.client
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return { success: false, error: 'Reserva no encontrada' };
      }

      // Los admins pueden cancelar sin restricción de tiempo
      
      // Cancelar la reserva
      const { error: cancelError } = await this.supabaseService.client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (cancelError) {
        return { success: false, error: 'Error al cancelar la reserva' };
      }

      // Devolver créditos usando la lógica del PaymentService
      try {
        await this.adminRefundCredits(booking.user_id, bookingId, booking.credits_used);
      } catch (refundError) {
        console.error('Error refunding credits:', refundError);
        // No fallar toda la operación si el refund falla
      }

      // 🔄 ACTUALIZAR COUNT DE RESERVAS ACTIVAS AUTOMÁTICAMENTE
      this.refreshActiveBookingsCount();

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Método privado para devolver créditos desde administración
  private async adminRefundCredits(
    userId: string,
    bookingId: string,
    amount: number
  ): Promise<void> {
    // 🔄 NUEVA LÓGICA: Buscar TODOS los registros de créditos usados para esta reserva
    const { data: historyRecords, error: historyError } = await this.supabaseService.client
      .from('credit_history')
      .select('credit_batch_id, amount')
      .eq('booking_id', bookingId)
      .eq('type', 'used')
      .order('created_at', { ascending: true });

    if (historyError || !historyRecords || historyRecords.length === 0) {
      throw new Error('No se encontró el historial de créditos');
    }

    let totalCreditsToRefund = 0;
    const refundPromises: Promise<void>[] = [];

    // 🔄 PROCESAR CADA LOTE DE CRÉDITOS USADO
    for (const historyRecord of historyRecords) {
      const creditsUsedFromBatch = Math.abs(historyRecord.amount); // amount es negativo
      totalCreditsToRefund += creditsUsedFromBatch;

      // Crear promesa para procesar este lote en paralelo
      const refundBatchPromise = async () => {
        // Obtener el batch
        const { data: batch, error: batchError } = await this.supabaseService.client
          .from('credit_batches')
          .select('*')
          .eq('id', historyRecord.credit_batch_id)
          .single();

        if (batchError || !batch) {
          throw new Error(`No se encontró el lote de créditos ${historyRecord.credit_batch_id}`);
        }

        // Verificar si el batch no ha expirado (opcional para admins)
        if (batch.expiration_date) {
          const expDate = new Date(batch.expiration_date);
          if (expDate < new Date()) {
            console.warn(`⚠️ Los créditos del lote ${batch.id} han expirado, pero devolviendo por cancelación administrativa`);
          }
        }

        // Devolver los créditos a este lote específico
        await this.supabaseService.client
          .from('credit_batches')
          .update({
            credits_remaining: batch.credits_remaining + creditsUsedFromBatch,
          })
          .eq('id', batch.id);

        // Registrar en historial la devolución específica de este lote
        await this.supabaseService.client.from('credit_history').insert({
          user_id: userId,
          credit_batch_id: batch.id,
          type: 'refunded',
          amount: creditsUsedFromBatch,
          description: `Créditos devueltos por cancelación administrativa (${creditsUsedFromBatch} de ${historyRecords.length} lotes)`,
          booking_id: bookingId,
        });
      };

      refundPromises.push(refundBatchPromise());
    }

    // Ejecutar todas las devoluciones en paralelo
    await Promise.all(refundPromises);

    // Verificar que se devolvieron todos los créditos esperados
    if (totalCreditsToRefund !== amount) {
      console.warn(`⚠️ [Admin] Se devolvieron ${totalCreditsToRefund} créditos, pero se esperaban ${amount}`);
    }

    console.log(`✅ [Admin] Devolución exitosa: ${totalCreditsToRefund} créditos devueltos a ${historyRecords.length} lotes`);
  }
}
