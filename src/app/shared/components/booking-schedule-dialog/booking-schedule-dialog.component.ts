import { Component, inject, input, output, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageModule } from 'primeng/message';
import { AppSettingsService } from '../../../core/services/app-settings.service';

@Component({
  selector: 'app-booking-schedule-dialog',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    DatePickerModule,
    CheckboxModule,
    ToggleSwitchModule,
    MessageModule
  ],
  templateUrl: './booking-schedule-dialog.component.html',
  styleUrls: ['./booking-schedule-dialog.component.scss']
})
export class BookingScheduleDialogComponent {
  private appSettingsService = inject(AppSettingsService);

  // Inputs
  visible = input.required<boolean>();

  // Outputs
  visibleChange = output<boolean>();
  scheduleUpdated = output<void>();

  // State signals
  isManualControl = signal<boolean>(false); // Por defecto en modo programado
  bookingsEnabled = signal<boolean>(true);
  closeDateTime = signal<Date | null>(null);
  openDateTime = signal<Date | null>(null);
  errorMessage = signal<string>('');
  isSaving = signal<boolean>(false);

  // DatePicker configuration
  minDate = new Date(); // No permitir fechas pasadas

  constructor() {
    // Efecto para recargar configuración cuando se abre el dialog
    effect(() => {
      if (this.visible()) {
        this.loadCurrentConfiguration();
      }
    });
  }

  private loadCurrentConfiguration(): void {
    const mode = this.appSettingsService.bookingsScheduleMode();
    const enabled = this.appSettingsService.bookingsEnabled();
    const closeDate = this.appSettingsService.bookingsCloseDate();
    const openDate = this.appSettingsService.bookingsOpenDate();

    // Lógica inteligente para checkbox:
    // - Si modo actual es 'manual' → Marcar checkbox (muestra switch)
    // - Si modo actual es 'scheduled' → Desmarcar checkbox (muestra fechas)
    // - Si las reservas están habilitadas (no importa el modo) → Por defecto desmarcar
    if (mode === 'manual' && !enabled) {
      // Deshabilitadas por modo manual → Marcar checkbox
      this.isManualControl.set(true);
    } else if (mode === 'scheduled') {
      // Modo programado activo → Desmarcar checkbox
      this.isManualControl.set(false);
    } else {
      // Por defecto (reservas habilitadas) → Desmarcar checkbox
      this.isManualControl.set(false);
    }

    this.bookingsEnabled.set(enabled);
    this.closeDateTime.set(closeDate);
    this.openDateTime.set(openDate);
  }

  onHide(): void {
    this.visibleChange.emit(false);
    this.errorMessage.set('');
  }

  onManualControlChange(): void {
    // Limpiar error al cambiar de modo
    this.errorMessage.set('');

    // Si cambia a manual, limpiar fechas
    if (this.isManualControl()) {
      this.closeDateTime.set(null);
      this.openDateTime.set(null);
    }
  }

  // Verificar si las reservas están cerradas y programadas
  get isScheduledAndClosed(): boolean {
    if (this.isManualControl()) return false;

    const mode = this.appSettingsService.bookingsScheduleMode();
    const enabled = this.appSettingsService.bookingsEnabled();
    const openDate = this.appSettingsService.bookingsOpenDate();

    return mode === 'scheduled' && !enabled && openDate !== null;
  }

  async onSave(): Promise<void> {
    this.errorMessage.set('');
    this.isSaving.set(true);

    try {
      if (this.isManualControl()) {
        // MODO MANUAL: Solo actualizar el switch de habilitado/deshabilitado
        const enabled = this.bookingsEnabled();
        const result = await this.appSettingsService.updateBookingsSchedule(
          'manual',
          undefined,
          undefined
        );

        if (!result.success) {
          this.errorMessage.set(result.error || 'Error al guardar');
          return;
        }

        // Si el modo cambió, actualizar también el estado de habilitado
        const toggleResult = await this.appSettingsService.toggleBookings(enabled);

        if (!toggleResult.success) {
          this.errorMessage.set(toggleResult.error || 'Error al actualizar estado');
          return;
        }

      } else {
        // MODO PROGRAMADO: Validar y guardar fechas
        const closeDate = this.closeDateTime();
        const openDate = this.openDateTime();

        if (!closeDate || !openDate) {
          this.errorMessage.set('Debes seleccionar ambas fechas para el modo programado');
          return;
        }

        // Validación en zona horaria local (México)
        const now = new Date();

        if (closeDate <= now) {
          this.errorMessage.set('La fecha de cierre debe ser futura');
          return;
        }

        if (openDate <= closeDate) {
          this.errorMessage.set('La fecha de apertura debe ser posterior a la de cierre');
          return;
        }

        const result = await this.appSettingsService.updateBookingsSchedule(
          'scheduled',
          closeDate,
          openDate
        );

        if (!result.success) {
          this.errorMessage.set(result.error || 'Error al guardar');
          return;
        }
      }

      // Éxito: notificar y cerrar
      this.scheduleUpdated.emit();
      this.onHide();

    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error inesperado al guardar');
    } finally {
      this.isSaving.set(false);
    }
  }

  // Abrir reservas inmediatamente
  async openNow(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');

    try {
      const result = await this.appSettingsService.openBookingsNow();

      if (result.success) {
        this.scheduleUpdated.emit();
        this.onHide();
      } else {
        this.errorMessage.set(result.error || 'Error al abrir reservas');
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error inesperado');
    } finally {
      this.isSaving.set(false);
    }
  }

  // Helper para formatear fechas de manera legible
  formatDateTime(date: Date | null): string {
    if (!date) return 'No configurada';

    return date.toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}
