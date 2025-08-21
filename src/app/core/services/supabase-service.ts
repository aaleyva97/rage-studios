import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  created_at: string;
  updated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabaseClient: SupabaseClient;
  private currentUser = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUser.asObservable();
  
  constructor() {
    this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
    this.loadUser();
  }

  private async loadUser() {
    const { data: { user } } = await this.supabaseClient.auth.getUser();
    this.currentUser.next(user);
    
    this.supabaseClient.auth.onAuthStateChange((event, session) => {
      this.currentUser.next(session?.user ?? null);
    });
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return data;
  }

  async signUp(email: string, password: string, fullName: string, phone: string) {
    const { data, error } = await this.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone // Respaldo en metadata
        }
      }
    });
    
    if (error) throw error;
    
    if (data.user) {
      // Intentar actualizar perfil con retry logic
      await this.updateProfileWithRetry(data.user.id, { full_name: fullName, phone });
    }
    
    return data;
  }

  private async updateProfileWithRetry(userId: string, updates: Partial<Profile>, maxRetries: number = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Esperar un poco más en cada intento para dar tiempo al trigger
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
        }
        
        const result = await this.updateProfile(userId, updates);
        return result; // Si es exitoso, salir del loop
      } catch (error: any) {
        console.warn(`Profile update attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          // En el último intento, intentar crear el perfil si no existe
          try {
            console.log('Attempting to create profile as fallback...');
            return await this.createProfile(userId, {
              ...updates,
              role: 'user' // Establecer rol por defecto
            });
          } catch (createError: any) {
            console.error('Both update and create profile failed:', createError.message);
            // No lanzar error para no interrumpir el registro
            // El usuario puede completar su perfil después
            return null;
          }
        }
      }
    }
    return null; // En caso de que todos los intentos fallen
  }

  async updateProfile(userId: string, updates: Partial<Profile>) {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .update(updates)
      .eq('id', userId);
    
    if (error) throw error;
    return data;
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) throw error;
    return data as Profile | null;
  }
  
  async createProfile(userId: string, profileData: Partial<Profile>) {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .insert({
        id: userId,
        ...profileData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as Profile;
  }

  async signOut() {
    const { error } = await this.supabaseClient.auth.signOut();
    if (error) throw error;
  }

  getUser() {
    return this.currentUser.value;
  }

  isLoggedIn() {
    return !!this.currentUser.value;
  }


async updatePassword(newPassword: string) {
  return await this.supabaseClient.auth.updateUser({
    password: newPassword
  });
}
}