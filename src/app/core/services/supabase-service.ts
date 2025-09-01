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

export interface UserSearchResult {
  id: string;
  full_name: string;
  phone: string;
  role: string;
}

export interface AdminStats {
  totalReservas: number;
  reservasHoy: number;
  usuariosActivos: number;
  creditosTotales: number;
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

  // Public getter para acceso controlado al client
  get client() {
    return this.supabaseClient;
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

// Admin Statistics Methods
async getAdminStats(): Promise<AdminStats> {
  try {
    const [totalReservas, reservasHoy, usuariosActivos, creditosTotales] = await Promise.all([
      this.getTotalBookings(),
      this.getTodaysBookings(),
      this.getActiveUsers(),
      this.getTotalCredits()
    ]);

    return {
      totalReservas,
      reservasHoy,
      usuariosActivos,
      creditosTotales
    };
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    throw error;
  }
}

private async getTotalBookings(): Promise<number> {
  const { count, error } = await this.supabaseClient
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  
  if (error) throw error;
  return count || 0;
}

private async getTodaysBookings(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  const { count, error } = await this.supabaseClient
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
    .eq('session_date', today);
  
  if (error) throw error;
  return count || 0;
}

private async getActiveUsers(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoString = thirtyDaysAgo.toISOString();

  const { data, error } = await this.supabaseClient
    .from('bookings')
    .select('user_id')
    .gte('created_at', thirtyDaysAgoString);
  
  if (error) throw error;
  
  // Get unique user IDs
  const uniqueUserIds = new Set(data?.map(booking => booking.user_id));
  return uniqueUserIds.size;
}

private async getTotalCredits(): Promise<number> {
  const { data, error } = await this.supabaseClient
    .from('credit_batches')
    .select('credits_remaining')
    .gt('credits_remaining', 0);
  
  if (error) throw error;
  
  // Sum up all remaining credits
  const totalCredits = data?.reduce((sum, batch) => sum + (batch.credits_remaining || 0), 0) || 0;
  return totalCredits;
}

// Admin Bookings Management
async getAdminBookings(startDate: Date, endDate: Date, statusFilter: string = 'all'): Promise<any[]> {
  try {
    const startDateString = startDate.toISOString().split('T')[0];
    const endDateString = endDate.toISOString().split('T')[0];
    
    let query = this.supabaseClient
      .from('bookings')
      .select(`
        *,
        profiles!user_id (
          id,
          full_name,
          phone
        )
      `)
      .gte('session_date', startDateString)
      .lte('session_date', endDateString)
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true });

    // Apply status filter
    if (statusFilter === 'active') {
      query = query.eq('status', 'active');
    } else if (statusFilter === 'cancelled') {
      query = query.eq('status', 'cancelled');
    }
    // 'all' means no additional filter

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
    
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    throw error;
  }
}

async getAllBookingsStats(): Promise<{
  totalBookings: number;
  activeBookings: number;
  cancelledBookings: number;
  totalCreditsUsed: number;
}> {
  try {
    const { data, error } = await this.supabaseClient
      .from('bookings')
      .select('status, credits_used');

    if (error) throw error;

    const stats = {
      totalBookings: data?.length || 0,
      activeBookings: data?.filter(b => b.status === 'active').length || 0,
      cancelledBookings: data?.filter(b => b.status === 'cancelled').length || 0,
      totalCreditsUsed: data?.reduce((sum, b) => sum + (b.credits_used || 0), 0) || 0
    };

    return stats;
  } catch (error) {
    console.error('Error fetching booking stats:', error);
    throw error;
  }
}

// Admin Credits Management
async searchUsers(query: string): Promise<UserSearchResult[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .select('id, full_name, phone, role')
      .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(10)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data as UserSearchResult[] || [];
  } catch (error) {
    console.error('Error searching users:', error);
    throw error;
  }
}

async getAllUsers(): Promise<UserSearchResult[]> {
  try {
    const { data, error } = await this.supabaseClient
      .from('profiles')
      .select('id, full_name, phone, role')
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data as UserSearchResult[] || [];
  } catch (error) {
    console.error('Error fetching all users:', error);
    throw error;
  }
}
}