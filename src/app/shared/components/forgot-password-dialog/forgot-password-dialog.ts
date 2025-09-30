import { Component, model, output, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../../core/services/supabase-service';

@Component({
  selector: 'app-forgot-password-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './forgot-password-dialog.html',
  styleUrl: './forgot-password-dialog.scss'
})
export class ForgotPasswordDialog {
  visible = model<boolean>(false);
  openLogin = output<void>();
  
  private fb = inject(FormBuilder);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  
  forgotPasswordForm: FormGroup;
  isLoading = false;
  
  constructor() {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }
  
  get email() {
    return this.forgotPasswordForm.get('email');
  }
  
  async onSubmit() {
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      return;
    }
    
    this.isLoading = true;
    const { email } = this.forgotPasswordForm.value;
    
    try {
      await this.supabaseService.resetPasswordForEmail(email);
      
      this.messageService.add({
        severity: 'success',
        summary: 'Correo enviado',
        detail: 'Te hemos enviado un enlace. Al hacer clic, iniciarás sesión automáticamente y serás dirigido a "Mi Cuenta" para cambiar tu contraseña',
        life: 7000
      });
      
      setTimeout(() => {
        this.visible.set(false);
        this.forgotPasswordForm.reset();
      }, 1000);
      
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: this.getErrorMessage(error),
        life: 5000
      });
    } finally {
      this.isLoading = false;
    }
  }
  
  private getErrorMessage(error: any): string {
    if (error.message?.includes('Email rate limit exceeded')) {
      return 'Has solicitado demasiados correos. Espera unos minutos antes de intentar de nuevo';
    }
    if (error.message?.includes('User not found')) {
      return 'No encontramos una cuenta con ese correo electrónico';
    }
    return error.message || 'Error al enviar el correo de recuperación';
  }
  
  onOpenLogin() {
    this.visible.set(false);
    this.forgotPasswordForm.reset();
    this.openLogin.emit();
  }
  
  onDialogHide() {
    this.visible.set(false);
    this.forgotPasswordForm.reset();
  }
}