import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/pages/landing/landing').then(m => m.Landing)
  },
  { 
    path: 'checkout',
    children: [
      {
        path: 'success',
        loadComponent: () => import('./features/checkout/pages/success/success').then(m => m.Success)
      },
      {
        path: 'cancel',
        loadComponent: () => import('./features/checkout/pages/cancel/cancel').then(m => m.Cancel)
      },
      {
        path: ':packageId',
        loadComponent: () => import('./features/checkout/pages/checkout/checkout').then(m => m.Checkout),
        canActivate: [authGuard]
      }
    ]
  },
  {
    path: 'mi-cuenta',
    loadComponent: () => import('./features/account/layouts/account-layout/account-layout').then(m => m.AccountLayout),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/account/pages/account-dashboard/account-dashboard').then(m => m.AccountDashboard)
      },
      {
        path: 'perfil',
        loadComponent: () => import('./features/account/pages/profile-edit/profile-edit').then(m => m.ProfileEdit)
      },
      {
        path: 'cambiar-contrasena',
        loadComponent: () => import('./features/account/pages/change-password/change-password').then(m => m.ChangePassword)
      },
      {
        path: 'reservas',
        loadComponent: () => import('./features/account/pages/my-bookings/my-bookings').then(m => m.MyBookings)
      }, 
      {
        path: 'historial-creditos',
       loadComponent: () => import('.//features/account/pages/credit-history/credit-history').then(m => m.CreditHistory)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
