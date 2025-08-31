import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

export interface Coach {
  id: string;
  name: string;
  image_url: string;
  description: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class CoachesService {
  private supabaseClient: SupabaseClient;

  constructor() {
    this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
  }

  async getActiveCoaches() {
    const { data, error } = await this.supabaseClient
      .from('coaches')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching coaches:', error);
      return [];
    }
    
    return data as Coach[];
  }

  async getCoach(id: string) {
    const { data, error } = await this.supabaseClient
      .from('coaches')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Coach;
  }

  async getAllCoaches() {
    const { data, error } = await this.supabaseClient
      .from('coaches')
      .select('*')
      .order('order_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching all coaches:', error);
      throw error;
    }
    
    return data as Coach[];
  }

  async createCoach(coachData: Omit<Coach, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await this.supabaseClient
      .from('coaches')
      .insert([{
        ...coachData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data as Coach;
  }

  async updateCoach(id: string, updates: Partial<Coach>) {
    const { data, error } = await this.supabaseClient
      .from('coaches')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data as Coach;
  }

  async deleteCoach(id: string) {
    const { error } = await this.supabaseClient
      .from('coaches')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return { success: true };
  }

  async uploadCoachImage(file: File, fileName: string) {
    const { error } = await this.supabaseClient.storage
      .from('Coaches')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) throw error;
    return this.getPublicUrl(fileName);
  }

  async deleteCoachImage(fileName: string) {
    const { error } = await this.supabaseClient.storage
      .from('Coaches')
      .remove([fileName]);
    
    if (error) throw error;
    return { success: true };
  }

  getPublicUrl(path: string) {
    return this.supabaseClient.storage.from('Coaches').getPublicUrl(path).data.publicUrl;
  }
}