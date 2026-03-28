import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface Membership {
  id: string;
  client_name: string;
  user_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  user_full_name: string | null;
  schedules: MembershipSchedule[];
}

export interface MembershipSchedule {
  id: string;
  schedule_slot_id: string;
  bed_numbers: number[];
  is_active: boolean;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  slot_is_active: boolean;
}

export interface MembershipReservation {
  membership_id: string;
  client_name: string;
  user_id: string | null;
  user_full_name: string | null;
  schedule_slot_id: string;
  bed_numbers: number[];
  total_attendees: number;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  coach_names: string;
}

export interface UserMembership {
  id: string;
  client_name: string;
  is_active: boolean;
  notes: string | null;
  schedules: {
    id: string;
    bed_numbers: number[];
    is_active: boolean;
    day_name: string;
    start_time: string;
    end_time: string;
  }[];
}

@Injectable({
  providedIn: 'root',
})
export class MembershipService {
  private supabaseService = inject(SupabaseService);
  private _memberships = signal<Membership[]>([]);
  private _userMembership = signal<UserMembership | null>(null);

  get userMembership() {
    return this._userMembership.asReadonly();
  }

  get memberships() {
    return this._memberships.asReadonly();
  }

  async loadMemberships(): Promise<Membership[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('get_memberships_with_schedules');

      if (error) throw error;

      const memberships: Membership[] = data || [];
      this._memberships.set(memberships);
      return memberships;
    } catch (error) {
      console.error('Error loading memberships:', error);
      return [];
    }
  }

  async createMembership(membership: {
    client_name: string;
    user_id?: string | null;
    notes?: string | null;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const user = this.supabaseService.getUser();
      if (!user) return { success: false, error: 'No authenticated user' };

      const { data, error } = await this.supabaseService.client
        .from('memberships')
        .insert({
          client_name: membership.client_name,
          user_id: membership.user_id || null,
          notes: membership.notes || null,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, id: data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async updateMembership(
    membershipId: string,
    updates: {
      client_name?: string;
      user_id?: string | null;
      is_active?: boolean;
      notes?: string | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (updates.client_name !== undefined) updateData.client_name = updates.client_name;
      if (updates.user_id !== undefined) updateData.user_id = updates.user_id;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
      if (updates.notes !== undefined) updateData.notes = updates.notes;

      const { error } = await this.supabaseService.client
        .from('memberships')
        .update(updateData)
        .eq('id', membershipId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async deleteMembership(
    membershipId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabaseService.client
        .from('memberships')
        .delete()
        .eq('id', membershipId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async addSchedule(
    membershipId: string,
    scheduleSlotId: string,
    bedNumbers: number[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate beds are not taken by another membership
      const validation = await this.validateBeds(scheduleSlotId, bedNumbers, membershipId);
      if (!validation.available) {
        return { success: false, error: validation.message };
      }

      const { error } = await this.supabaseService.client
        .from('membership_schedules')
        .insert({
          membership_id: membershipId,
          schedule_slot_id: scheduleSlotId,
          bed_numbers: bedNumbers,
        });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async updateScheduleBeds(
    scheduleId: string,
    membershipId: string,
    scheduleSlotId: string,
    bedNumbers: number[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateBeds(scheduleSlotId, bedNumbers, membershipId);
      if (!validation.available) {
        return { success: false, error: validation.message };
      }

      const { error } = await this.supabaseService.client
        .from('membership_schedules')
        .update({ bed_numbers: bedNumbers })
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async removeSchedule(
    scheduleId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabaseService.client
        .from('membership_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async toggleScheduleActive(
    scheduleId: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabaseService.client
        .from('membership_schedules')
        .update({ is_active: isActive })
        .eq('id', scheduleId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async validateBeds(
    scheduleSlotId: string,
    bedNumbers: number[],
    excludeMembershipId?: string
  ): Promise<{ available: boolean; conflicting_beds: number[]; message?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('validate_membership_beds', {
          p_schedule_slot_id: scheduleSlotId,
          p_bed_numbers: bedNumbers,
          p_exclude_membership_id: excludeMembershipId || null,
        });

      if (error) throw error;

      return {
        available: data.available,
        conflicting_beds: data.conflicting_beds || [],
        message: data.message,
      };
    } catch (error: any) {
      return { available: false, conflicting_beds: [], message: error.message };
    }
  }

  async searchProfiles(searchTerm: string): Promise<{ id: string; full_name: string }[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', `%${searchTerm}%`)
        .limit(10);

      if (error) throw error;

      return (data || []).filter((p: any) => p.full_name);
    } catch (error) {
      console.error('Error searching profiles:', error);
      return [];
    }
  }

  async loadUserMembership(userId: string): Promise<UserMembership | null> {
    try {
      // Step 1: Get the membership
      const { data: membershipData, error: membershipError } = await this.supabaseService.client
        .from('memberships')
        .select('id, client_name, is_active, notes')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membershipData) {
        this._userMembership.set(null);
        return null;
      }

      // Step 2: Get schedules for this membership with slot details
      const { data: schedulesData, error: schedulesError } = await this.supabaseService.client
        .from('membership_schedules')
        .select('id, bed_numbers, is_active, schedule_slot_id')
        .eq('membership_id', membershipData.id)
        .eq('is_active', true);

      if (schedulesError) throw schedulesError;

      // Step 3: Get schedule slot details
      const slotIds = (schedulesData || []).map((s: any) => s.schedule_slot_id);
      let slotsMap: Record<string, any> = {};

      if (slotIds.length > 0) {
        const { data: slotsData, error: slotsError } = await this.supabaseService.client
          .from('schedule_slots')
          .select('id, day_name, start_time, end_time')
          .in('id', slotIds);

        if (!slotsError && slotsData) {
          slotsMap = Object.fromEntries(slotsData.map((s: any) => [s.id, s]));
        }
      }

      const membership: UserMembership = {
        id: membershipData.id,
        client_name: membershipData.client_name,
        is_active: membershipData.is_active,
        notes: membershipData.notes,
        schedules: (schedulesData || []).map((s: any) => {
          const slot = slotsMap[s.schedule_slot_id] || {};
          return {
            id: s.id,
            bed_numbers: s.bed_numbers,
            is_active: s.is_active,
            day_name: slot.day_name || '',
            start_time: slot.start_time || '',
            end_time: slot.end_time || '',
          };
        }),
      };

      this._userMembership.set(membership);
      return membership;
    } catch (error) {
      console.error('Error loading user membership:', error);
      this._userMembership.set(null);
      return null;
    }
  }

  clearUserMembership() {
    this._userMembership.set(null);
  }

  async getMembershipReservationsForDates(
    startDate: string,
    endDate: string
  ): Promise<MembershipReservation[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .rpc('get_membership_reservations_for_dates', {
          p_start_date: startDate,
          p_end_date: endDate,
        });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error loading membership reservations:', error);
      return [];
    }
  }
}
