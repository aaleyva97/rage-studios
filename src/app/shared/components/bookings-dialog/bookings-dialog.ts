import { Component, model, signal, inject, OnInit, OnDestroy, ViewChild, ElementRef, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { BookingService } from '../../../core/services/booking.service';
import { SupabaseService } from '../../../core/services/supabase-service';
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
    TagModule
  ],
  templateUrl: './bookings-dialog.html',
  styleUrl: './bookings-dialog.scss'
})
export class BookingsDialog implements OnInit, OnDestroy {
  visible = model<boolean>(false);

  @ViewChild('datePicker') datePicker!: ElementRef;

  private bookingService = inject(BookingService);
  private supabaseService = inject(SupabaseService);

  selectedDate = signal<Date>(new Date());
  bookingsForDate = signal<any[]>([]);
  bookingDates = signal<string[]>([]);
  isLoading = signal(true);
  minDate = new Date();
  
  private authSubscription?: Subscription;
  private currentUserId: string | null = null;
  
  constructor() {
    // Removido el effect problemático que causa bucle infinito
  }

  async ngOnInit() {
    // Solo obtener usuario una vez, no suscribirse
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
    // Auto-cargar reservas del día actual
    await this.loadBookingsForToday();
  }

  // Método público para inicializar desde el componente padre
  public async openDialog() {
    this.visible.set(true);
    // Esperar un tick para que el dialog se abra
    setTimeout(() => {
      this.initializeDialogData();
    }, 100);
  }

  async loadBookingDates() {
    if (!this.currentUserId) {
      this.bookingDates.set([]);
      return;
    }

    try {
      const dates = await this.bookingService.getUserBookingDates(this.currentUserId);
      this.bookingDates.set(dates);
    } catch (error) {
      console.error('Error loading booking dates:', error);
      this.bookingDates.set([]);
    }
  }

  async loadBookingsForToday() {
    const today = new Date();
    this.selectedDate.set(today);
    // Cargar reservas del día actual inmediatamente
    await this.loadBookingsForDate(today);
  }

  async onDateSelect(date: Date) {
    this.selectedDate.set(date);
    await this.loadBookingsForDate(date);
  }

  async loadBookingsForDate(date: Date) {
    this.isLoading.set(true);

    // ✅ FIX: Use local timezone conversion to prevent date shift bug
    // BEFORE: date.toISOString().split('T')[0] - WRONG, converts to UTC causing date shift
    // AFTER: formatDateToLocalYYYYMMDD(date) - CORRECT, preserves local date
    const dateStr = formatDateToLocalYYYYMMDD(date);

    console.log('📅 [Bookings Dialog] Loading bookings for local date:', dateStr, 'from Date object:', date);

    if (!this.currentUserId) {
      this.isLoading.set(false);
      this.bookingsForDate.set([]);
      return;
    }

    try {
      const bookings = await this.bookingService.getUserBookingsForDate(this.currentUserId, dateStr);

      console.log(`📊 [Bookings Dialog] Found ${bookings.length} booking(s) for date ${dateStr}`);

      // Formatear bookings
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

  // Función para verificar si una fecha tiene reservas
  hasBookingOnDate(date: any): boolean {
    if (!date || !date.year || !date.month || !date.day) {
      return false;
    }
    
    // Construir fecha en formato YYYY-MM-DD
    const year = date.year;
    const month = (date.month + 1).toString().padStart(2, '0'); // month viene 0-indexed
    const day = date.day.toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    return this.bookingDates().includes(dateStr);
  }
}