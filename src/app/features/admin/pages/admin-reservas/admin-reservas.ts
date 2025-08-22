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
import { MessageService, ConfirmationService } from 'primeng/api';
import { BookingService } from '../../../../core/services/booking.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

interface StatusOption {
  label: string;
  value: string;
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
    TooltipModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-reservas.html',
  styleUrl: './admin-reservas.scss'
})
export class AdminReservas implements OnInit {
  private bookingService = inject(BookingService);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  
  bookings = signal<any[]>([]);
  isLoading = signal(true);
  skeletonData = Array(8).fill({});
  
  // Filters
  dateRange = signal<Date[] | null>(null);
  selectedStatus = signal<string>('all');
  
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
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1); // Monday
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // Sunday
    
    this.dateRange.set([monday, sunday]);
  }
  
  async loadBookings() {
    this.isLoading.set(true);
    
    try {
      const dateRange = this.dateRange();
      const status = this.selectedStatus();
      
      let bookings: any[] = [];
      
      if (dateRange && dateRange.length === 2) {
        bookings = await this.supabaseService.getAdminBookings(
          dateRange[0],
          dateRange[1],
          status
        );
      }
      
      // Format booking data for display
      const formattedBookings = bookings.map(booking => ({
        ...booking,
        formattedDate: new Date(booking.session_date).toLocaleDateString('es-MX'),
        formattedTime: booking.session_time.substring(0, 5),
        statusLabel: booking.status === 'active' ? 'Activa' : 'Cancelada',
        statusSeverity: booking.status === 'active' ? 'success' : 'danger',
        canCancel: booking.status === 'active' ? this.bookingService.canCancelBooking(booking.session_date, booking.session_time) : false,
        userDisplayName: booking.profiles?.full_name || booking.profiles?.email?.split('@')[0] || 'Usuario desconocido'
      }));
      
      this.bookings.set(formattedBookings);
      
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
  
  onDateRangeChange() {
    this.loadBookings();
  }
  
  onStatusChange() {
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
    const result = await this.bookingService.cancelBookingWithRefund(booking.id, booking.user_id);
    
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Reserva cancelada correctamente'
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
  
  // Utility methods
  getTotalCreditsUsed(): number {
    return this.bookings().reduce((total, booking) => total + (booking.credits_used || 0), 0);
  }
  
  getActiveBookingsCount(): number {
    return this.bookings().filter(booking => booking.status === 'active').length;
  }
  
  getCancelledBookingsCount(): number {
    return this.bookings().filter(booking => booking.status === 'cancelled').length;
  }
}