import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { signal } from '@angular/core';

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
  status: string;
}

@Injectable({
  providedIn: 'root',
})
export class BookingService {
  private supabaseClient: SupabaseClient;

  // Schedule EXACTO según la tabla de horarios proporcionada
  private schedule: any = {
    monday: [
      { time: '06:00', coach: 'ISIDRO' },
      { time: '07:00', coach: 'ISIDRO' },
      { time: '08:00', coach: 'ISIDRO' },
      { time: '09:00', coach: 'ISIDRO' },
      { time: '10:00', coach: 'ISIDRO' },
      { time: '16:00', coach: 'CRISTIAN' },
      { time: '17:00', coach: 'CRISTIAN' },
      { time: '18:00', coach: 'CRISTIAN' },
      { time: '19:00', coach: 'CRISTIAN' },
      { time: '20:00', coach: 'CRISTIAN' },
    ],
    tuesday: [
      { time: '06:00', coach: 'ISIDRO' },
      { time: '07:00', coach: 'ISIDRO' },
      { time: '08:00', coach: 'ISIDRO' },
      { time: '09:00', coach: 'ISIDRO' },
      { time: '10:00', coach: 'ISIDRO' },
      { time: '16:00', coach: 'CRISTIAN' },
      { time: '17:00', coach: 'CRISTIAN' },
      { time: '18:00', coach: 'CRISTIAN' },
      { time: '19:00', coach: 'CRISTIAN' },
      { time: '20:00', coach: 'CRISTIAN' },
    ],
    wednesday: [
      { time: '06:00', coach: 'ISIDRO' },
      { time: '07:00', coach: 'ISIDRO' },
      { time: '08:00', coach: 'ISIDRO' },
      { time: '09:00', coach: 'ISIDRO' },
      { time: '10:00', coach: 'ISIDRO' },
      { time: '16:00', coach: 'CRISTIAN' },
      { time: '17:00', coach: 'CRISTIAN' },
      { time: '18:00', coach: 'CRISTIAN' },
      { time: '19:00', coach: 'CRISTIAN' },
      { time: '20:00', coach: 'CRISTIAN' },
    ],
    thursday: [
      { time: '06:00', coach: 'ISIDRO' },
      { time: '07:00', coach: 'ISIDRO' },
      { time: '08:00', coach: 'ISIDRO' },
      { time: '09:00', coach: 'ISIDRO' },
      { time: '10:00', coach: 'ISIDRO' },
      { time: '16:00', coach: 'CRISTIAN' },
      { time: '17:00', coach: 'CRISTIAN' },
      { time: '18:00', coach: 'CRISTIAN' },
      { time: '19:00', coach: 'CRISTIAN' },
      { time: '20:00', coach: 'CRISTIAN' },
    ],
    friday: [
      { time: '06:00', coach: 'ISIDRO' },
      { time: '07:00', coach: 'ISIDRO' },
      { time: '08:00', coach: 'ISIDRO' },
      { time: '09:00', coach: 'ISIDRO' },
      { time: '10:00', coach: 'ISIDRO' },
      { time: '16:00', coach: 'CRISTIAN' },
      { time: '17:00', coach: 'CRISTIAN' },
      { time: '18:00', coach: 'CRISTIAN' },
      { time: '19:00', coach: 'CRISTIAN' },
      { time: '20:00', coach: 'CRISTIAN' },
    ],
    saturday: [
      { time: '09:00', coach: 'ISIDRO/CRISTIAN' },
      { time: '10:00', coach: 'ISIDRO/CRISTIAN' },
      { time: '11:00', coach: 'ISIDRO/CRISTIAN' },
      { time: '12:00', coach: 'ISIDRO/CRISTIAN' },
    ],
    sunday: [{ time: '10:00', coach: 'ISIDRO/CRISTIAN' }],
  };

  constructor() {
    this.supabaseClient = createClient(
      environment.SUPABASE_URL,
      environment.SUPABASE_KEY
    );
  }

  getDaySchedule(date: Date | string): TimeSlot[] {
    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    
    let dayIndex: number;
    if (typeof date === 'string') {
      // Parse string date in format YYYY-MM-DD to avoid timezone issues
      const [year, month, day] = date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      dayIndex = localDate.getDay();
    } else {
      dayIndex = date.getDay();
    }
    
    const dayName = dayNames[dayIndex];
    return this.schedule[dayName] || [];
  }

  async getAvailableSlots(date: string): Promise<TimeSlot[]> {
    const daySchedule = this.getDaySchedule(date);

    // Obtener reservas existentes para esa fecha
    const { data: bookings, error } = await this.supabaseClient
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
    const { data, error } = await this.supabaseClient
      .from('bookings')
      .select('bed_numbers')
      .eq('session_date', date)
      .eq('session_time', time)
      .eq('status', 'active');

    if (error || !data) return [];

    // Flatten array de arrays con tipos correctos
    const allBeds: number[] = [];
    data.forEach((booking: { bed_numbers: number[] }) => {
      allBeds.push(...booking.bed_numbers);
    });

    return allBeds;
  }

  async createBooking(
    booking: Booking
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const { data, error } = await this.supabaseClient
        .from('bookings')
        .insert(booking)
        .select()
        .single();

      if (error) throw error;

      return { success: true, data };
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
      const { error } = await this.supabaseClient
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
      const { error } = await this.supabaseClient
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) throw error;
    } catch (error) {
      console.error('Error cancelling booking:', error);
    }
  }

  // Verificar si una reserva puede ser cancelada (12 horas antes)
  canCancelBooking(bookingDate: string, bookingTime: string): boolean {
    const now = new Date();
    const bookingDateTime = new Date(`${bookingDate}T${bookingTime}`);
    const hoursUntilBooking =
      (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntilBooking >= 12;
  }

  // Obtener las reservas del usuario
  async getUserBookings(userId: string): Promise<any[]> {
    const { data, error } = await this.supabaseClient
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true });

    if (error) {
      console.error('Error fetching user bookings:', error);
      return [];
    }

    return data || [];
  }

  // Cancelar reserva y devolver créditos
  async cancelBookingWithRefund(
    bookingId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Obtener la reserva
      const { data: booking, error: bookingError } = await this.supabaseClient
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
        return {
          success: false,
          error: 'No se puede cancelar con menos de 12 horas de anticipación',
        };
      }

      // Cancelar la reserva
      const { error: cancelError } = await this.supabaseClient
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (cancelError) {
        return { success: false, error: 'Error al cancelar la reserva' };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
