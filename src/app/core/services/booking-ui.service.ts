import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class BookingUiService {
  // Public signal for controlling booking dialog visibility
  showBookingDialog = signal(false);

  openBookingDialog() {
    this.showBookingDialog.set(true);
  }

  closeBookingDialog() {
    this.showBookingDialog.set(false);
  }
}