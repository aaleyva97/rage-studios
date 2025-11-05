import { Component, signal, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputNumberModule } from 'primeng/inputnumber';
import { Tooltip } from 'primeng/tooltip';
import { Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SupabaseService, AdminStats } from '../../../../core/services/supabase-service';
import { AppSettingsService } from '../../../../core/services/app-settings.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CardModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    ToggleSwitchModule,
    ConfirmDialogModule,
    ToastModule,
    InputNumberModule,
    Tooltip,
    FormsModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  
  currentUser = signal<any>(null);
  adminStats = signal<AdminStats>({
    totalReservas: 0,
    reservasHoy: 0,
    usuariosActivos: 0,
    creditosTotales: 0
  });
  
  loading = signal(true);
  error = signal<string | null>(null);

  // 📝 Input temporal para editar horas de cancelación
  tempCancellationHours = signal<number>(6);
  
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
  
  // 🎛️ GETTERS para configuraciones
  get bookingsEnabled() {
    return this.appSettingsService.bookingsEnabled();
  }

  get cancellationHoursBefore() {
    return this.appSettingsService.cancellationHoursBefore();
  }

  get settingsLoading() {
    return this.appSettingsService.isLoading();
  }

  ngOnInit() {
    const user = this.supabaseService.getUser();
    this.currentUser.set(user);
    this.loadAdminStats();

    // Inicializar el valor temporal con el valor actual
    this.tempCancellationHours.set(this.cancellationHoursBefore);
  }

  /**
   * 🎛️ Toggle del sistema de reservas con confirmación
   */
  async toggleBookings() {
    const currentState = this.bookingsEnabled;
    const action = currentState ? 'deshabilitar' : 'habilitar';
    const actionUpper = currentState ? 'Deshabilitar' : 'Habilitar';
    
    this.confirmationService.confirm({
      message: `¿Estás seguro de que quieres ${action} el sistema de reservas?`,
      header: `${actionUpper} Reservas`,
      icon: currentState ? 'pi pi-exclamation-triangle' : 'pi pi-check-circle',
      acceptLabel: `Sí, ${action}`,
      rejectLabel: 'Cancelar',
      accept: () => this.executeToggleBookings(!currentState)
    });
  }
  
  /**
   * 🔧 Ejecutar el toggle de reservas
   */
  private async executeToggleBookings(enabled: boolean) {
    try {
      const result = await this.appSettingsService.toggleBookings(enabled);

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Sistema de reservas ${enabled ? 'habilitado' : 'deshabilitado'} correctamente`
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result.error || 'Error al actualizar configuración'
        });
      }
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error inesperado al actualizar configuración'
      });
    }
  }

  /**
   * ⏰ Actualizar horas de cancelación con validación
   */
  async updateCancellationHours() {
    const hours = this.tempCancellationHours();

    // Validación básica
    if (hours < 0 || hours > 72) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Valor inválido',
        detail: 'Las horas deben estar entre 0 y 72'
      });
      return;
    }

    if (!Number.isInteger(hours)) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Valor inválido',
        detail: 'Las horas deben ser un número entero'
      });
      return;
    }

    // Confirmar cambio
    this.confirmationService.confirm({
      message: `¿Actualizar el tiempo mínimo de cancelación a ${hours} hora${hours !== 1 ? 's' : ''} antes de la sesión?`,
      header: 'Confirmar Cambio',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, actualizar',
      rejectLabel: 'Cancelar',
      accept: () => this.executeCancellationHoursUpdate(hours)
    });
  }

  /**
   * 🔧 Ejecutar actualización de horas de cancelación
   */
  private async executeCancellationHoursUpdate(hours: number) {
    try {
      const result = await this.appSettingsService.updateCancellationHours(hours);

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Horas de cancelación actualizadas a ${hours} hora${hours !== 1 ? 's' : ''}`
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result.error || 'Error al actualizar configuración'
        });
        // Restaurar valor anterior
        this.tempCancellationHours.set(this.cancellationHoursBefore);
      }
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error inesperado al actualizar configuración'
      });
      // Restaurar valor anterior
      this.tempCancellationHours.set(this.cancellationHoursBefore);
    }
  }
}