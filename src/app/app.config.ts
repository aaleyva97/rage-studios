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
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { PRIMENG_SPANISH_LOCALE } from './core/constants/primeng-spanish-locale';

import { routes } from './app.routes';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { NgxStripeModule } from 'ngx-stripe';
import { environment } from '../environments/environment';

// Registrar locale español
registerLocaleData(localeEs, 'es');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
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
    { provide: LOCALE_ID, useValue: 'es' }
  ],
};
