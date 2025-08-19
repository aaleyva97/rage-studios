import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/pages/landing/landing').then(m => m.Landing)
  },
  { 
    path: 'checkout/:packageId', 
    loadComponent: () => import('./features/checkout/pages/checkout/checkout').then(m => m.Checkout),
    canActivate: [authGuard]
  },
  { 
    path: 'checkout/success', 
    loadComponent: () => import('./features/checkout/pages/success/success').then(m => m.Success),
    canActivate: [authGuard]
  },
  { 
    path: 'checkout/cancel', 
    loadComponent: () => import('./features/checkout/pages/cancel/cancel').then(m => m.Cancel),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
