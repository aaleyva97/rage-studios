import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  LOCALE_ID,
  isDevMode,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { AuthRateLimitInterceptor } from './core/interceptors/auth-rate-limit.interceptor';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import Aura from '@primeuix/themes/aura';
import { PRIMENG_SPANISH_LOCALE } from './core/constants/primeng-spanish-locale';

import { routes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { NgxStripeModule } from 'ngx-stripe';
import { environment } from '../environments/environment';
import { provideServiceWorker } from '@angular/service-worker';

// Registrar locale español
registerLocaleData(localeEs, 'es');

// Función para obtener la configuración del Service Worker
function getServiceWorkerProviders() {
  const swConfig = environment.serviceWorker;
  
  if (!swConfig || !swConfig.enabled) {
    console.warn('⚠️ Service Worker is disabled in environment configuration');
    return [];
  }

  console.log('🔧 Service Worker Configuration:', {
    environment: environment.production ? 'production' : 'development',
    enabled: swConfig.enabled,
    script: swConfig.script,
    strategy: swConfig.registrationStrategy
  });

  // Construir opciones con tipos correctos
  const swOptions: any = {
    enabled: swConfig.enabled,
    registrationStrategy: swConfig.registrationStrategy,
    scope: swConfig.scope || '/'
  };

  // Solo añadir updateViaCache si existe y es válido
  if (swConfig.updateViaCache) {
    swOptions.updateViaCache = swConfig.updateViaCache as 'all' | 'imports' | 'none';
  }

  return [
    provideServiceWorker(swConfig.script, swOptions)
  ];
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    provideHttpClient(
      withFetch(),
      withInterceptors([AuthRateLimitInterceptor])
    ),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.my-app-dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng'
          }
        }
      },
      ripple: true,
      translation: PRIMENG_SPANISH_LOCALE
    }),
    importProvidersFrom(
      NgxStripeModule.forRoot(environment.STRIPE_PUBLISHABLE_KEY)
    ),
    { provide: LOCALE_ID, useValue: 'es' },
    MessageService,
    
    // SERVICE WORKER - Ahora lee desde environment
    ...getServiceWorkerProviders()
  ],
};