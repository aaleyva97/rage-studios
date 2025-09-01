import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

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
       loadComponent: () => import('./features/account/pages/credit-history/credit-history').then(m => m.CreditHistory)
      }
    ]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/layouts/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/pages/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard)
      },
      {
        path: 'reservas',
        loadComponent: () => import('./features/admin/pages/admin-reservas/admin-reservas').then(m => m.AdminReservas)
      },
      {
        path: 'coaches',
        loadComponent: () => import('./features/admin/pages/admin-coaches/admin-coaches').then(m => m.AdminCoaches)
      },
      {
        path: 'sessions',
        loadComponent: () => import('./features/admin/pages/admin-sessions/admin-sessions').then(m => m.AdminSessions)
      },
      {
        path: 'credits',
        loadComponent: () => import('./features/admin/pages/admin-credits/admin-credits').then(m => m.AdminCredits)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
