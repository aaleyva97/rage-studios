import { Component, signal, inject } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { SupabaseService } from '../../../../core/services/supabase-service';


@Component({
  selector: 'app-admin-layout',
   imports: [
    RouterModule,
    DrawerModule,
    ButtonModule,
    MenuModule,
    CardModule,
    AvatarModule
  ],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss'
})
export class AdminLayout {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  
  sidebarVisible = signal(false);
  isMobile = signal(false);
  currentUser = signal<any>(null);
  
  menuItems: MenuItem[] = [
    {
      label: 'Dashboard',
      icon: 'pi pi-home',
      routerLink: '/admin'
    },
    {
      label: 'Reservas',
      icon: 'pi pi-calendar',
      routerLink: '/admin/reservas'
    },
    {
      label: 'Créditos',
      icon: 'pi pi-wallet',
      disabled: true,
      styleClass: 'menu-item-disabled',
      title: 'Próximamente'
    },
    {
      label: 'Sesiones',
      icon: 'pi pi-clock',
      disabled: true,
      styleClass: 'menu-item-disabled',
      title: 'Próximamente'
    },
    {
      label: 'Coaches',
      icon: 'pi pi-users',
      disabled: true,
      styleClass: 'menu-item-disabled',
      title: 'Próximamente'
    }
  ];
  
  ngOnInit() {
    this.checkScreenSize();
    window.addEventListener('resize', () => this.checkScreenSize());
    
    const user = this.supabaseService.getUser();
    this.currentUser.set(user);
  }
  
  private checkScreenSize() {
    this.isMobile.set(window.innerWidth < 768);
    if (!this.isMobile()) {
      this.sidebarVisible.set(true);
    }
  }
  
  toggleSidebar() {
    this.sidebarVisible.set(!this.sidebarVisible());
  }
  
  getUserDisplayName(): string {
    const user = this.currentUser();
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Administrador';
  }
  
  navigateTo(route: string) {
    this.router.navigate([route]);
    if (this.isMobile()) {
      this.sidebarVisible.set(false);
    }
  }
}