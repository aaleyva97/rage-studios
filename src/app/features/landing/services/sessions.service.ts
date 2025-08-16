import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

export interface Session {
  id: string;
  day_of_week: number;
  day_name: string;
  class_name: string;
  class_subtitle: string;
  description: string;
  image_url: string;
  duration: string;
  level: string;
  max_spots: number;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionsService {
  private supabaseClient: SupabaseClient;

  constructor() {
    this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
  }

  async getSessions() {
    const { data, error } = await this.supabaseClient
      .from('sessions')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    
    if (error) throw error;
    return data as Session[];
  }

  async getSession(id: string) {
    const { data, error } = await this.supabaseClient
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data as Session;
  }

  async updateSession(id: string, updates: Partial<Session>) {
    const { data, error } = await this.supabaseClient
      .from('sessions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    return data;
  }

  async uploadSessionImage(file: File, fileName: string) {
    const { data, error } = await this.supabaseClient.storage
      .from('sessions')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) throw error;
    return this.getPublicUrl(fileName);
  }

  getPublicUrl(path: string) {
    return this.supabaseClient.storage.from('sessions').getPublicUrl(path).data.publicUrl;
  }
}