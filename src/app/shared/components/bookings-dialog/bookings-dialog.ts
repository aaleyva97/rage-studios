import { Component, model, signal, inject, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { BookingService } from '../../../core/services/booking.service';
import { SupabaseService } from '../../../core/services/supabase-service';
import { formatDateForDisplay } from '../../../core/functions/date-utils';

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
export class BookingsDialog implements OnInit, AfterViewInit {
  visible = model<boolean>(false);

  @ViewChild('datePicker') datePicker!: ElementRef;

  private bookingService = inject(BookingService);
  private supabaseService = inject(SupabaseService);

  selectedDate = signal<Date>(new Date());
  bookingsForDate = signal<any[]>([]);
  bookingDates = signal<string[]>([]);
  isLoading = signal(true);
  minDate = new Date();

  async ngOnInit() {
    await this.loadBookingDates();
    await this.loadBookingsForToday();
  }

  ngAfterViewInit() {
    // Marcar fechas después de que la vista se haya inicializado
    setTimeout(() => {
      this.markBookingDatesInCalendar();
    }, 500);
  }

  async loadBookingDates() {
    const user = this.supabaseService.getUser();
    if (!user) return;

    try {
      const dates = await this.bookingService.getUserBookingDates(user.id);
      this.bookingDates.set(dates);
    } catch (error) {
      console.error('Error loading booking dates:', error);
      this.bookingDates.set([]);
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
    // Re-marcar fechas después de cambio de vista
    setTimeout(() => {
      this.markBookingDatesInCalendar();
    }, 100);
  }

  async loadBookingsForDate(date: Date) {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    if (!user) {
      this.isLoading.set(false);
      return;
    }

    try {
      const dateStr = date.toISOString().split('T')[0];
      const bookings = await this.bookingService.getUserBookingsForDate(user.id, dateStr);
      
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

  markBookingDatesInCalendar() {
    // Solo ejecutar en el navegador
    if (typeof document === 'undefined') return;
    
    const bookingDatesSet = new Set(this.bookingDates());
    
    // Buscar todas las celdas del calendario
    const calendarCells = document.querySelectorAll('.p-datepicker table td');
    
    calendarCells.forEach((cell: any) => {
      // Remover clases previas
      cell.classList.remove('has-booking-date');
      
      // Buscar el span interno que contiene el día
      const daySpan = cell.querySelector('span');
      if (daySpan && !cell.classList.contains('p-datepicker-other-month')) {
        // Obtener la fecha actual del calendario
        const calendar = cell.closest('.p-datepicker');
        if (calendar) {
          const monthYear = calendar.querySelector('.p-datepicker-header .p-datepicker-title');
          if (monthYear) {
            const day = daySpan.textContent?.trim();
            if (day && !isNaN(parseInt(day))) {
              // Construir la fecha en formato YYYY-MM-DD
              const currentDate = this.selectedDate();
              const year = currentDate.getFullYear();
              const month = currentDate.getMonth();
              const testDate = new Date(year, month, parseInt(day));
              const dateStr = testDate.toISOString().split('T')[0];
              
              if (bookingDatesSet.has(dateStr)) {
                cell.classList.add('has-booking-date');
              }
            }
          }
        }
      }
    });
  }
}