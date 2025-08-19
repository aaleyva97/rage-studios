import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { StepperModule } from 'primeng/stepper';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputTextModule } from 'primeng/inputtext';
import { BookingService } from '../../../../core/services/booking.service';
import { CreditsService } from '../../../../core/services/credits.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { PaymentService } from '../../../../core/services/payment.service';

@Component({
  selector: 'app-booking-dialog',
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    StepperModule,
    DatePickerModule,
    ButtonModule,
    ToggleSwitchModule,
    InputTextModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './booking-dialog.html',
  styleUrl: './booking-dialog.scss',
})
export class BookingDialog {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  private bookingService = inject(BookingService);
  private creditsService = inject(CreditsService);
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);

  // Estados
  selectedDate = signal<Date | null>(null);
  selectedTime = signal<string | null>(null);
  selectedCoach = signal<string | null>(null);
  selectedBeds = signal<number[]>([]);
  hasCompanions = signal(false);
  companions = signal<string[]>([]);
  newCompanion = '';
  availableSlots = signal<any[]>([]);
  occupiedBeds = signal<number[]>([]);
  isLoading = signal(false);

  // Fecha mínima (hoy)
  minDate = new Date();

  onDateSelect(date: Date) {
    this.selectedDate.set(date);
    this.loadAvailableSlots(date);
    // Reset selecciones
    this.selectedTime.set(null);
    this.selectedBeds.set([]);
  }

  async loadAvailableSlots(date: Date) {
    this.isLoading.set(true);
    const dateStr = date.toISOString().split('T')[0];
    const slots = await this.bookingService.getAvailableSlots(dateStr);
    this.availableSlots.set(slots);
    this.isLoading.set(false);
  }

  selectTimeSlot(slot: any) {
    if (!slot.available) return;

    this.selectedTime.set(slot.time);
    this.selectedCoach.set(slot.coach);
    this.loadOccupiedBeds();
  }

  async loadOccupiedBeds() {
    const date = this.selectedDate();
    const time = this.selectedTime();

    if (!date || !time) return;

    const dateStr = date.toISOString().split('T')[0];
    const occupied = await this.bookingService.getOccupiedBeds(
      dateStr,
      time + ':00'
    );
    this.occupiedBeds.set(occupied);
  }

  toggleBed(bedNumber: number) {
    const current = this.selectedBeds();
    const maxBeds = this.hasCompanions() ? this.companions().length + 1 : 1;

    if (current.includes(bedNumber)) {
      this.selectedBeds.set(current.filter((b) => b !== bedNumber));
    } else if (current.length < maxBeds) {
      this.selectedBeds.set([...current, bedNumber]);
    }
  }

  addCompanion() {
    if (this.newCompanion.trim()) {
      this.companions.set([...this.companions(), this.newCompanion.trim()]);
      this.newCompanion = '';
    }
  }

  removeCompanion(index: number) {
    const current = this.companions();
    this.companions.set(current.filter((_, i) => i !== index));
  }

  closeDialog() {
    this.visibleChange.emit(false);
    this.resetForm();
  }

  private resetForm() {
    this.selectedDate.set(null);
    this.selectedTime.set(null);
    this.selectedCoach.set(null);
    this.selectedBeds.set([]);
    this.hasCompanions.set(false);
    this.companions.set([]);
    this.newCompanion = '';
  }

  async confirmBooking() {
  const date = this.selectedDate();
  const time = this.selectedTime();
  const coach = this.selectedCoach();
  const beds = this.selectedBeds();
  const user = this.supabaseService.getUser();
  
  if (!date || !time || !coach || !user) return;
  
  // Validar créditos disponibles
  const requiredCredits = this.companions().length + 1;
  const availableCredits = this.creditsService.totalCredits();
  
  if (availableCredits < requiredCredits) {
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: `Créditos insuficientes. Necesitas ${requiredCredits} créditos pero solo tienes ${availableCredits}`
    });
    return;
  }
  
  this.isLoading.set(true);
  
  try {
    // Auto-asignar camas si no se seleccionaron
    let finalBeds = beds;
    if (beds.length === 0) {
      finalBeds = await this.autoAssignBeds(requiredCredits);
      if (finalBeds.length < requiredCredits) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No hay suficientes camas disponibles'
        });
        this.isLoading.set(false);
        return;
      }
    }
    
    const booking = {
      user_id: user.id,
      session_date: date.toISOString().split('T')[0],
      session_time: time + ':00',
      coach_name: coach,
      bed_numbers: finalBeds,
      attendees: this.companions(),
      total_attendees: requiredCredits,
      credits_used: requiredCredits,
      status: 'active'
    };
    
    // Crear la reserva
    const result = await this.bookingService.createBooking(booking);
    
    if (result.success && result.data) {
      // Usar los créditos
      const creditResult = await this.paymentService.useCreditsForBooking(
        user.id, 
        requiredCredits,
        result.data.id
      );
      
      if (creditResult.success) {
        // Actualizar la reserva con el batch_id
        if (creditResult.batchId && result.data.id) {
          await this.bookingService.updateBookingBatchId(result.data.id, creditResult.batchId);
        }
        
        // Refrescar créditos
        await this.creditsService.refreshCredits();
        
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Reserva realizada correctamente'
        });
        
        // Cerrar dialog
        this.closeDialog();
      } else {
        // Si falla el uso de créditos, cancelar la reserva
        if (result.data.id) {
          await this.bookingService.cancelBooking(result.data.id);
        }
        
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: creditResult.error || 'Error al procesar los créditos'
        });
      }
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'Error al crear la reserva'
      });
    }
  } catch (error: any) {
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Error inesperado'
    });
  } finally {
    this.isLoading.set(false);
  }
}

private async autoAssignBeds(count: number): Promise<number[]> {
  const occupied = this.occupiedBeds();
  const availableBeds = [];
  
  for (let i = 1; i <= 14; i++) {
    if (!occupied.includes(i)) {
      availableBeds.push(i);
    }
  }
  
  // Retornar los primeros 'count' lugares disponibles
  return availableBeds.slice(0, count);
}

private async updateBookingBatchId(bookingId: string, batchId: string): Promise<void> {
  // Implementar en BookingService
}

private async cancelBooking(bookingId: string): Promise<void> {
  // Implementar en BookingService
}


  private async useCredits(amount: number): Promise<void> {
    // Implementaremos esto cuando tengamos el PaymentService actualizado
    // Por ahora solo lo logueamos
    console.log(`Usando ${amount} créditos`);
  }
}
