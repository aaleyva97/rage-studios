import { Component, signal, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CardModule,
    ButtonModule
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  
  currentUser = signal<any>(null);
  
  adminStats = signal({
    totalReservas: 0,
    reservasHoy: 0,
    usuariosActivos: 0,
    creditosTotales: 0
  });
  
  ngOnInit() {
    const user = this.supabaseService.getUser();
    this.currentUser.set(user);
    this.loadAdminStats();
  }
  
  private loadAdminStats() {
    // Placeholder data - estas llamadas se implementarán cuando se creen las páginas específicas
    this.adminStats.set({
      totalReservas: 156,
      reservasHoy: 8,
      usuariosActivos: 42,
      creditosTotales: 1250
    });
  }
  
  navigateToSection(section: string) {
    this.router.navigate([`/admin/${section}`]);
  }
  
  getUserDisplayName(): string {
    const user = this.currentUser();
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Administrador';
  }
}