import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase-service';

export interface Package {
  id: string;
  title: string;
  classes_count: number | null;
  credits_count: number | null;
  validity_days: number;
  price: number;
  policies: string[];
  order_index: number;
  is_active: boolean;
  is_unlimited: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class PackagesService {
  private supabaseService = inject(SupabaseService);

  constructor() {
    // Ya no necesitamos crear una instancia independiente
  }

  async getActivePackages() {
    const { data, error } = await this.supabaseService.client
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching packages:', error);
      return [];
    }
    
    return data as Package[];
  }

  async getPackage(id: string) {
    const { data, error } = await this.supabaseService.client
      .from('packages')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Package;
  }

  async updatePackage(id: string, updates: Partial<Package>) {
    const { data, error } = await this.supabaseService.client
      .from('packages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    return data;
  }
}