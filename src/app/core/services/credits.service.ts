import { Injectable, inject, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { distinctUntilChanged } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase-service';

export interface UserCredits {
  total: number;
  unlimited: boolean;
  batches: any[];
}

@Injectable({
  providedIn: 'root'
})
export class CreditsService {
  private supabaseClient: SupabaseClient | null = null;
  private supabaseService = inject(SupabaseService);
  private isBrowser: boolean;
  
  // Estado global de créditos
  private creditsSubject = new BehaviorSubject<UserCredits>({ total: 0, unlimited: false, batches: [] });
  public credits$ = this.creditsSubject.asObservable();
  
  // Signals para uso en componentes
  public totalCredits = signal(0);
  public isUnlimited = signal(false);
  public isLoading = signal(false);
  
  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
      // Escuchar cambios de usuario, solo si cambia el id
      this.supabaseService.currentUser$
        .pipe(
          distinctUntilChanged((a: any, b: any) => a?.id === b?.id)
        )
        .subscribe((user: any) => {
          if (user && user.id) {
            this.loadUserCredits(user.id);
          } else {
            this.resetCredits();
          }
        });
    }
  }
  
  async loadUserCredits(userId: string) {
    if (!this.isBrowser || !this.supabaseClient) return;
    this.isLoading.set(true);
    try {
      // Obtener todos los lotes de créditos activos
      const { data: batches, error } = await this.supabaseClient
        .from('credit_batches')
        .select('*')
        .eq('user_id', userId)
        .gt('credits_remaining', 0)
        .order('expiration_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      let totalCredits = 0;
      let hasUnlimited = false;
      if (batches && batches.length > 0) {
        for (const batch of batches) {
          // Verificar si el lote está vigente
          if (batch.expiration_date) {
            const expDate = new Date(batch.expiration_date);
            if (expDate < new Date()) {
              continue; // Saltar lotes expirados
            }
          }
          if (batch.is_unlimited) {
            hasUnlimited = true;
            totalCredits = 999999; // Valor simbólico para ilimitado
            break;
          } else {
            totalCredits += batch.credits_remaining;
          }
        }
      }
      this.totalCredits.set(totalCredits);
      this.isUnlimited.set(hasUnlimited);
      const userCredits: UserCredits = {
        total: totalCredits,
        unlimited: hasUnlimited,
        batches: batches || []
      };
      this.creditsSubject.next(userCredits);
    } catch (error) {
      console.error('Error loading credits:', error);
      this.resetCredits();
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private resetCredits() {
    this.totalCredits.set(0);
    this.isUnlimited.set(false);
    this.creditsSubject.next({ total: 0, unlimited: false, batches: [] });
  }
  
  // Método para refrescar créditos manualmente
  async refreshCredits() {
    if (!this.isBrowser || !this.supabaseClient) return;
    const user = this.supabaseService.getUser();
    if (user) {
      await this.loadUserCredits(user.id);
    }
  }
  
  // Método helper para formatear el display de créditos
  getCreditsDisplay(): string {
    if (this.isUnlimited()) {
      return '∞';
    }
    return this.totalCredits().toString();
  }
}