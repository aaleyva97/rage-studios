import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase-service';

export interface BlacklistEntry {
  id: string;
  user_id: string;
  added_by: string;
  reason: string;
  created_at: string;
  profiles: {
    full_name: string;
    phone: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class BlacklistService {
  private supabaseService = inject(SupabaseService);

  private _isBlacklisted = signal<boolean | null>(null);
  private _checkedUserId = signal<string | null>(null);

  get isBlacklisted() {
    return this._isBlacklisted.asReadonly();
  }

  async checkBlacklistStatus(userId: string): Promise<boolean> {
    if (this._checkedUserId() === userId && this._isBlacklisted() !== null) {
      return this._isBlacklisted()!;
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('user_blacklist')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      const result = !!data;
      this._isBlacklisted.set(result);
      this._checkedUserId.set(userId);
      return result;
    } catch (error) {
      console.error('Error checking blacklist status:', error);
      return false;
    }
  }

  clearCache() {
    this._isBlacklisted.set(null);
    this._checkedUserId.set(null);
  }

  async getBlacklist(): Promise<BlacklistEntry[]> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('user_blacklist')
        .select(`
          id,
          user_id,
          added_by,
          reason,
          created_at,
          profiles!user_blacklist_user_id_fkey (
            full_name,
            phone
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as any[]) || [];
    } catch (error) {
      console.error('Error fetching blacklist:', error);
      throw error;
    }
  }

  async addToBlacklist(userId: string, reason: string): Promise<void> {
    const currentUser = this.supabaseService.getUser();
    if (!currentUser) throw new Error('No admin user found');

    const { error } = await this.supabaseService.client
      .from('user_blacklist')
      .insert({ user_id: userId, added_by: currentUser.id, reason });

    if (error) throw error;

    if (this._checkedUserId() === userId) {
      this._isBlacklisted.set(true);
    }
  }

  async removeFromBlacklist(userId: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('user_blacklist')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    if (this._checkedUserId() === userId) {
      this._isBlacklisted.set(false);
    }
  }
}
