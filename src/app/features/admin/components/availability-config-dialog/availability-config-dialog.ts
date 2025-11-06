import { Component, model, signal, inject, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { RadioButtonModule } from 'primeng/radiobutton';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AppSettingsService } from '../../../../core/services/app-settings.service';
import { formatDateToLocalYYYYMMDD, parseLocalDate } from '../../../../core/functions/date-utils';

@Component({
  selector: 'app-availability-config-dialog',
  imports: [
    FormsModule,
    DatePipe,
    DialogModule,
    RadioButtonModule,
    DatePickerModule,
    ButtonModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './availability-config-dialog.html',
  styleUrl: './availability-config-dialog.scss'
})
export class AvailabilityConfigDialog {
  visible = model<boolean>(false);

  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);

  // Estados del formulario
  selectedMode = signal<'available_now' | 'date_range'>('available_now');
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);
  isLoading = signal(false);

  // Fecha mínima para el selector (hoy)
  minDate = new Date();

  constructor() {
    // Cargar configuración actual cuando se abre el dialog
    effect(() => {
      if (this.visible()) {
        this.loadCurrentConfiguration();
      }
    });
  }

  /**
   * Cargar configuración actual desde el servicio
   */
  private loadCurrentConfiguration() {
    const mode = this.appSettingsService.bookingAvailabilityMode();
    this.selectedMode.set(mode);

    const startDateStr = this.appSettingsService.bookingDateRangeStart();
    const endDateStr = this.appSettingsService.bookingDateRangeEnd();

    // ✅ FIX: Usar parseLocalDate para evitar problemas de zona horaria
    if (startDateStr) {
      this.startDate.set(parseLocalDate(startDateStr));
    }

    if (endDateStr) {
      this.endDate.set(parseLocalDate(endDateStr));
    }
  }

  /**
   * Guardar configuración
   */
  async saveConfiguration() {
    // Validaciones
    if (this.selectedMode() === 'date_range') {
      if (!this.startDate() || !this.endDate()) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Validación',
          detail: 'Debes seleccionar ambas fechas para el rango'
        });
        return;
      }

      // Validar que la fecha de fin sea posterior a la de inicio
      if (this.endDate()! <= this.startDate()!) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Validación',
          detail: 'La fecha de fin debe ser posterior a la fecha de inicio'
        });
        return;
      }
    }

    this.isLoading.set(true);

    try {
      const mode = this.selectedMode();
      let startDateStr: string | null = null;
      let endDateStr: string | null = null;

      if (mode === 'date_range' && this.startDate() && this.endDate()) {
        // ✅ FIX: Usar formatDateToLocalYYYYMMDD para evitar bug de zona horaria en México
        // ANTES: .toISOString().split('T')[0] - INCORRECTO (convierte a UTC)
        // AHORA: formatDateToLocalYYYYMMDD() - CORRECTO (usa zona horaria local)
        startDateStr = formatDateToLocalYYYYMMDD(this.startDate()!);
        endDateStr = formatDateToLocalYYYYMMDD(this.endDate()!);
      }

      const result = await this.appSettingsService.updateBookingAvailability(
        mode,
        startDateStr,
        endDateStr
      );

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Configuración de disponibilidad actualizada correctamente'
        });

        // Cerrar dialog después de 1 segundo
        setTimeout(() => {
          this.closeDialog();
        }, 1000);
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
        detail: 'Error inesperado al guardar la configuración'
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Cerrar dialog
   */
  closeDialog() {
    this.visible.set(false);
  }

  /**
   * Verificar si el formulario es válido
   */
  isFormValid(): boolean {
    if (this.selectedMode() === 'available_now') {
      return true;
    }

    if (this.selectedMode() === 'date_range') {
      return this.startDate() !== null && this.endDate() !== null;
    }

    return false;
  }
}
