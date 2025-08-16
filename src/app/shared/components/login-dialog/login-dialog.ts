import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

@Component({
  selector: 'app-login-dialog',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss'
})
export class LoginDialog {
  @Input() visible: boolean = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() openRegister = new EventEmitter<void>();

  email: string = '';
  password: string = '';

  onLogin() {
    // TODO: Implement login logic
    console.log('Login clicked', { email: this.email, password: this.password });
  }

  onOpenRegister() {
    this.visible = false;
    this.visibleChange.emit(this.visible);
    this.openRegister.emit();
  }

  onDialogHide() {
    this.visible = false;
    this.visibleChange.emit(this.visible);
  }
}
