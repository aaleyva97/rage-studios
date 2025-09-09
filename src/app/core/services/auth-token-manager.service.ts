import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthTokenManagerService {
  private isBrowser: boolean;
  private readonly TOKEN_REFRESH_COOLDOWN = 60000; // 🔄 INCREASED: 60 segundos (era 30)
  private readonly MAX_CONCURRENT_REFRESHES = 1;
  
  private refreshInProgress = new BehaviorSubject<boolean>(false);
  private lastRefreshTime = 0;
  private activeRefreshPromise: Promise<any> | null = null;
  
  // 🔄 ENHANCED SESSION CACHING
  private sessionCache = {
    session: null as any,
    timestamp: 0,
    ttl: 30000 // 30 segundos de cache
  };
  
  // 🔄 SINGLETON PROMISE PATTERN FOR CONCURRENT REQUESTS
  private static refreshPromiseMap = new Map<string, Promise<any>>();
  
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
   * 🔄 GET CACHED SESSION IF VALID
   */
  getCachedSession(): any | null {
    const now = Date.now();
    if (this.sessionCache.session && (now - this.sessionCache.timestamp) < this.sessionCache.ttl) {
      return this.sessionCache.session;
    }
    return null;
  }
  
  /**
   * 🔄 UPDATE SESSION CACHE
   */
  updateSessionCache(session: any): void {
    this.sessionCache = {
      session,
      timestamp: Date.now(),
      ttl: this.sessionCache.ttl
    };
  }
  
  /**
   * Ejecuta un refresh de token de forma coordinada con cache mejorado
   */
  async executeTokenRefresh<T>(refreshFunction: () => Promise<T>, cacheKey?: string): Promise<T | null> {
    // 🔄 CHECK SINGLETON PROMISE PATTERN
    if (cacheKey && AuthTokenManagerService.refreshPromiseMap.has(cacheKey)) {
      console.log('🔄 Reusing existing refresh promise for key:', cacheKey);
      try {
        return await AuthTokenManagerService.refreshPromiseMap.get(cacheKey)!;
      } catch (error) {
        AuthTokenManagerService.refreshPromiseMap.delete(cacheKey);
        throw error;
      }
    }
    
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
      
      // 🔄 STORE IN SINGLETON MAP IF CACHE KEY PROVIDED
      if (cacheKey) {
        AuthTokenManagerService.refreshPromiseMap.set(cacheKey, this.activeRefreshPromise);
      }
      
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
      
      // 🔄 CLEAN UP SINGLETON MAP
      if (cacheKey) {
        AuthTokenManagerService.refreshPromiseMap.delete(cacheKey);
      }
    }
  }
  
  /**
   * Reset del estado en caso de logout
   */
  reset(): void {
    this.refreshInProgress.next(false);
    this.lastRefreshTime = 0;
    this.activeRefreshPromise = null;
    
    // 🔄 CLEAR SESSION CACHE
    this.sessionCache = {
      session: null,
      timestamp: 0,
      ttl: this.sessionCache.ttl
    };
    
    // 🔄 CLEAR SINGLETON MAP
    AuthTokenManagerService.refreshPromiseMap.clear();
  }
  
  /**
   * Obtiene el estado actual del refresh con información de cache
   */
  getRefreshStatus() {
    const now = Date.now();
    return {
      inProgress: this.refreshInProgress.value,
      lastRefreshTime: this.lastRefreshTime,
      cooldownRemaining: Math.max(0, this.TOKEN_REFRESH_COOLDOWN - (now - this.lastRefreshTime)),
      sessionCached: !!this.sessionCache.session,
      sessionCacheAge: this.sessionCache.session ? now - this.sessionCache.timestamp : null,
      activeSingletonPromises: AuthTokenManagerService.refreshPromiseMap.size
    };
  }
}