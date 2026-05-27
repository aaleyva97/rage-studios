import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { MessageService, ConfirmationService } from 'primeng/api';
import { BookingService } from '../../../../core/services/booking.service';
import { PaymentService } from '../../../../core/services/payment.service';
import { CreditsService } from '../../../../core/services/credits.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { formatDateForDisplay } from '../../../../core/functions/date-utils';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-my-bookings',
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    PaginatorModule
  ],
  providers: [ConfirmationService],
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
  private notificationService = inject(NotificationService);
  
  bookings = signal<any[]>([]);
  isLoading = signal(true);
  skeletonData = Array(5).fill({});
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  async ngOnInit() {
    await this.loadBookings();
  }
  
  async loadBookings() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    
    if (user) {
      const userBookings = await this.bookingService.getUserBookings(user.id);
      
      // Agregar información de si se puede cancelar y formatear datos
      const bookingsWithCancelInfo = userBookings.map(booking => {
        const isPast = this.isBookingPast(booking.session_date, booking.session_time);
        const isClosed = booking.status === 'closed' || (booking.status === 'active' && isPast);
        return {
          ...booking,
          canCancel: booking.status === 'active' ? this.bookingService.canCancelBooking(booking.session_date, booking.session_time) : false,
          formattedDate: formatDateForDisplay(booking.session_date),
          formattedTime: booking.session_time.substring(0, 5),
          statusLabel: isClosed ? 'Cerrada' : (booking.status === 'active' ? 'Activa' : 'Cancelada'),
          statusSeverity: isClosed ? 'warn' : (booking.status === 'active' ? 'success' : 'danger')
        };
      });
      
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
    
    try {
      // 🚫 1. Cancelar notificaciones programadas ANTES de cancelar reserva
      console.log('🔔 Cancelando notificaciones programadas para reserva:', booking.id);
      await this.notificationService.cancelBookingNotifications(booking.id);
      
    } catch (notificationError) {
      console.warn('⚠️ Error cancelando notificaciones programadas:', notificationError);
      // No bloquear el flujo principal por errores de notificaciones
    }
    
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
      
      // 🔔 2. Programar notificación de confirmación de cancelación
      try {
        console.log('🔔 Programando notificación de cancelación exitosa');
        
        const cancellationBookingData = {
          id: booking.id,
          class_name: booking.coach_name ? `clase con ${booking.coach_name}` : 'tu clase',
          session_date: new Date(booking.session_date).toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric', 
            month: 'long'
          }),
          session_time: booking.session_time,
          user: { full_name: user.user_metadata?.['full_name'] || user.email }
        };
        
        // Crear notificación inmediata de cancelación exitosa
        const scheduleData = {
          booking_id: booking.id,
          user_id: user.id,
          notification_type: 'cancellation_user' as const,
          scheduled_for: new Date().toISOString(),
          status: 'scheduled' as const,
          priority: 4,
          message_payload: await this.buildCancellationPayload(cancellationBookingData),
          delivery_channels: ['push'],
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h expiry
          session_data: {
            originalBookingId: booking.id,
            cancellationType: 'user_self_cancellation',
            refundAmount: booking.credits_used
          }
        };
        
        // Programar la notificación usando Supabase directamente
        const { error } = await this.supabaseService.client
          .from('notification_schedules')
          .insert([scheduleData]);
          
        if (error) {
          console.error('❌ Error programando notificación de cancelación:', error);
        } else {
          console.log('✅ Notificación de cancelación programada exitosamente');
        }
        
      } catch (notificationError) {
        console.warn('⚠️ Error programando notificación de cancelación:', notificationError);
        // No bloquear el flujo - la cancelación ya fue exitosa
      }
      
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

  // Mobile pagination methods
  get paginatedBookings() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.bookings().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }

  formatDateForDisplay = formatDateForDisplay;

  private isBookingPast(bookingDate: string, bookingTime: string): boolean {
    const [year, month, day] = bookingDate.split('-').map(Number);
    const [hours, minutes, seconds] = bookingTime.split(':').map(Number);
    const bookingDateTime = new Date(year, month - 1, day, hours, minutes, seconds || 0);
    return bookingDateTime < new Date();
  }

  private async buildCancellationPayload(bookingData: any): Promise<any> {
    try {
      // Variables para el template de cancelación de usuario
      const variables = {
        user_name: bookingData.user?.full_name || 'Usuario',
        class_name: bookingData.class_name,
        session_date: bookingData.session_date,
        refund_info: `Se han devuelto tus créditos automáticamente.`
      };

      console.log('🏗️ Procesando template de cancelación con variables:', variables);

      // Usar el template processor de Supabase
      const { data, error } = await this.supabaseService.client
        .rpc('process_notification_template', {
          p_template_key: 'cancellation_user_es',
          p_language_code: 'es-MX',
          p_variables: variables
        });

      if (error) {
        console.error('❌ Error procesando template de cancelación:', error);
        // Fallback payload
        return {
          title: 'Reserva cancelada ✅',
          body: `Tu reserva para ${bookingData.class_name} del ${bookingData.session_date} ha sido cancelada exitosamente.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: { 
            bookingId: bookingData.id, 
            type: 'cancellation_user',
            actionUrl: '/account/bookings',
            timestamp: new Date().toISOString()
          }
        };
      }

      return {
        title: data.title,
        body: data.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: { 
          bookingId: bookingData.id, 
          type: 'cancellation_user',
          actionUrl: data.action_url || '/account/bookings',
          timestamp: new Date().toISOString()
        },
        actions: data.action_text ? [{
          action: 'view',
          title: data.action_text
        }] : undefined
      };

    } catch (error) {
      console.error('❌ Error en buildCancellationPayload:', error);
      
      // Fallback básico
      return {
        title: 'Reserva cancelada ✅',
        body: 'Tu reserva ha sido cancelada exitosamente.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: { 
          bookingId: bookingData.id, 
          type: 'cancellation_user',
          actionUrl: '/account/bookings',
          timestamp: new Date().toISOString(),
          fallback: true
        }
      };
    }
  }
}
