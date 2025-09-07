import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

const AUTH_ENDPOINTS = [
  '/auth/v1/token',
  '/auth/v1/user',
  '/auth/v1/signup',
  '/auth/v1/recover'
];

const RATE_LIMIT_CACHE = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 10; // Máximo 10 requests por minuto por endpoint

export const AuthRateLimitInterceptor: HttpInterceptorFn = (req: HttpRequest<any>, next: HttpHandlerFn): Observable<HttpEvent<any>> => {
  // Solo aplicar a endpoints de autenticación de Supabase
  if (!isAuthRequest(req)) {
    return next(req);
  }
  
  // Verificar rate limiting local antes de enviar la petición
  if (!checkLocalRateLimit(req.url)) {
    console.warn('🚦 Local rate limit exceeded for:', req.url);
    return throwError(() => new Error('Local rate limit exceeded'));
  }
  
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (isRateLimitError(error)) {
        console.error('🚦 Auth rate limit exceeded:', error.url);
        // Marcar endpoint como rate limited temporalmente
        markEndpointRateLimited(req.url);
      }
      return throwError(() => error);
    })
  );
};

function isAuthRequest(req: HttpRequest<any>): boolean {
  return AUTH_ENDPOINTS.some(endpoint => req.url.includes(endpoint));
}

function isRateLimitError(error: any): boolean {
  return error.status === 429 || 
         (error.error && error.error.message?.includes('rate limit')) ||
         (error.message && error.message.includes('rate limit'));
}

function checkLocalRateLimit(url: string): boolean {
  const now = Date.now();
  const key = getEndpointKey(url);
  
  // Limpiar entradas antiguas
  cleanupOldEntries();
  
  // Contar requests en la ventana actual
  const requests = Array.from(RATE_LIMIT_CACHE.entries())
    .filter(([k, timestamp]) => k.startsWith(key) && now - timestamp < RATE_LIMIT_WINDOW)
    .length;
  
  if (requests >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  // Registrar la nueva petición
  RATE_LIMIT_CACHE.set(`${key}_${now}`, now);
  return true;
}

function getEndpointKey(url: string): string {
  const endpoint = AUTH_ENDPOINTS.find(ep => url.includes(ep));
  return endpoint || 'unknown';
}

function markEndpointRateLimited(url: string): void {
  const key = `rate_limited_${getEndpointKey(url)}`;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(key, Date.now().toString());
  }
}

function cleanupOldEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, timestamp] of RATE_LIMIT_CACHE.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => RATE_LIMIT_CACHE.delete(key));
}