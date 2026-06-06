import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase-service';

export interface FooterImage {
  id: string;
  image_url: string;
  alt_text: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class FooterService {
  private supabaseService = inject(SupabaseService);

  async getFooterImages(): Promise<FooterImage[]> {
    const { data, error } = await this.supabaseService.client
      .from('footer_images')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data as FooterImage[];
  }

  async updateFooterImage(id: string, imageUrl: string): Promise<FooterImage> {
    const { data, error } = await this.supabaseService.client
      .from('footer_images')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as FooterImage;
  }

  async getFooterTitle(): Promise<string> {
    const { data, error } = await this.supabaseService.client
      .from('app_settings')
      .select('value')
      .eq('key', 'footer_title')
      .maybeSingle();

    if (error) throw error;
    return data?.value ?? "I'M THE FINAL BOSS";
  }

  async updateFooterTitle(title: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('app_settings')
      .update({ value: title, updated_at: new Date().toISOString() })
      .eq('key', 'footer_title');

    if (error) throw error;
  }

  async uploadFooterImage(file: File, orderIndex: number): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `footer-${orderIndex}-${Date.now()}.${ext}`;

    const { error } = await this.supabaseService.client.storage
      .from('Branding')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (error) throw error;
    return this.supabaseService.client.storage
      .from('Branding')
      .getPublicUrl(fileName).data.publicUrl;
  }
}
