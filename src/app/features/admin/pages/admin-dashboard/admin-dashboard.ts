import { Component, signal, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { Router } from '@angular/router';
import { SupabaseService, AdminStats } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  
  currentUser = signal<any>(null);
  adminStats = signal<AdminStats>({
    totalReservas: 0,
    reservasHoy: 0,
    usuariosActivos: 0,
    creditosTotales: 0
  });
  
  loading = signal(true);
  error = signal<string | null>(null);
  
  ngOnInit() {
    const user = this.supabaseService.getUser();
    this.currentUser.set(user);
    this.loadAdminStats();
  }
  
  private async loadAdminStats() {
    try {
      this.loading.set(true);
      this.error.set(null);
      
      const stats = await this.supabaseService.getAdminStats();
      this.adminStats.set(stats);
      
    } catch (error: any) {
      console.error('Error loading admin stats:', error);
      this.error.set('Error al cargar las estadísticas. Por favor, intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
  
  retryLoadStats() {
    this.loadAdminStats();
  }
  
  navigateToSection(section: string) {
    this.router.navigate([`/admin/${section}`]);
  }
  
  getUserDisplayName(): string {
    const user = this.currentUser();
    return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Administrador';
  }
}