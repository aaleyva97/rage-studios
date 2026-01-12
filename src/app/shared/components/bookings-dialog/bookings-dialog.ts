import { Component, model, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { Tooltip } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { BookingService } from '../../../core/services/booking.service';
import { SupabaseService } from '../../../core/services/supabase-service';
import { PaymentService } from '../../../core/services/payment.service';
import { CreditsService } from '../../../core/services/credits.service';
import { NotificationService } from '../../../core/services/notification.service';
import { formatDateForDisplay, formatDateToLocalYYYYMMDD } from '../../../core/functions/date-utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-bookings-dialog',
  imports: [
    FormsModule,
    DatePipe,
    DialogModule,
    DatePickerModule,
    ButtonModule,
    SkeletonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    Tooltip
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './bookings-dialog.html',
  styleUrl: './bookings-dialog.scss'
})
export class BookingsDialog implements OnInit, OnDestroy {
  visible = model<boolean>(false);

  private bookingService = inject(BookingService);
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private creditsService = inject(CreditsService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private notificationService = inject(NotificationService);

  selectedDate = signal<Date>(new Date());
  bookingsForDate = signal<any[]>([]);
  bookingDates = signal<string[]>([]);
  isLoading = signal(true);
  // Signal para controlar si el calendario está listo (datos cargados)
  calendarReady = signal(false);
  minDate = new Date();

  private authSubscription?: Subscription;
  private currentUserId: string | null = null;

  async ngOnInit() {
    this.authSubscription = this.supabaseService.currentUser$.subscribe(user => {
      this.currentUserId = user?.id || null;
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  async initializeDialogData() {
    if (!this.currentUserId) {
      return;
    }

    await this.loadBookingDates();
    await this.loadBookingsForToday();
  }

  public async openDialog() {
    // Resetear estado del calendario
    this.calendarReady.set(false);
    this.visible.set(true);
    // Pequeño delay para asegurar que el dialog esté montado
    setTimeout(() => {
      this.initializeDialogData();
    }, 50);
  }

  async loadBookingDates() {
    if (!this.currentUserId) {
      this.bookingDates.set([]);
      this.calendarReady.set(true);
      return;
    }

    try {
      const dates = await this.bookingService.getUserBookingDates(this.currentUserId);
      console.log('🔍 [DEBUG] Booking dates loaded:', dates);
      this.bookingDates.set(dates);
      console.log('🔍 [DEBUG] bookingDates signal after set:', this.bookingDates());
      // Marcar calendario como listo DESPUÉS de tener los datos
      this.calendarReady.set(true);
    } catch (error) {
      console.error('Error loading booking dates:', error);
      this.bookingDates.set([]);
      this.calendarReady.set(true);
    }
  }

  async loadBookingsForToday() {
    const today = new Date();
    this.selectedDate.set(today);
    await this.loadBookingsForDate(today);
  }

  async onDateSelect(date: Date) {
    this.selectedDate.set(date);
    await this.loadBookingsForDate(date);
  }

  async loadBookingsForDate(date: Date) {
    this.isLoading.set(true);

    const dateStr = formatDateToLocalYYYYMMDD(date);

    if (!this.currentUserId) {
      this.isLoading.set(false);
      this.bookingsForDate.set([]);
      return;
    }

    try {
      const bookings = await this.bookingService.getUserBookingsForDate(this.currentUserId, dateStr);

      const formattedBookings = bookings.map(booking => ({
        ...booking,
        formattedDate: formatDateForDisplay(booking.session_date),
        formattedTime: booking.session_time.substring(0, 5),
        statusLabel: booking.status === 'active' ? 'Activa' : 'Cancelada',
        statusSeverity: booking.status === 'active' ? 'success' : 'danger',
        canCancel: booking.status === 'active' ? this.bookingService.canCancelBooking(booking.session_date, booking.session_time) : false
      }));

      this.bookingsForDate.set(formattedBookings);
    } catch (error) {
      console.error('Error loading bookings for date:', error);
      this.bookingsForDate.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  closeDialog() {
    this.visible.set(false);
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
      await this.notificationService.cancelBookingNotifications(booking.id);
    } catch (notificationError) {
      console.warn('Error cancelando notificaciones programadas:', notificationError);
    }

    const result = await this.bookingService.cancelBookingWithRefund(booking.id, user.id);

    if (result.success) {
      await this.paymentService.refundCreditsForBooking(
        user.id,
        booking.id,
        booking.credits_used
      );

      await this.creditsService.refreshCredits();

      try {
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

        const scheduleData = {
          booking_id: booking.id,
          user_id: user.id,
          notification_type: 'cancellation_user' as const,
          scheduled_for: new Date().toISOString(),
          status: 'scheduled' as const,
          priority: 4,
          message_payload: await this.buildCancellationPayload(cancellationBookingData),
          delivery_channels: ['push'],
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          session_data: {
            originalBookingId: booking.id,
            cancellationType: 'user_self_cancellation',
            refundAmount: booking.credits_used
          }
        };

        await this.supabaseService.client
          .from('notification_schedules')
          .insert([scheduleData]);

      } catch (notificationError) {
        console.warn('Error programando notificación de cancelación:', notificationError);
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Reserva cancelada y créditos devueltos'
      });

      await this.loadBookingDates();
      await this.loadBookingsForDate(this.selectedDate());
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la reserva'
      });
    }
  }

  private async buildCancellationPayload(bookingData: any): Promise<any> {
    try {
      const variables = {
        user_name: bookingData.user?.full_name || 'Usuario',
        class_name: bookingData.class_name,
        session_date: bookingData.session_date,
        refund_info: `Se han devuelto tus créditos automáticamente.`
      };

      const { data, error } = await this.supabaseService.client
        .rpc('process_notification_template', {
          p_template_key: 'cancellation_user_es',
          p_language_code: 'es-MX',
          p_variables: variables
        });

      if (error) {
        return {
          title: 'Reserva cancelada',
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
      return {
        title: 'Reserva cancelada',
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

  hasBookingOnDate(date: any): boolean {
    if (!date || !date.year || !date.month || !date.day) {
      return false;
    }

    const year = date.year;
    const month = (date.month + 1).toString().padStart(2, '0');
    const day = date.day.toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const hasBooking = this.bookingDates().includes(dateStr);

    // DEBUG: Log solo para el día 16 de enero para no saturar la consola
    if (date.day === 16 && date.month === 0 && date.year === 2026) {
      console.log('🔍 [DEBUG] hasBookingOnDate for 2026-01-16:', {
        dateStr,
        bookingDates: this.bookingDates(),
        hasBooking
      });
    }

    return hasBooking;
  }
}
