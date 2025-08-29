import {
  Component,
  model,
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
import { NotificationService } from '../../../../core/services/notification.service';

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
  visible = model<boolean>(false);

  private bookingService = inject(BookingService);
  private creditsService = inject(CreditsService);
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);
  private notificationService = inject(NotificationService);

  // Estados
  currentStep = signal(1);
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
  
  // 🚨 PROTECCIÓN CRÍTICA CONTRA MÚLTIPLES CLICS
  isBooking = signal(false);

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
    this.visible.set(false);
    this.resetForm();
  }

  // Navegación del Stepper
  nextStep() {
    if (this.currentStep() < 3) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  prevStep() {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  goToStep(step: number) {
    this.currentStep.set(step);
  }

  private resetForm() {
    this.currentStep.set(1);
    this.selectedDate.set(null);
    this.selectedTime.set(null);
    this.selectedCoach.set(null);
    this.selectedBeds.set([]);
    this.hasCompanions.set(false);
    this.companions.set([]);
    this.newCompanion = '';
  }

  async confirmBooking() {
  // 🚨 PROTECCIÓN CRÍTICA: Prevenir múltiples clics
  if (this.isBooking()) {
    console.warn('🚫 Booking already in progress, ignoring click');
    return;
  }

  // Activar estado de reserva
  this.isBooking.set(true);

  try {
    const date = this.selectedDate();
    const time = this.selectedTime();
    const coach = this.selectedCoach();
    const beds = this.selectedBeds();
    const user = this.supabaseService.getUser();
    
    if (!date || !time || !coach || !user) {
      this.isBooking.set(false);
      return;
    }
  
    // Validar créditos disponibles
    const requiredCredits = this.companions().length + 1;
    const availableCredits = this.creditsService.totalCredits();
    
    if (availableCredits < requiredCredits) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: `Créditos insuficientes. Necesitas ${requiredCredits} créditos pero solo tienes ${availableCredits}`
      });
      this.isBooking.set(false);
      return;
    }
    
    this.isLoading.set(true);
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
        
        // 🚨 CRÍTICO: Mostrar éxito inmediatamente, procesar notificaciones en segundo plano
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Reserva realizada correctamente'
        });
        
        // 🚨 CRÍTICO: Cerrar dialog de forma inmediata y robusta
        setTimeout(() => {
          this.closeDialog();
        }, 1000); // Dar tiempo para que el usuario vea el mensaje de éxito
        
        // 🔔 Programar notificaciones push de forma asíncrona (NO BLOQUEA)
        this.scheduleNotificationsInBackground(result.data, booking, user, coach, time);
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
    console.error('❌ Error crítico en confirmBooking:', error);
    this.messageService.add({
      severity: 'error',
      summary: 'Error',
      detail: error.message || 'Error inesperado al procesar la reserva'
    });
  } finally {
    // 🚨 CRÍTICO: Siempre restablecer estado
    this.isBooking.set(false);
    this.isLoading.set(false);
  }
}

/**
 * 🔔 MÉTODO ASÍNCRONO: Procesa notificaciones en segundo plano
 * NO bloquea el flujo principal de reservas
 */
private async scheduleNotificationsInBackground(
  bookingData: any, 
  bookingRequest: any, 
  user: any, 
  coach: string, 
  time: string
): Promise<void> {
  try {
    console.log('🔔 [BACKGROUND] Iniciando programación de notificaciones...');
    
    const bookingWithUserData = {
      ...bookingData,
      ...bookingRequest,
      user: { full_name: user.user_metadata?.['full_name'] || user.email },
      class_name: this.getClassNameForSession(coach, time)
    };
    
    // Timeout de seguridad: máximo 10 segundos para notificaciones
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Notification timeout')), 10000)
    );
    
    const notificationPromise = this.scheduleNotificationsWithRetry(bookingWithUserData);
    
    const notificationResult = await Promise.race([notificationPromise, timeoutPromise]);
    
    if (notificationResult && notificationResult.success) {
      if (notificationResult.count && notificationResult.count > 0) {
        console.log(`✅ [BACKGROUND] ${notificationResult.count} notificaciones programadas exitosamente`);
      } else {
        console.log('ℹ️ [BACKGROUND] Sin notificaciones programadas:', notificationResult.reason);
      }
    } else {
      console.warn('⚠️ [BACKGROUND] Error en notificaciones:', notificationResult?.reason || 'Unknown error');
    }
    
  } catch (error) {
    console.warn('⚠️ [BACKGROUND] Error en notificaciones (no afecta reserva):', error);
    
    // Log del error para debugging pero NO afecta la reserva
    await this.notificationService.logEvent('background_notification_failed', {
      bookingId: bookingData?.id,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }).catch(() => {
      // Incluso si logging falla, no hacer nada - la reserva ya está completa
    });
  }
}

/**
 * 🔔 Programación de notificaciones con reintentos inteligentes
 */
private async scheduleNotificationsWithRetry(bookingData: any): Promise<any> {
  let notificationResult = await this.notificationService.scheduleBookingNotifications(bookingData);
  
  // Si falló por falta de permisos, intentar solicitar permisos UNA VEZ
  if (!notificationResult.success && notificationResult.reason?.includes('Permission:')) {
    console.log('🔔 [BACKGROUND] Solicitando permisos de notificación...');
    
    try {
      // Timeout para solicitud de permisos: máximo 5 segundos
      const permissionPromise = this.notificationService.requestPermissions();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Permission timeout')), 5000)
      );
      
      const permissionResult = await Promise.race([permissionPromise, timeoutPromise]) as any;
      
      if (permissionResult?.granted && permissionResult?.token) {
        console.log('✅ [BACKGROUND] Permisos concedidos, reintentando programación...');
        // Pequeña espera para propagación del token
        await new Promise(resolve => setTimeout(resolve, 100));
        notificationResult = await this.notificationService.scheduleBookingNotifications(bookingData);
      }
    } catch (permissionError) {
      console.warn('⚠️ [BACKGROUND] Error en permisos (timeout o rechazo):', permissionError);
    }
  }
  
  return notificationResult;
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

private getClassNameForSession(coach: string, time: string): string {
  // Mapear horario y coach a nombre de clase
  // Esta lógica se podría mejorar conectando con SessionsService
  const timeHour = parseInt(time.split(':')[0]);
  
  // Incluir coach en el nombre si está disponible
  const coachInfo = coach ? ` con ${coach}` : '';
  
  if (timeHour < 12) {
    return `Sesión Matutina${coachInfo}`;
  } else if (timeHour < 18) {
    return `Sesión Vespertina${coachInfo}`;  
  } else {
    return `Sesión Nocturna${coachInfo}`;
  }
}
}
