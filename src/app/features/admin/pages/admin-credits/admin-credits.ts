import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { SupabaseService, UserSearchResult } from '../../../../core/services/supabase-service';
import { PaymentService } from '../../../../core/services/payment.service';
import { PackagesService, Package } from '../../../landing/services/packages.service';

interface CreditAssignmentForm {
  selectedUser: UserSearchResult | null;
  selectedPackage: Package | null;
}

@Component({
  selector: 'app-admin-credits',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    AutoCompleteModule,
    SelectModule
  ],
  templateUrl: './admin-credits.html',
  styleUrl: './admin-credits.scss'
})
export class AdminCredits implements OnInit {
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private packagesService = inject(PackagesService);
  private messageService = inject(MessageService);
  
  // Form state
  assignmentForm = signal<CreditAssignmentForm>({
    selectedUser: null,
    selectedPackage: null
  });
  
  // Data
  filteredUsers = signal<UserSearchResult[]>([]);
  availablePackages = signal<Package[]>([]);
  
  // Loading states
  isLoadingPackages = signal(false);
  isAssigningCredits = signal(false);
  
  async ngOnInit() {
    await this.loadPackages();
  }
  
  async loadPackages() {
    this.isLoadingPackages.set(true);
    
    try {
      const packages = await this.packagesService.getActivePackages();
      this.availablePackages.set(packages);
    } catch (error) {
      console.error('Error loading packages:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los paquetes'
      });
    } finally {
      this.isLoadingPackages.set(false);
    }
  }
  
  async searchUsers(event: any) {
    const query = event.query;
    
    if (!query || query.length < 2) {
      this.filteredUsers.set([]);
      return;
    }
    
    try {
      const users = await this.supabaseService.searchUsers(query);
      this.filteredUsers.set(users);
    } catch (error) {
      console.error('Error searching users:', error);
      this.filteredUsers.set([]);
    }
  }
  
  onUserSelect(event: any) {
    // Handle both direct object and wrapped event
    const selectedUser = (event?.value ? event.value : event) as UserSearchResult;
    const form = this.assignmentForm();
    this.assignmentForm.set({
      ...form,
      selectedUser
    });
  }
  
  onPackageSelect(event: any) {
    const selectedPackage = event.value as Package;
    const form = this.assignmentForm();
    this.assignmentForm.set({
      ...form,
      selectedPackage
    });
  }
  
  async assignCredits() {
    const form = this.assignmentForm();
    
    if (!form.selectedUser) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Selecciona un usuario'
      });
      return;
    }
    
    if (!form.selectedPackage) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Selecciona un paquete'
      });
      return;
    }
    
    this.isAssigningCredits.set(true);
    
    try {
      const currentUser = this.supabaseService.getUser();
      if (!currentUser) {
        throw new Error('Usuario administrador no encontrado');
      }
      
      // Usar el método existente del PaymentService
      await this.paymentService.assignPackageManually(
        form.selectedPackage,
        form.selectedUser.id,
        currentUser.id
      );
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: `Paquete "${form.selectedPackage.title}" asignado exitosamente a ${form.selectedUser.full_name}`
      });
      
      // Limpiar formulario
      this.assignmentForm.set({
        selectedUser: null,
        selectedPackage: null
      });
      
    } catch (error: any) {
      console.error('Error assigning credits:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al asignar los créditos'
      });
    } finally {
      this.isAssigningCredits.set(false);
    }
  }
  
  // Helpers for templates
  getUserDisplayText(user: UserSearchResult): string {
    return `${user.full_name} ${user.phone ? '(' + user.phone + ')' : ''}`;
  }
  
  getPackageDisplayText(pkg: Package): string {
    if (pkg.is_unlimited) {
      return `${pkg.title} - ILIMITADO (${pkg.validity_days} días) - $${pkg.price}`;
    }
    return `${pkg.title} - ${pkg.credits_count} créditos (${pkg.validity_days} días) - $${pkg.price}`;
  }
  
  isFormValid(): boolean {
    const form = this.assignmentForm();
    return !!(form.selectedUser && form.selectedPackage);
  }
  
  resetForm() {
    this.assignmentForm.set({
      selectedUser: null,
      selectedPackage: null
    });
    this.filteredUsers.set([]);
  }
}