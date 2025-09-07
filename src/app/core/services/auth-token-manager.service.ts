import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthTokenManagerService {
  private isBrowser: boolean;
  private readonly TOKEN_REFRESH_COOLDOWN = 30000; // 30 segundos
  private readonly MAX_CONCURRENT_REFRESHES = 1;
  
  private refreshInProgress = new BehaviorSubject<boolean>(false);
  private lastRefreshTime = 0;
  private activeRefreshPromise: Promise<any> | null = null;
  
  constructor(@Inject(PLATFORM_ID) platformId: Object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }
  
  /**
   * Determina si se puede hacer un refresh de token de forma segura
   */
  canRefreshToken(): boolean {
    if (!this.isBrowser) return false;
    
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastRefreshTime;
    
    // No permitir refresh si hay uno en progreso o si no ha pasado el cooldown
    if (this.refreshInProgress.value || timeSinceLastRefresh < this.TOKEN_REFRESH_COOLDOWN) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Ejecuta un refresh de token de forma coordinada
   */
  async executeTokenRefresh<T>(refreshFunction: () => Promise<T>): Promise<T | null> {
    if (!this.canRefreshToken()) {
      // Si ya hay un refresh en progreso, esperar a que termine
      if (this.activeRefreshPromise) {
        try {
          return await this.activeRefreshPromise;
        } catch (error) {
          console.warn('Waiting for active refresh failed:', error);
          return null;
        }
      }
      return null;
    }
    
    this.refreshInProgress.next(true);
    this.lastRefreshTime = Date.now();
    
    try {
      this.activeRefreshPromise = refreshFunction();
      const result = await this.activeRefreshPromise;
      
      console.log('✅ Token refresh successful');
      return result;
      
    } catch (error: any) {
      console.error('❌ Token refresh failed:', error);
      
      // Manejar específicamente errores de rate limiting
      if (error.status === 429 || error.message?.includes('rate limit')) {
        console.warn('🚦 Rate limit detected, extending cooldown');
        // Extender el cooldown por rate limiting
        this.lastRefreshTime = Date.now();
      }
      
      throw error;
      
    } finally {
      this.refreshInProgress.next(false);
      this.activeRefreshPromise = null;
    }
  }
  
  /**
   * Reset del estado en caso de logout
   */
  reset(): void {
    this.refreshInProgress.next(false);
    this.lastRefreshTime = 0;
    this.activeRefreshPromise = null;
  }
  
  /**
   * Obtiene el estado actual del refresh
   */
  getRefreshStatus() {
    return {
      inProgress: this.refreshInProgress.value,
      lastRefreshTime: this.lastRefreshTime,
      cooldownRemaining: Math.max(0, this.TOKEN_REFRESH_COOLDOWN - (Date.now() - this.lastRefreshTime))
    };
  }
}