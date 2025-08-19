import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { BookingService } from '../../../../core/services/booking.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { CreditsService } from '../../../../core/services/credits.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-my-bookings',
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './my-bookings.html',
  styleUrl: './my-bookings.scss'
})
export class MyBookings implements OnInit {
  private bookingService = inject(BookingService);
  private paymentService = inject(PaymentService);
  private supabaseService = inject(SupabaseService);
  private creditsService = inject(CreditsService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  
  bookings = signal<any[]>([]);
  isLoading = signal(true);
  
  async ngOnInit() {
    await this.loadBookings();
  }
  
  async loadBookings() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    
    if (user) {
      const userBookings = await this.bookingService.getUserBookings(user.id);
      
      // Agregar información de si se puede cancelar
      const bookingsWithCancelInfo = userBookings.map(booking => ({
        ...booking,
        canCancel: this.bookingService.canCancelBooking(booking.session_date, booking.session_time),
        formattedDate: new Date(booking.session_date).toLocaleDateString('es-MX'),
        formattedTime: booking.session_time.substring(0, 5)
      }));
      
      this.bookings.set(bookingsWithCancelInfo);
    }
    
    this.isLoading.set(false);
  }
  
  confirmCancelBooking(booking: any) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de cancelar tu reserva del ${booking.formattedDate} a las ${booking.formattedTime}?`,
      header: 'Confirmar Cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.cancelBooking(booking)
    });
  }
  
  async cancelBooking(booking: any) {
    const user = this.supabaseService.getUser();
    if (!user) return;
    
    const result = await this.bookingService.cancelBookingWithRefund(booking.id, user.id);
    
    if (result.success) {
      // Devolver créditos
      await this.paymentService.refundCreditsForBooking(
        user.id,
        booking.id,
        booking.credits_used
      );
      
      // Refrescar créditos
      await this.creditsService.refreshCredits();
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Reserva cancelada y créditos devueltos'
      });
      
      // Recargar bookings
      await this.loadBookings();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la reserva'
      });
    }
  }
}
