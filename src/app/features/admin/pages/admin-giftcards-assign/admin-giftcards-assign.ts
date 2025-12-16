import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { SupabaseService, UserSearchResult } from '../../../../core/services/supabase-service';
import { GiftCardService } from '../../../../core/services/gift-card.service';

interface AssignmentForm {
  selectedUser: UserSearchResult | null;
  giftCardCode: string;
}

@Component({
  selector: 'app-admin-giftcards-assign',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    AutoCompleteModule,
    InputTextModule
  ],
  providers: [MessageService],
  templateUrl: './admin-giftcards-assign.html',
  styleUrl: './admin-giftcards-assign.scss'
})
export class AdminGiftcardsAssign {
  private supabaseService = inject(SupabaseService);
  private giftCardService = inject(GiftCardService);
  private messageService = inject(MessageService);

  // Form state
  assignmentForm = signal<AssignmentForm>({
    selectedUser: null,
    giftCardCode: ''
  });

  // Data
  filteredUsers = signal<UserSearchResult[]>([]);

  // Loading state
  isAssigning = signal(false);

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
    const selectedUser = (event?.value ? event.value : event) as UserSearchResult;
    const form = this.assignmentForm();
    this.assignmentForm.set({
      ...form,
      selectedUser
    });
  }

  onCodeChange(code: string) {
    const form = this.assignmentForm();
    this.assignmentForm.set({
      ...form,
      giftCardCode: code.toUpperCase() // Auto-uppercase
    });
  }

  async assignGiftCard() {
    const form = this.assignmentForm();

    if (!form.selectedUser) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Selecciona un usuario'
      });
      return;
    }

    if (!form.giftCardCode || form.giftCardCode.trim().length < 8) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Ingresa un código de gift card válido'
      });
      return;
    }

    this.isAssigning.set(true);

    try {
      const result = await this.giftCardService.assignGiftCardToUser(
        form.giftCardCode.trim(),
        form.selectedUser.id
      );

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Gift card asignada exitosamente a ${form.selectedUser.full_name}`
        });

        // Reset form
        this.assignmentForm.set({
          selectedUser: null,
          giftCardCode: ''
        });
      } else {
        throw new Error(result.error || 'Error al asignar gift card');
      }
    } catch (error: any) {
      console.error('Error assigning gift card:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al asignar gift card'
      });
    } finally {
      this.isAssigning.set(false);
    }
  }

  // Helpers
  getUserDisplayText(user: UserSearchResult): string {
    return `${user.full_name} ${user.phone ? '(' + user.phone + ')' : ''}`;
  }

  isFormValid(): boolean {
    const form = this.assignmentForm();
    return !!(form.selectedUser && form.giftCardCode && form.giftCardCode.trim().length >= 8);
  }

  resetForm() {
    this.assignmentForm.set({
      selectedUser: null,
      giftCardCode: ''
    });
    this.filteredUsers.set([]);
  }
}
