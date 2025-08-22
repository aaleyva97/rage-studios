import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthUiService {
  // Public signals that can be used with two-way binding
  showLoginDialog = signal(false);
  showRegisterDialog = signal(false);

  openLoginDialog() {
    this.showRegisterDialog.set(false);
    this.showLoginDialog.set(true);
  }

  openRegisterDialog() {
    this.showLoginDialog.set(false);
    this.showRegisterDialog.set(true);
  }

  closeLoginDialog() {
    this.showLoginDialog.set(false);
  }

  closeRegisterDialog() {
    this.showRegisterDialog.set(false);
  }

  closeAllDialogs() {
    this.showLoginDialog.set(false);
    this.showRegisterDialog.set(false);
  }
}