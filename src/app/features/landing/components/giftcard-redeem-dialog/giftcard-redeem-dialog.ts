import { Component, inject, model, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { GiftCardService } from '../../../../core/services/gift-card.service';
import { CreditsService } from '../../../../core/services/credits.service';

@Component({
  selector: 'app-giftcard-redeem-dialog',
  imports: [
    DialogModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    ReactiveFormsModule
  ],
  providers: [MessageService],
  templateUrl: './giftcard-redeem-dialog.html',
  styleUrl: './giftcard-redeem-dialog.scss'
})
export class GiftcardRedeemDialog {
  private fb = inject(FormBuilder);
  private giftCardService = inject(GiftCardService);
  private creditsService = inject(CreditsService);
  private messageService = inject(MessageService);

  // Two-way binding with parent component
  visible = model<boolean>(false);

  // Form and loading state
  giftCardForm: FormGroup;
  isLoading = signal(false);

  constructor() {
    this.giftCardForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  onCodeInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upperValue = input.value.toUpperCase();
    this.giftCardForm.patchValue({ code: upperValue }, { emitEvent: false });
    input.value = upperValue;
  }

  async onRedeem() {
    if (this.giftCardForm.invalid) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Por favor ingresa un código válido'
      });
      return;
    }

    const code = this.giftCardForm.value.code.trim();
    this.isLoading.set(true);

    try {
      const result = await this.giftCardService.redeemGiftCard(code);

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: '¡Éxito!',
          detail: `Gift card canjeada. Se agregaron ${result.creditsAdded} créditos a tu cuenta.`,
          life: 5000
        });

        // Refresh credits
        await this.creditsService.forceRefreshCredits();

        // Close dialog and reset form
        this.visible.set(false);
        this.giftCardForm.reset();
      } else {
        throw new Error(result.error || 'Error al canjear gift card');
      }
    } catch (error: any) {
      console.error('Error redeeming gift card:', error);

      let errorMessage = 'Error al canjear la gift card';

      // Custom error messages
      if (error.message.includes('not found') || error.message.includes('no existe')) {
        errorMessage = 'Código inválido. Verifica que esté escrito correctamente.';
      } else if (error.message.includes('already used') || error.message.includes('ya fue usada')) {
        errorMessage = 'Esta gift card ya fue utilizada.';
      } else if (error.message.includes('assigned') || error.message.includes('asignada')) {
        errorMessage = 'Esta gift card está asignada a otro usuario.';
      } else if (error.message.includes('inactive') || error.message.includes('inactivo')) {
        errorMessage = 'El paquete asociado a esta gift card ya no está disponible.';
      }

      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 5000
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  onCancel() {
    this.visible.set(false);
    this.giftCardForm.reset();
  }
}
