import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-change-password',
   imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    PasswordModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './change-password.html',
  styleUrl: './change-password.scss'
})
export class ChangePassword {
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  isLoading = signal(false);
  
  async changePassword() {
    if (this.newPassword !== this.confirmPassword) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Las contraseñas no coinciden'
      });
      return;
    }
    
    if (this.newPassword.length < 6) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'La contraseña debe tener al menos 6 caracteres'
      });
      return;
    }
    
    this.isLoading.set(true);
    
    try {
      const { error } = await this.supabaseService.updatePassword(this.newPassword);
      
      if (!error) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Contraseña actualizada correctamente'
        });
        this.resetForm();
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'No se pudo actualizar la contraseña'
        });
      }
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al actualizar la contraseña'
      });
    } finally {
      this.isLoading.set(false);
    }
  }
  
  resetForm() {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }
}
