import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WaitlistUiService {
  showWaitlistDialog = signal(false);

  openWaitlistDialog() { this.showWaitlistDialog.set(true); }
  closeWaitlistDialog() { this.showWaitlistDialog.set(false); }
}
