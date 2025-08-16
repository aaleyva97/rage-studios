import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/pages/landing/landing').then(m => m.Landing)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
