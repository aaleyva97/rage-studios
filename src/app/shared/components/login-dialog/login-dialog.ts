import { Component, model, output } from '@angular/core';
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
  visible = model<boolean>(false);
  openRegister = output<void>();

  email: string = '';
  password: string = '';

  onLogin() {
    // TODO: Implement login logic
    console.log('Login clicked', { email: this.email, password: this.password });
  }

  onOpenRegister() {
    this.visible.set(false);
    this.openRegister.emit();
  }

  onDialogHide() {
    this.visible.set(false);
  }
}
