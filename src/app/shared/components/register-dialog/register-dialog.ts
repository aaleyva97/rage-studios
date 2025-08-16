import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

@Component({
  selector: 'app-register-dialog',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './register-dialog.html',
  styleUrl: './register-dialog.scss'
})
export class RegisterDialog {
  @Input() visible: boolean = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() openLogin = new EventEmitter<void>();

  fullName: string = '';
  email: string = '';
  phone: string = '';
  password: string = '';
  confirmPassword: string = '';

  onRegister() {
    // TODO: Implement registration logic
    console.log('Register clicked', { 
      fullName: this.fullName,
      email: this.email,
      phone: this.phone,
      password: this.password,
      confirmPassword: this.confirmPassword
    });
  }

  onOpenLogin() {
    this.visible = false;
    this.visibleChange.emit(this.visible);
    this.openLogin.emit();
  }
}
