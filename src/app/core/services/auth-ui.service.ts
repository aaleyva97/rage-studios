import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthUiService {
  // Public signals that can be used with two-way binding
  showLoginDialog = signal(false);
  showRegisterDialog = signal(false);
  showForgotPasswordDialog = signal(false);

  openLoginDialog() {
    this.showRegisterDialog.set(false);
    this.showForgotPasswordDialog.set(false);
    this.showLoginDialog.set(true);
  }

  openRegisterDialog() {
    this.showLoginDialog.set(false);
    this.showForgotPasswordDialog.set(false);
    this.showRegisterDialog.set(true);
  }

  openForgotPasswordDialog() {
    this.showLoginDialog.set(false);
    this.showRegisterDialog.set(false);
    this.showForgotPasswordDialog.set(true);
  }

  closeLoginDialog() {
    this.showLoginDialog.set(false);
  }

  closeRegisterDialog() {
    this.showRegisterDialog.set(false);
  }

  closeForgotPasswordDialog() {
    this.showForgotPasswordDialog.set(false);
  }

  closeAllDialogs() {
    this.showLoginDialog.set(false);
    this.showRegisterDialog.set(false);
    this.showForgotPasswordDialog.set(false);
  }
}