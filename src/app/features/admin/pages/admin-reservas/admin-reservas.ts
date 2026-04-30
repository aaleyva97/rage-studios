import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TabsModule } from 'primeng/tabs';
import { MessageService, ConfirmationService } from 'primeng/api';
import { BookingService } from '../../../../core/services/booking.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { formatDateForDisplay, formatDateToLocalYYYYMMDD } from '../../../../core/functions/date-utils';
import { NotificationService } from '../../../../core/services/notification.service';
import { MembershipService } from '../../../../core/services/membership.service';
import { WaitlistService, WaitlistEntry, WaitlistStatus } from '../../../../core/services/waitlist.service';

interface StatusOption {
  label: string;
  value: string;
}

interface DisplayWaitlistEntry extends WaitlistEntry {
  formattedDate: string;
  formattedTime: string;
  statusLabel: string;
  statusSeverity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  userDisplayName: string;
  canCancel: boolean;
  canPromote: boolean;
}

@Component({
  selector: 'app-admin-reservas',
  imports: [
    FormsModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    PaginatorModule,
    CardModule,
    TooltipModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TabsModule
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-reservas.html',
  styleUrl: './admin-reservas.scss'
})
export class AdminReservas implements OnInit {
  private bookingService = inject(BookingService);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private notificationService = inject(NotificationService);
  private membershipService = inject(MembershipService);
  private waitlistService = inject(WaitlistService);

  bookings = signal<any[]>([]);
  membershipReservations = signal<any[]>([]);
  waitlistEntries = signal<DisplayWaitlistEntry[]>([]);
  isLoading = signal(true);
  isLoadingWaitlist = signal(false);
  skeletonData = Array(8).fill({});

  // Tab activa: '0' = Reservas, '1' = Lista de espera
  activeTab = signal<string>('0');
  waitlistStatusFilter = signal<'all' | WaitlistStatus>('waiting');
  waitlistStatusOptions = [
    { label: 'En espera', value: 'waiting' },
    { label: 'Promovidas', value: 'promoted' },
    { label: 'Falló promoción', value: 'failed_promotion' },
    { label: 'Expiradas', value: 'expired' },
    { label: 'Canceladas', value: 'cancelled' },
    { label: 'Todas', value: 'all' },
  ];
  
  // Filters
  dateRange = signal<Date[] | null>(null);
  selectedStatus = signal<string>('active');
  searchTerm = signal<string>('');
  selectedTime = signal<string>('all');
  availableTimes = signal<{ label: string; value: string; }[]>([]);
  
  // Status options
  statusOptions: StatusOption[] = [
    { label: 'Todas las reservas', value: 'all' },
    { label: 'Solo activas', value: 'active' },
    { label: 'Solo canceladas', value: 'cancelled' }
  ];
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  async ngOnInit() {
    this.setCurrentWeekRange();
    await this.loadBookings();
  }
  
  private setCurrentWeekRange() {
    const today = new Date();
    // Set both start and end date to today
    this.dateRange.set([today, today]);
  }
  
  async loadBookings() {
    const dateRange = this.dateRange();

    // Don't load if we don't have a complete date range
    if (!dateRange || dateRange.length !== 2 || !dateRange[0] || !dateRange[1]) {
      return;
    }

    this.isLoading.set(true);

    try {
      const status = this.selectedStatus();

      const bookings = await this.supabaseService.getAdminBookings(
        dateRange[0],
        dateRange[1],
        status
      );

      // Format booking data for display
      const formattedBookings = bookings.map(booking => ({
        ...booking,
        formattedDate: formatDateForDisplay(booking.session_date),
        formattedTime: booking.session_time.substring(0, 5),
        statusLabel: booking.status === 'active' ? 'Activa' : 'Cancelada',
        statusSeverity: booking.status === 'active' ? 'success' : 'danger',
        canCancel: booking.status === 'active' ? this.bookingService.canCancelBooking(booking.session_date, booking.session_time) : false,
        userDisplayName: booking.profiles?.full_name || booking.profiles?.email?.split('@')[0] || 'Usuario desconocido'
      }));

      this.bookings.set(formattedBookings);

      // Load membership reservations for the same date range
      await this.loadMembershipReservations(dateRange[0], dateRange[1]);

      // Load waitlist entries for the same date range
      await this.loadWaitlistEntries(dateRange[0], dateRange[1]);

      // Load available times based on selected date range
      await this.loadAvailableTimes();

    } catch (error) {
      console.error('Error loading admin bookings:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar las reservas'
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadAvailableTimes() {
    const dateRange = this.dateRange();

    if (!dateRange || !dateRange[0]) {
      this.availableTimes.set([{ label: 'Todas las horas', value: 'all' }]);
      return;
    }

    // Get the day of week from the start date (0 = Sunday, 1 = Monday, etc.)
    const startDate = dateRange[0];
    let dayOfWeek = startDate.getDay();

    // Convert JavaScript day (0-6, Sunday-Saturday) to database day (1-7, Monday-Sunday)
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    try {
      // Query schedule_slots table for times on this day of week
      const { data, error } = await this.supabaseService.client
        .from('schedule_slots')
        .select('start_time, end_time')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time');

      if (error) {
        console.error('Error loading available times:', error);
        this.availableTimes.set([{ label: 'Todas las horas', value: 'all' }]);
        return;
      }

      // Use actual start_time values from schedule slots
      const times = [{ label: 'Todas las horas', value: 'all' }];
      const generatedTimes = new Set<string>();

      if (data && data.length > 0) {
        data.forEach(slot => {
          const timeStr = slot.start_time.substring(0, 5);
          generatedTimes.add(timeStr);
        });

        const sortedTimes = Array.from(generatedTimes).sort();

        sortedTimes.forEach(time => {
          times.push({
            label: time,
            value: time
          });
        });
      }

      this.availableTimes.set(times);

    } catch (error) {
      console.error('Error loading available times:', error);
      this.availableTimes.set([{ label: 'Todas las horas', value: 'all' }]);
    }
  }
  
  onDateRangeChange() {
    const dateRange = this.dateRange();
    
    // Only load bookings if we have a complete date range (start and end dates)
    if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      this.loadBookings();
    }
    // If incomplete range, don't do anything (no error toast)
  }
  
  onStatusChange() {
    this.loadBookings();
  }

  clearFilters() {
    // Reset date to today
    const today = new Date();
    this.dateRange.set([today, today]);

    // Reset status to active
    this.selectedStatus.set('active');

    // Clear search term
    this.searchTerm.set('');

    // Reset time filter
    this.selectedTime.set('all');

    // Reload bookings
    this.loadBookings();
  }
  
  confirmCancelBooking(booking: any) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de cancelar la reserva de ${booking.userDisplayName} del ${booking.formattedDate} a las ${booking.formattedTime}?`,
      header: 'Confirmar Cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.cancelBooking(booking)
    });
  }
  
  async cancelBooking(booking: any) {
    try {
      // 🚫 1. Cancelar notificaciones programadas ANTES de cancelar reserva
      console.log('🔔 [ADMIN] Cancelando notificaciones programadas para reserva:', booking.id);
      await this.notificationService.cancelBookingNotifications(booking.id);
      
    } catch (notificationError) {
      console.warn('⚠️ [ADMIN] Error cancelando notificaciones programadas:', notificationError);
      // No bloquear el flujo principal por errores de notificaciones
    }

    const result = await this.bookingService.cancelBookingAsAdmin(booking.id);
    
    if (result.success) {
      // 🔔 2. Programar notificación administrativa para el usuario afectado
      try {
        console.log('🔔 [ADMIN] Programando notificación de cancelación administrativa');
        
        const adminCancellationData = {
          id: booking.id,
          class_name: booking.coach_name ? `clase con ${booking.coach_name}` : 'tu clase',
          session_date: new Date(booking.session_date).toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric', 
            month: 'long'
          }),
          session_time: booking.session_time,
          reason: 'Por motivos administrativos', // TODO: Permitir razón personalizable
          user: { 
            full_name: booking.userDisplayName || booking.user_name || 'Usuario'
          }
        };
        
        // Crear notificación inmediata de cancelación administrativa
        const scheduleData = {
          booking_id: booking.id,
          user_id: booking.user_id, // ⚠️ CRÍTICO: Notificar al usuario afectado, NO al admin
          notification_type: 'cancellation_admin' as const,
          scheduled_for: new Date().toISOString(),
          status: 'scheduled' as const,
          priority: 5, // Alta prioridad para cancelaciones administrativas
          message_payload: await this.buildAdminCancellationPayload(adminCancellationData),
          delivery_channels: ['push'],
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4h expiry
          session_data: {
            originalBookingId: booking.id,
            cancellationType: 'admin_cancellation',
            cancelledBy: 'admin', // Identificar que fue cancelado por admin
            refundAmount: booking.credits_used,
            adminUserId: this.supabaseService.getUser()?.id
          },
          user_preferences: {
            allow_admin_override: true // Bypass user preferences para notificaciones críticas
          }
        };
        
        // Programar la notificación usando Supabase directamente
        const { error } = await this.supabaseService.client
          .from('notification_schedules')
          .insert([scheduleData]);
          
        if (error) {
          console.error('❌ [ADMIN] Error programando notificación de cancelación:', error);
        } else {
          console.log('✅ [ADMIN] Notificación de cancelación administrativa programada exitosamente');
          
          // Log adicional para auditoría
          await this.notificationService.logInteraction('admin_cancellation_scheduled', {
            bookingId: booking.id,
            affectedUserId: booking.user_id,
            adminUserId: this.supabaseService.getUser()?.id,
            reason: adminCancellationData.reason
          });
        }
        
      } catch (notificationError) {
        console.warn('⚠️ [ADMIN] Error programando notificación de cancelación administrativa:', notificationError);
        // No bloquear el flujo - la cancelación administrativa ya fue exitosa
      }
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Reserva cancelada y créditos devueltos correctamente'
      });
      
      // Reload bookings
      await this.loadBookings();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la reserva'
      });
    }
  }
  
  private async loadMembershipReservations(startDate: Date, endDate: Date) {
    try {
      const startStr = formatDateToLocalYYYYMMDD(startDate);
      const endStr = formatDateToLocalYYYYMMDD(endDate);

      const reservations = await this.membershipService.getMembershipReservationsForDates(startStr, endStr);

      // Generate one entry per matching date in the range
      const formatted: any[] = [];

      const current = new Date(startDate);
      current.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      while (current <= end) {
        let dayOfWeek = current.getDay();
        dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

        const matchingReservations = reservations.filter(
          (r: any) => r.day_of_week === dayOfWeek
        );

        for (const res of matchingReservations) {
          const dateStr = formatDateToLocalYYYYMMDD(current);
          formatted.push({
            ...res,
            id: res.membership_id || '',
            isMembership: true,
            session_date: dateStr,
            formattedDate: formatDateForDisplay(dateStr),
            formattedTime: res.start_time ? res.start_time.substring(0, 5) : '--:--',
            statusLabel: 'Membres\u00eda',
            statusSeverity: 'info',
            canCancel: false,
            userDisplayName: res.user_full_name || res.client_name || 'VIP',
            coach_name: res.coach_names || '',
            credits_used: 0,
            status: 'membership',
            bed_numbers: res.bed_numbers || [],
            total_attendees: res.total_attendees || 0,
          });
        }

        current.setDate(current.getDate() + 1);
      }

      this.membershipReservations.set(formatted);
    } catch (error) {
      console.error('Error loading membership reservations:', error);
      this.membershipReservations.set([]);
    }
  }

  // Filtered bookings + membership reservations (applied at front-end level)
  get filteredBookings() {
    // Merge bookings and membership reservations
    const status = this.selectedStatus();
    let allEntries = [...this.bookings()];

    // Include membership reservations if not filtering by cancelled-only
    if (status !== 'cancelled') {
      allEntries = [...allEntries, ...this.membershipReservations()];
    }

    // Sort by date and time
    allEntries.sort((a, b) => {
      const dateCompare = a.session_date.localeCompare(b.session_date);
      if (dateCompare !== 0) return dateCompare;
      return a.formattedTime.localeCompare(b.formattedTime);
    });

    // Apply search filter by name
    const searchTerm = this.searchTerm().toLowerCase().trim();
    if (searchTerm) {
      allEntries = allEntries.filter(entry =>
        entry.userDisplayName.toLowerCase().includes(searchTerm)
      );
    }

    // Apply time filter
    const selectedTime = this.selectedTime();
    if (selectedTime && selectedTime !== 'all') {
      allEntries = allEntries.filter(entry =>
        entry.formattedTime === selectedTime
      );
    }

    return allEntries;
  }

  getMembershipCount(): number {
    return this.filteredBookings.filter(b => b.isMembership).length;
  }

  // Mobile pagination methods
  get paginatedBookings() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.filteredBookings.slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
  
  // Utility methods (use filteredBookings for display)
  getTotalCreditsUsed(): number {
    return this.filteredBookings.reduce((total, booking) => total + (booking.credits_used || 0), 0);
  }

  getActiveBookingsCount(): number {
    return this.filteredBookings.filter(booking => booking.status === 'active').length;
  }

  getCancelledBookingsCount(): number {
    return this.filteredBookings.filter(booking => booking.status === 'cancelled').length;
  }

  formatDateForDisplay = formatDateForDisplay;

  // ============================================================
  // WAITLIST (admin)
  // ============================================================

  async loadWaitlistEntries(startDate: Date, endDate: Date) {
    this.isLoadingWaitlist.set(true);
    try {
      const startStr = formatDateToLocalYYYYMMDD(startDate);
      const endStr = formatDateToLocalYYYYMMDD(endDate);
      const filter = this.waitlistStatusFilter();

      const entries = await this.waitlistService.getEntriesForDateRange(
        startStr,
        endStr,
        filter
      );

      // Hidratar nombres de usuario en una sola query
      const userIds = Array.from(new Set(entries.map((e) => e.user_id)));
      let nameByUser: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await this.supabaseService.client
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => {
          nameByUser[p.id] =
            p.full_name || p.phone || p.id.substring(0, 8);
        });
      }

      const display: DisplayWaitlistEntry[] = entries.map((e) =>
        this.toDisplayWaitlist(e, nameByUser[e.user_id] || 'Usuario')
      );

      this.waitlistEntries.set(display);
    } catch (error) {
      console.error('Error loading waitlist entries:', error);
      this.waitlistEntries.set([]);
    } finally {
      this.isLoadingWaitlist.set(false);
    }
  }

  private toDisplayWaitlist(
    entry: WaitlistEntry,
    userDisplayName: string
  ): DisplayWaitlistEntry {
    const map: Record<
      WaitlistStatus,
      { label: string; severity: DisplayWaitlistEntry['statusSeverity'] }
    > = {
      waiting: { label: 'En espera', severity: 'warn' },
      promoted: { label: 'Promovida', severity: 'success' },
      expired: { label: 'Expirada', severity: 'secondary' },
      cancelled: { label: 'Cancelada', severity: 'danger' },
      failed_promotion: { label: 'Falló', severity: 'danger' },
    };
    const info = map[entry.status];
    return {
      ...entry,
      formattedDate: formatDateForDisplay(entry.session_date),
      formattedTime: entry.session_time.substring(0, 5),
      statusLabel: info.label,
      statusSeverity: info.severity,
      userDisplayName,
      canCancel: entry.status === 'waiting',
      canPromote: entry.status === 'waiting',
    };
  }

  onWaitlistStatusChange() {
    const range = this.dateRange();
    if (range && range.length === 2 && range[0] && range[1]) {
      this.loadWaitlistEntries(range[0], range[1]);
    }
  }

  confirmCancelWaitlistEntry(entry: DisplayWaitlistEntry) {
    this.confirmationService.confirm({
      message: `¿Cancelar la inscripción de ${entry.userDisplayName} del ${entry.formattedDate} a las ${entry.formattedTime}?`,
      header: 'Confirmar Cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.cancelWaitlistEntry(entry),
    });
  }

  async cancelWaitlistEntry(entry: DisplayWaitlistEntry) {
    const result = await this.waitlistService.cancelWaitlistEntry(entry.id);
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Inscripción cancelada',
        detail: `Inscripción de ${entry.userDisplayName} cancelada.`,
      });
      const range = this.dateRange();
      if (range && range[0] && range[1]) {
        await this.loadWaitlistEntries(range[0], range[1]);
      }
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la inscripción.',
      });
    }
  }

  confirmPromoteWaitlistSlot(entry: DisplayWaitlistEntry) {
    this.confirmationService.confirm({
      message: `Forzar la promoción del waitlist para ${entry.formattedDate} a las ${entry.formattedTime}? Se intentará promover en orden FIFO a quienes quepan en la capacidad libre.`,
      header: 'Forzar promoción',
      icon: 'pi pi-bolt',
      acceptLabel: 'Sí, promover',
      rejectLabel: 'No',
      accept: () => this.promoteWaitlistSlot(entry),
    });
  }

  async promoteWaitlistSlot(entry: DisplayWaitlistEntry) {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'promote_waitlist_for_session',
        {
          p_session_date: entry.session_date,
          p_session_time: entry.session_time,
        }
      );

      if (error) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Error al promover',
        });
        return;
      }

      const result: any = data;
      if (result?.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Promoción ejecutada',
          detail: `Promovidas: ${result.promoted_count}, falladas: ${result.failed_count}, omitidas: ${result.skipped_count}.`,
          life: 6000,
        });
        const range = this.dateRange();
        if (range && range[0] && range[1]) {
          await this.loadBookings();
        }
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: 'Sin promoción',
          detail: result?.error || 'No se promovieron entradas.',
        });
      }
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.message || 'Error inesperado al promover',
      });
    }
  }

  // Conteos para summary cards de waitlist
  getWaitlistCount(status: WaitlistStatus | 'all'): number {
    const entries = this.waitlistEntries();
    if (status === 'all') return entries.length;
    return entries.filter((e) => e.status === status).length;
  }

  private async buildAdminCancellationPayload(bookingData: any): Promise<any> {
    try {
      // Variables para el template de cancelación administrativa
      const variables = {
        user_name: bookingData.user?.full_name || 'Usuario',
        class_name: bookingData.class_name,
        session_date: bookingData.session_date,
        reason: bookingData.reason || 'Por decisión administrativa'
      };

      console.log('🏗️ [ADMIN] Procesando template de cancelación administrativa con variables:', variables);

      // Usar el template processor de Supabase para cancelación administrativa
      const { data, error } = await this.supabaseService.client
        .rpc('process_notification_template', {
          p_template_key: 'cancellation_admin_es',
          p_language_code: 'es-MX',
          p_variables: variables
        });

      if (error) {
        console.error('❌ [ADMIN] Error procesando template de cancelación administrativa:', error);
        // Fallback payload para cancelación administrativa
        return {
          title: 'Cambio en tu reserva 📋',
          body: `Tu reserva para ${bookingData.class_name} del ${bookingData.session_date} ha sido cancelada por administración. ${bookingData.reason}. Se han reembolsado automáticamente tus créditos.`,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: { 
            bookingId: bookingData.id, 
            type: 'cancellation_admin',
            actionUrl: '/account/bookings',
            timestamp: new Date().toISOString(),
            reason: bookingData.reason,
            isAdminCancellation: true
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
          type: 'cancellation_admin',
          actionUrl: data.action_url || '/account/bookings',
          timestamp: new Date().toISOString(),
          reason: bookingData.reason,
          isAdminCancellation: true
        },
        actions: data.action_text ? [{
          action: 'view',
          title: data.action_text
        }] : [{
          action: 'view',
          title: 'Ver mis reservas'
        }]
      };

    } catch (error) {
      console.error('❌ [ADMIN] Error en buildAdminCancellationPayload:', error);
      
      // Fallback básico para cancelación administrativa
      return {
        title: 'Cambio en tu reserva 📋',
        body: 'Tu reserva ha sido cancelada por administración. Se han reembolsado automáticamente tus créditos.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: { 
          bookingId: bookingData.id, 
          type: 'cancellation_admin',
          actionUrl: '/account/bookings',
          timestamp: new Date().toISOString(),
          fallback: true,
          isAdminCancellation: true
        }
      };
    }
  }
}