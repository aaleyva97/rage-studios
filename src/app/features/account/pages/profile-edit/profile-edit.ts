import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-profile-edit',
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.scss'
})
export class ProfileEdit {
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  
  fullName = '';
  phone = '';
  isLoading = signal(false);
  
  async ngOnInit() {
    const user = this.supabaseService.getUser();
    if (user) {
      const profile = await this.supabaseService.getProfile(user.id);
      if (profile) {
        this.fullName = profile.full_name || '';
        this.phone = profile.phone || '';
      }
    }
  }
  
  async updateProfile() {
  this.isLoading.set(true);
  const user = this.supabaseService.getUser();
  
  if (user) {
    try {
      await this.supabaseService.updateProfile(user.id, {
        full_name: this.fullName,
        phone: this.phone
      });
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Perfil actualizado correctamente'
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo actualizar el perfil'
      });
    }
  }
  
  this.isLoading.set(false);
}
}