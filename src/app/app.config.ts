import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  LOCALE_ID,
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
    MessageService, // Global MessageService for PrimeNG Toast
    // 🔥 PWA Service Worker - Solo en producción para evitar conflictos con Firebase SW en desarrollo
    // Firebase Messaging SW se registra separadamente en NotificationService
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production, // Solo en producción para evitar conflictos
      registrationStrategy: 'registerWithDelay:30000' // Delay para evitar conflictos
    })
  ],
};
