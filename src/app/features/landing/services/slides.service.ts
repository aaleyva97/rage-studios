import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase-service';

export interface HeroSlide {
  id: string;
  image_url: string;
  title: string | null;
  description: string | null;
  order_index: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SlidesService {
  private supabaseService = inject(SupabaseService);

  constructor() {
    // Ya no necesitamos crear una instancia independiente
  }

  async getActiveSlides() {
    const { data, error } = await this.supabaseService.client
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true });
    
    if (error) {
      console.error('Error fetching slides:', error);
      return [];
    }
    
    return data as HeroSlide[];
  }

  async getAllSlides() {
    const { data, error } = await this.supabaseService.client
      .from('hero_slides')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching all slides:', error);
      throw error;
    }

    return data as HeroSlide[];
  }

  async getSlide(id: string) {
    const { data, error } = await this.supabaseService.client
      .from('hero_slides')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as HeroSlide;
  }

  async createSlide(slideData: Omit<HeroSlide, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await this.supabaseService.client
      .from('hero_slides')
      .insert([{
        ...slideData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data as HeroSlide;
  }

  async updateSlide(id: string, updates: Partial<HeroSlide>) {
    const { data, error } = await this.supabaseService.client
      .from('hero_slides')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as HeroSlide;
  }

  async deleteSlide(id: string) {
    const { error } = await this.supabaseService.client
      .from('hero_slides')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  }

  async uploadSlideImage(file: File, fileName: string) {
    const { error } = await this.supabaseService.client.storage
      .from('Header Slides')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;
    return this.getPublicUrl(fileName);
  }

  async deleteSlideImage(fileName: string) {
    const { error } = await this.supabaseService.client.storage
      .from('Header Slides')
      .remove([fileName]);

    if (error) throw error;
    return { success: true };
  }

  getPublicUrl(path: string) {
    return this.supabaseService.client.storage.from('Header Slides').getPublicUrl(path).data.publicUrl;
  }
}