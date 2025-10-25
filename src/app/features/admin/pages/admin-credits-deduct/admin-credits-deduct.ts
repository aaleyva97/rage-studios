import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SupabaseService, UserSearchResult } from '../../../../core/services/supabase-service';
import { PaymentService } from '../../../../core/services/payment.service';
import { CreditsService } from '../../../../core/services/credits.service';

interface CreditDeductionForm {
  selectedUser: UserSearchResult | null;
  creditsToDeduct: number;
  description: string;
}

@Component({
  selector: 'app-admin-credits-deduct',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    AutoCompleteModule,
    InputNumberModule,
    TextareaModule,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-credits-deduct.html',
  styleUrl: './admin-credits-deduct.scss'
})
export class AdminCreditsDeduct {
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private creditsService = inject(CreditsService);

  // Form state
  deductionForm = signal<CreditDeductionForm>({
    selectedUser: null,
    creditsToDeduct: 1,
    description: ''
  });

  // Data
  filteredUsers = signal<UserSearchResult[]>([]);
  userAvailableCredits = signal<number>(0);
  isLoadingCredits = signal(false);

  // Loading states
  isDeductingCredits = signal(false);

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

  async onUserSelect(event: any) {
    // Handle both direct object and wrapped event
    const selectedUser = (event?.value ? event.value : event) as UserSearchResult;
    const form = this.deductionForm();
    this.deductionForm.set({
      ...form,
      selectedUser
    });

    // Load user available credits
    await this.loadUserCredits(selectedUser.id);
  }

  async loadUserCredits(userId: string) {
    this.isLoadingCredits.set(true);
    try {
      const credits = await this.paymentService.getAvailableCredits(userId);
      this.userAvailableCredits.set(credits);
    } catch (error) {
      console.error('Error loading user credits:', error);
      this.userAvailableCredits.set(0);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los créditos del usuario'
      });
    } finally {
      this.isLoadingCredits.set(false);
    }
  }

  onCreditsChange(value: number) {
    const form = this.deductionForm();
    this.deductionForm.set({
      ...form,
      creditsToDeduct: value
    });
  }

  onDescriptionChange(value: string) {
    const form = this.deductionForm();
    this.deductionForm.set({
      ...form,
      description: value
    });
  }

  deductCredits() {
    const form = this.deductionForm();

    if (!form.selectedUser) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Selecciona un usuario'
      });
      return;
    }

    if (!form.creditsToDeduct || form.creditsToDeduct <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Ingresa una cantidad válida de créditos a descontar'
      });
      return;
    }

    if (form.creditsToDeduct > this.userAvailableCredits()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: `El usuario solo tiene ${this.userAvailableCredits()} crédito${this.userAvailableCredits() !== 1 ? 's' : ''} disponible${this.userAvailableCredits() !== 1 ? 's' : ''}`
      });
      return;
    }

    // Mostrar confirmación
    this.confirmationService.confirm({
      message: `¿Estás seguro de descontar ${form.creditsToDeduct} crédito${form.creditsToDeduct !== 1 ? 's' : ''} a ${form.selectedUser.full_name}? Esta acción no se puede deshacer.`,
      header: 'Confirmar Penalización',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, descontar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.executeDeduction()
    });
  }

  async executeDeduction() {
    const form = this.deductionForm();
    this.isDeductingCredits.set(true);

    try {
      const currentUser = this.supabaseService.getUser();
      if (!currentUser) {
        throw new Error('Usuario administrador no encontrado');
      }

      const description = form.description.trim() || undefined;

      const result = await this.paymentService.deductCreditsAsPenalty(
        form.selectedUser!.id,
        form.creditsToDeduct,
        description
      );

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Se descontaron ${result.creditsDeducted} crédito${result.creditsDeducted !== 1 ? 's' : ''} de ${form.selectedUser!.full_name} (${result.batchesAffected} lote${result.batchesAffected !== 1 ? 's' : ''} afectado${result.batchesAffected !== 1 ? 's' : ''})`
        });

        // Actualizar créditos disponibles del usuario
        await this.loadUserCredits(form.selectedUser!.id);

        // Si el admin se descontó créditos a sí mismo, refrescar inmediatamente el estado de créditos
        if (form.selectedUser!.id === currentUser.id) {
          await this.creditsService.forceRefreshCredits();
        }

        // Limpiar formulario parcialmente (mantener usuario pero resetear cantidad y descripción)
        this.deductionForm.set({
          ...form,
          creditsToDeduct: 1,
          description: ''
        });

      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result.error || 'Error al descontar créditos'
        });
      }

    } catch (error: any) {
      console.error('Error deducting credits:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al descontar créditos'
      });
    } finally {
      this.isDeductingCredits.set(false);
    }
  }

  isFormValid(): boolean {
    const form = this.deductionForm();
    return !!(
      form.selectedUser &&
      form.creditsToDeduct > 0 &&
      form.creditsToDeduct <= this.userAvailableCredits()
    );
  }

  resetForm() {
    this.deductionForm.set({
      selectedUser: null,
      creditsToDeduct: 1,
      description: ''
    });
    this.filteredUsers.set([]);
    this.userAvailableCredits.set(0);
  }
}
