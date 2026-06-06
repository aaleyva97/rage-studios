import { Component, signal, inject, viewChild, OnDestroy } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { InputNumberModule } from 'primeng/inputnumber';
import { Router } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SupabaseService, AdminStats } from '../../../../core/services/supabase-service';
import { AppSettingsService } from '../../../../core/services/app-settings.service';
import { FormsModule } from '@angular/forms';
import { AvailabilityConfigDialog } from '../../components/availability-config-dialog/availability-config-dialog';

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
    FormsModule,
    AvailabilityConfigDialog
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard implements OnDestroy {
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);
  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  // ViewChild para el dialog de configuración de disponibilidad
  availabilityDialog = viewChild<AvailabilityConfigDialog>('availabilityDialog');

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

  // 🎨 Color de marca temporal para visualización en tiempo real
  tempBrandingPopColor = signal<string>('#EF4444');
  initialBrandingPopColor = signal<string>('#EF4444');
  
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

  get bookingAvailabilityMode() {
    return this.appSettingsService.bookingAvailabilityMode();
  }

  get bookingDateRangeStart() {
    return this.appSettingsService.bookingDateRangeStart();
  }

  get bookingDateRangeEnd() {
    return this.appSettingsService.bookingDateRangeEnd();
  }

  get brandingPopColor() {
    return this.appSettingsService.brandingPopColor();
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

    // Inicializar el color de marca con el valor actual
    this.tempBrandingPopColor.set(this.brandingPopColor);
    this.initialBrandingPopColor.set(this.brandingPopColor);
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

  /**
   * 📅 Abrir dialog de configuración de disponibilidad
   */
  openAvailabilityDialog() {
    const dialog = this.availabilityDialog();
    if (dialog) {
      dialog.visible.set(true);
    }
  }

  /**
   * 📅 Obtener descripción del modo de disponibilidad actual
   */
  getAvailabilityModeDescription(): string {
    const mode = this.bookingAvailabilityMode;

    if (mode === 'available_now') {
      return 'Disponible desde hoy sin límite';
    } else if (mode === 'date_range') {
      const start = this.bookingDateRangeStart;
      const end = this.bookingDateRangeEnd;

      if (start && end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        return `${startDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${endDate.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
      }
      return 'Rango no configurado';
    }

    return 'No configurado';
  }

  /**
   * 🎨 Cambiar color temporal y aplicar en tiempo real
   */
  onPopColorChange(color: string) {
    this.tempBrandingPopColor.set(color);
    this.appSettingsService.applyBrandingColor(color);
  }

  /**
   * 🎨 Guardar color de marca en base de datos
   */
  async saveBrandingPopColor() {
    const color = this.tempBrandingPopColor();
    try {
      const result = await this.appSettingsService.updateBrandingPopColor(color);
      if (result.success) {
        this.initialBrandingPopColor.set(color);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Color de marca actualizado correctamente'
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result.error || 'Error al guardar el color'
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error inesperado al guardar el color'
      });
    }
  }

  /**
   * 🔄 Revertir cambios no guardados
   */
  ngOnDestroy() {
    if (this.tempBrandingPopColor() !== this.initialBrandingPopColor()) {
      this.appSettingsService.applyBrandingColor(this.initialBrandingPopColor());
    }
  }
}