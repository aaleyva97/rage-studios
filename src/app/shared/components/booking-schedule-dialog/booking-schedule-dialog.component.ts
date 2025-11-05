import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageModule } from 'primeng/message';
import { AppSettingsService } from '../../../core/services/app-settings.service';

interface ScheduleMode {
  label: string;
  value: 'manual' | 'scheduled';
}

@Component({
  selector: 'app-booking-schedule-dialog',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    DatePickerModule,
    SelectButtonModule,
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
  selectedMode = signal<'manual' | 'scheduled'>('manual');
  closeDateTime = signal<Date | null>(null);
  openDateTime = signal<Date | null>(null);
  errorMessage = signal<string>('');
  isSaving = signal<boolean>(false);

  // Mode options for SelectButton
  modeOptions: ScheduleMode[] = [
    { label: 'Manual', value: 'manual' },
    { label: 'Programado', value: 'scheduled' }
  ];

  // DatePicker configuration
  minDate = new Date(); // No permitir fechas pasadas

  constructor() {
    // Cargar configuración actual al inicializar
    this.loadCurrentConfiguration();
  }

  private loadCurrentConfiguration(): void {
    const mode = this.appSettingsService.bookingsScheduleMode();
    const closeDate = this.appSettingsService.bookingsCloseDate();
    const openDate = this.appSettingsService.bookingsOpenDate();

    this.selectedMode.set(mode);
    this.closeDateTime.set(closeDate);
    this.openDateTime.set(openDate);
  }

  onHide(): void {
    this.visibleChange.emit(false);
    this.errorMessage.set('');
  }

  onModeChange(): void {
    // Limpiar error al cambiar de modo
    this.errorMessage.set('');

    // Si cambia a manual, limpiar fechas
    if (this.selectedMode() === 'manual') {
      this.closeDateTime.set(null);
      this.openDateTime.set(null);
    }
  }

  async onSave(): Promise<void> {
    this.errorMessage.set('');

    // Validaciones
    const mode = this.selectedMode();

    if (mode === 'scheduled') {
      const closeDate = this.closeDateTime();
      const openDate = this.openDateTime();

      if (!closeDate || !openDate) {
        this.errorMessage.set('Debes seleccionar ambas fechas para el modo programado');
        return;
      }

      // Validación en zona horaria local (México)
      const now = new Date();
      console.log('📅 Validando fechas programadas:');
      console.log('   - Ahora:', now.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
      console.log('   - Cierre:', closeDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));
      console.log('   - Apertura:', openDate.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));

      if (closeDate <= now) {
        this.errorMessage.set('La fecha de cierre debe ser futura');
        return;
      }

      if (openDate <= closeDate) {
        this.errorMessage.set('La fecha de apertura debe ser posterior a la de cierre');
        return;
      }
    }

    // Guardar configuración
    this.isSaving.set(true);

    try {
      const result = await this.appSettingsService.updateBookingsSchedule(
        mode,
        this.closeDateTime() ?? undefined,
        this.openDateTime() ?? undefined
      );

      if (result.success) {
        // Notificar éxito y cerrar
        this.scheduleUpdated.emit();
        this.onHide();
      } else {
        this.errorMessage.set(result.error || 'Error al guardar la configuración');
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error inesperado al guardar');
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
