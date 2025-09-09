import { Injectable, inject } from '@angular/core';
import { signal } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface ScheduleSlot {
  id: string;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  max_capacity: number;
  description?: string;
  coaches: Coach[];
}

export interface Coach {
  id: string;
  name: string;
  image_url?: string;
  is_primary: boolean;
}

export interface TimeSlot {
  time: string;
  coach: string;
  available: boolean;
  occupiedBeds: number;
  slot_id?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ScheduleService {
  private supabaseService = inject(SupabaseService);
  private _scheduleCache = signal<ScheduleSlot[]>([]);
  private _lastCacheUpdate = signal<Date | null>(null);
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Ya no necesitamos crear una instancia independiente
  }

  /**
   * Obtiene todos los horarios con sus coaches asignados
   */
  async getAllScheduleSlots(forceRefresh = false): Promise<ScheduleSlot[]> {
    const cachedData = this._scheduleCache();
    const lastUpdate = this._lastCacheUpdate();
    const now = new Date();

    // Usar cache si es válido y no se fuerza el refresh
    if (!forceRefresh && cachedData.length > 0 && lastUpdate) {
      const cacheAge = now.getTime() - lastUpdate.getTime();
      if (cacheAge < this.CACHE_DURATION_MS) {
        return cachedData;
      }
    }

    try {
      const { data, error } = await this.supabaseService.client
        .rpc('get_schedule_slots_with_coaches');

      if (error) throw error;

      const scheduleSlots: ScheduleSlot[] = (data || []).map((row: any) => ({
        id: row.slot_id,
        day_of_week: row.day_of_week,
        day_name: row.day_name,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: row.is_active,
        max_capacity: row.max_capacity,
        description: row.description,
        coaches: row.coaches || []
      }));

      // Actualizar cache
      this._scheduleCache.set(scheduleSlots);
      this._lastCacheUpdate.set(now);

      return scheduleSlots;
    } catch (error) {
      console.error('Error fetching schedule slots:', error);
      return cachedData; // Retornar cache anterior en caso de error
    }
  }

  /**
   * Obtiene horarios para un día específico de la semana
   */
  async getScheduleSlotsForDay(dayOfWeek: number): Promise<ScheduleSlot[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('get_schedule_slots_with_coaches', { target_day_of_week: dayOfWeek });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.slot_id,
        day_of_week: row.day_of_week,
        day_name: row.day_name,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: row.is_active,
        max_capacity: row.max_capacity,
        description: row.description,
        coaches: row.coaches || []
      }));
    } catch (error) {
      console.error('Error fetching schedule slots for day:', error);
      return [];
    }
  }

  /**
   * Convierte ScheduleSlots a TimeSlots compatibles con BookingService
   */
  async getDayScheduleAsTimeSlots(date: Date | string): Promise<TimeSlot[]> {
    let dayIndex: number;
    
    if (typeof date === 'string') {
      const [year, month, day] = date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      dayIndex = localDate.getDay();
    } else {
      dayIndex = date.getDay();
    }

    // Convertir domingo (0) a 7 para match con BD
    const dayOfWeek = dayIndex === 0 ? 7 : dayIndex;
    
    const scheduleSlots = await this.getScheduleSlotsForDay(dayOfWeek);
    
    return this.convertScheduleSlotsToTimeSlots(scheduleSlots);
  }

  /**
   * Convierte ScheduleSlots a formato TimeSlot para retrocompatibilidad
   */
  private convertScheduleSlotsToTimeSlots(scheduleSlots: ScheduleSlot[]): TimeSlot[] {
    const timeSlots: TimeSlot[] = [];

    scheduleSlots.forEach(slot => {
      // Generar slots de 1 hora dentro del rango start_time - end_time
      const startTime = this.parseTime(slot.start_time);
      const endTime = this.parseTime(slot.end_time);
      
      let current = startTime;
      while (current < endTime) {
        const timeStr = this.formatTime(current);
        const coachNames = this.formatCoachNames(slot.coaches);
        
        timeSlots.push({
          time: timeStr,
          coach: coachNames,
          available: true, // Se calculará después con bookings
          occupiedBeds: 0,   // Se calculará después con bookings
          slot_id: slot.id
        });
        
        current += 1; // Incrementar 1 hora
      }
    });

    return timeSlots.sort((a, b) => a.time.localeCompare(b.time));
  }

  /**
   * Formatea nombres de coaches según el formato existente
   */
  private formatCoachNames(coaches: Coach[]): string {
    if (coaches.length === 0) return '';
    if (coaches.length === 1) return coaches[0].name;
    
    // Si hay múltiples coaches, usar formato "COACH1/COACH2"
    const primaryCoach = coaches.find(c => c.is_primary);
    const otherCoaches = coaches.filter(c => !c.is_primary);
    
    if (primaryCoach && otherCoaches.length > 0) {
      return `${primaryCoach.name}/${otherCoaches.map(c => c.name).join('/')}`;
    }
    
    return coaches.map(c => c.name).join('/');
  }

  /**
   * Parse time string "HH:MM" to hours number
   */
  private parseTime(timeStr: string): number {
    const [hours] = timeStr.split(':').map(Number);
    return hours;
  }

  /**
   * Format hours number to "HH:MM" string
   */
  private formatTime(hours: number): string {
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  /**
   * ADMIN: Crear nuevo slot de horario
   */
  async createScheduleSlot(slot: Omit<ScheduleSlot, 'id' | 'coaches'>): Promise<{ success: boolean; error?: string; slot_id?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('create_schedule_slot_admin', {
          p_day_of_week: slot.day_of_week,
          p_day_name: slot.day_name,
          p_start_time: slot.start_time,
          p_end_time: slot.end_time,
          p_is_active: slot.is_active,
          p_max_capacity: slot.max_capacity,
          p_description: slot.description
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        return { success: false, error: result?.error_message || 'Error desconocido' };
      }

      // Invalidar cache
      this._lastCacheUpdate.set(null);

      return { success: true, slot_id: result.slot_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ADMIN: Actualizar slot de horario
   */
  async updateScheduleSlot(slotId: string, updates: Partial<Omit<ScheduleSlot, 'id' | 'coaches'>>): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('update_schedule_slot_admin', {
          p_slot_id: slotId,
          p_day_of_week: updates.day_of_week || null,
          p_day_name: updates.day_name || null,
          p_start_time: updates.start_time || null,
          p_end_time: updates.end_time || null,
          p_is_active: updates.is_active ?? null,
          p_max_capacity: updates.max_capacity || null,
          p_description: updates.description || null
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        return { success: false, error: result?.error_message || 'Error desconocido' };
      }

      // Invalidar cache
      this._lastCacheUpdate.set(null);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ADMIN: Eliminar slot de horario
   */
  async deleteScheduleSlot(slotId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('delete_schedule_slot_admin', {
          p_slot_id: slotId
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        return { success: false, error: result?.error_message || 'Error desconocido' };
      }

      // Invalidar cache
      this._lastCacheUpdate.set(null);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ADMIN: Asignar coach a slot
   */
  async assignCoachToSlot(slotId: string, coachId: string, isPrimary = false): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('assign_coach_to_slot_admin', {
          p_slot_id: slotId,
          p_coach_id: coachId,
          p_is_primary: isPrimary
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        return { success: false, error: result?.error_message || 'Error desconocido' };
      }

      // Invalidar cache
      this._lastCacheUpdate.set(null);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ADMIN: Remover coach de slot
   */
  async removeCoachFromSlot(slotId: string, coachId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('remove_coach_from_slot_admin', {
          p_slot_id: slotId,
          p_coach_id: coachId
        });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        return { success: false, error: result?.error_message || 'Error desconocido' };
      }

      // Invalidar cache
      this._lastCacheUpdate.set(null);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener todos los coaches disponibles
   */
  async getAllCoaches(): Promise<any[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('coaches')
        .select('*')
        .eq('is_active', true)
        .order('order_index');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching coaches:', error);
      return [];
    }
  }

  /**
   * Invalidar cache manualmente
   */
  invalidateCache(): void {
    this._lastCacheUpdate.set(null);
    this._scheduleCache.set([]);
  }

  /**
   * Obtener estado del cache
   */
  get cacheInfo() {
    return {
      hasCache: this._scheduleCache().length > 0,
      lastUpdate: this._lastCacheUpdate(),
      itemCount: this._scheduleCache().length
    };
  }
}