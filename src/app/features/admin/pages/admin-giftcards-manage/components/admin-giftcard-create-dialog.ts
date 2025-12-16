import { Component, OnInit, inject, model, output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToastModule } from 'primeng/toast';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { GiftCardService } from '../../../../../core/services/gift-card.service';
import { PackagesService, Package } from '../../../../landing/services/packages.service';

interface CreateForm {
  selectedPackage: Package | null;
  quantity: number;
}

@Component({
  selector: 'app-admin-giftcard-create-dialog',
  imports: [
    DialogModule,
    ButtonModule,
    SelectModule,
    InputNumberModule,
    ToastModule,
    FormsModule
  ],
  providers: [MessageService],
  template: `
    <p-toast />

    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="true"
      [closeOnEscape]="!isCreating()"
      styleClass="w-full max-w-md mx-4">

      <ng-template pTemplate="header">
        <div class="flex items-center gap-3">
          <i class="pi pi-gift text-purple-500 text-2xl"></i>
          <div>
            <h2 class="text-xl font-bold text-gray-900">Crear Gift Cards</h2>
            <p class="text-sm text-gray-600">Genera nuevas gift cards para venta</p>
          </div>
        </div>
      </ng-template>

      <div class="space-y-6">
        <!-- Package Select -->
        <div class="field">
          <label for="package" class="block text-sm font-medium text-gray-700 mb-2">
            Paquete <span class="text-red-500">*</span>
          </label>
          <p-select
            appendTo="body"
            id="package"
            [ngModel]="createForm().selectedPackage"
            (ngModelChange)="onPackageChange($event)"
            [options]="packages()"
            optionLabel="title"
            placeholder="Selecciona un paquete"
            [disabled]="isCreating()"
            styleClass="w-full">

            <ng-template let-package pTemplate="item">
              <div class="flex flex-col py-1">
                <span class="font-medium text-gray-900">{{ package.title }}</span>
                <div class="text-sm text-gray-600">
                  <span>{{ package.classes_count }} clases</span>
                  <span class="mx-2">•</span>
                  <span>\${{ package.price }}</span>
                </div>
              </div>
            </ng-template>
          </p-select>

          @if (createForm().selectedPackage) {
            <small class="text-gray-500 block mt-2">
              El paquete que otorgará la gift card
            </small>
          }
        </div>

        <!-- Quantity Input -->
        <div class="field">
          <label for="quantity" class="block text-sm font-medium text-gray-700 mb-2">
            Cantidad <span class="text-red-500">*</span>
          </label>
          <p-inputNumber
            id="quantity"
            [ngModel]="createForm().quantity"
            (ngModelChange)="onQuantityChange($event)"
            [min]="1"
            [max]="100"
            [showButtons]="true"
            buttonLayout="horizontal"
            incrementButtonIcon="pi pi-plus"
            decrementButtonIcon="pi pi-minus"
            [disabled]="isCreating()"
            styleClass="w-full"
            inputStyleClass="w-full text-center">
          </p-inputNumber>

          <small class="text-gray-500 block mt-2">
            Número de gift cards a generar (máx. 100)
          </small>
        </div>

        <!-- Summary -->
        @if (createForm().selectedPackage && createForm().quantity >= 1) {
          <div class="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div class="flex items-start gap-3">
              <i class="pi pi-info-circle text-purple-600 text-lg mt-0.5"></i>
              <div class="text-sm text-purple-900 space-y-1">
                <p class="font-semibold">Se generarán:</p>
                <ul class="list-disc list-inside space-y-1 text-purple-800">
                  <li>{{ createForm().quantity }} gift card{{ createForm().quantity > 1 ? 's' : '' }}</li>
                  <li>Del paquete: {{ createForm().selectedPackage!.title }}</li>
                  <li>Cada una con {{ createForm().selectedPackage!.classes_count }} clases</li>
                </ul>
              </div>
            </div>
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="flex gap-3 justify-end">
          <p-button
            label="Cancelar"
            severity="secondary"
            [outlined]="true"
            (onClick)="onCancel()"
            [disabled]="isCreating()">
          </p-button>

          <p-button
            label="Generar"
            icon="pi pi-check"
            [loading]="isCreating()"
            [disabled]="!isFormValid()"
            (onClick)="onCreate()">
          </p-button>
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    ::ng-deep .p-dialog {
      .p-dialog-header {
        padding: 1.5rem;
      }

      .p-dialog-content {
        padding: 1.5rem;
      }

      .p-dialog-footer {
        padding: 1.5rem;
        padding-top: 1rem;
      }
    }
  `]
})
export class AdminGiftcardCreateDialog implements OnInit {
  private giftCardService = inject(GiftCardService);
  private packagesService = inject(PackagesService);
  private messageService = inject(MessageService);

  // Two-way binding with parent
  visible = model<boolean>(false);

  // Data
  packages = signal<Package[]>([]);

  // Form state
  createForm = signal<CreateForm>({
    selectedPackage: null,
    quantity: 1
  });

  // Loading state
  isCreating = signal(false);

  // Output event - emitted when gift cards are created successfully
  success = output<void>();

  async ngOnInit() {
    await this.loadPackages();
  }

  async loadPackages() {
    try {
      const packages = await this.packagesService.getActivePackages();
      this.packages.set(packages);
    } catch (error) {
      console.error('Error loading packages:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar paquetes'
      });
    }
  }

  onPackageChange(pkg: Package) {
    const form = this.createForm();
    this.createForm.set({
      ...form,
      selectedPackage: pkg
    });
  }

  onQuantityChange(quantity: number) {
    const form = this.createForm();
    this.createForm.set({
      ...form,
      quantity
    });
  }

  isFormValid(): boolean {
    const form = this.createForm();
    return !!(
      form.selectedPackage &&
      form.quantity >= 1 &&
      form.quantity <= 100
    );
  }

  async onCreate() {
    if (!this.isFormValid()) {
      return;
    }

    const form = this.createForm();
    this.isCreating.set(true);

    try {
      const result = await this.giftCardService.createGiftCards({
        packageId: form.selectedPackage!.id,
        quantity: form.quantity
      });

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `${form.quantity} gift card${form.quantity > 1 ? 's' : ''} creada${form.quantity > 1 ? 's' : ''} correctamente`
        });

        // Close dialog and reset form
        this.visible.set(false);
        this.resetForm();

        // Notify parent of success
        this.success.emit();
      } else {
        throw new Error(result.error || 'Error al crear gift cards');
      }
    } catch (error: any) {
      console.error('Error creating gift cards:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al crear gift cards'
      });
    } finally {
      this.isCreating.set(false);
    }
  }

  onCancel() {
    this.visible.set(false);
    this.resetForm();
  }

  private resetForm() {
    this.createForm.set({
      selectedPackage: null,
      quantity: 1
    });
  }
}
