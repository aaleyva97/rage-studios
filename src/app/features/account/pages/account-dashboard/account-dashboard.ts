import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';

interface DashboardCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

@Component({
  selector: 'app-account-dashboard',
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './account-dashboard.html',
  styleUrl: './account-dashboard.scss'
})
export class AccountDashboard {
  private router = inject(Router);
  
  cards: DashboardCard[] = [
    {
      title: 'Mi Perfil',
      description: 'Actualiza tu información personal',
      icon: 'pi pi-user',
      route: '/mi-cuenta/perfil',
      color: 'blue'
    },
    {
      title: 'Cambiar Contraseña',
      description: 'Actualiza tu contraseña de acceso',
      icon: 'pi pi-lock',
      route: '/mi-cuenta/cambiar-contrasena',
      color: 'purple'
    },
    {
      title: 'Mis Reservas',
      description: 'Gestiona tus clases reservadas',
      icon: 'pi pi-calendar',
      route: '/mi-cuenta/reservas',
      color: 'green'
    },
    {
      title: 'Historial de Créditos',
      description: 'Revisa tus movimientos de créditos',
      icon: 'pi pi-wallet',
      route: '/mi-cuenta/historial-creditos',
      color: 'orange'
    }
  ];
  
  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}