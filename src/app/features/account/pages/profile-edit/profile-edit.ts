import { Component, inject, signal, OnInit } from '@angular/core';
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
export class ProfileEdit implements OnInit {
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  
  fullName = '';
  phone = '';
  isLoading = signal(false);
  isLoadingProfile = signal(true);
  
  async ngOnInit() {
    try {
      this.isLoadingProfile.set(true);
      const user = this.supabaseService.getUser();
      
      if (user) {
        const profile = await this.supabaseService.getProfile(user.id);
        
        if (profile) {
          this.fullName = profile.full_name || '';
          this.phone = profile.phone || '';
          
          // Si phone está vacío, intentar obtenerlo del metadata como respaldo
          if (!this.phone && user.user_metadata?.['phone']) {
            this.phone = user.user_metadata['phone'];
          }
        } else {
          // Si no existe perfil, intentar obtener datos del auth metadata
          if (user.user_metadata?.['full_name']) {
            this.fullName = user.user_metadata['full_name'];
          }
          if (user.user_metadata?.['phone']) {
            this.phone = user.user_metadata['phone'];
          }
        }
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'No se pudieron cargar algunos datos del perfil'
      });
    } finally {
      this.isLoadingProfile.set(false);
    }
  }
  
  async updateProfile() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    
    if (!user) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo identificar al usuario'
      });
      this.isLoading.set(false);
      return;
    }

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
      console.error('Error updating profile:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo actualizar el perfil'
      });
    } finally {
      this.isLoading.set(false);
    }
  }
}