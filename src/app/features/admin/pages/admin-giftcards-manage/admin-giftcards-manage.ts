import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { GiftCardService, GiftCard } from '../../../../core/services/gift-card.service';
import { PackagesService, Package } from '../../../landing/services/packages.service';
import { AdminGiftcardCreateDialog } from './components/admin-giftcard-create-dialog';

@Component({
  selector: 'app-admin-giftcards-manage',
  imports: [
    FormsModule,
    DatePipe,
    CardModule,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    ToastModule,
    SkeletonModule,
    PaginatorModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    AdminGiftcardCreateDialog
  ],
  providers: [MessageService],
  templateUrl: './admin-giftcards-manage.html',
  styleUrl: './admin-giftcards-manage.scss'
})
export class AdminGiftcardsManage implements OnInit {
  private giftCardService = inject(GiftCardService);
  private packagesService = inject(PackagesService);
  private messageService = inject(MessageService);

  // Dialog visibility
  showCreateDialog = signal(false);

  // Data
  giftCards = signal<GiftCard[]>([]);
  availablePackages = signal<Package[]>([]);
  selectedGiftCards = signal<GiftCard[]>([]);

  // Filters
  selectedStatus = signal<string>('all');
  selectedPackageFilter = signal<string>('all');
  searchCode = signal<string>('');

  // Loading states
  isLoadingPackages = signal(false);
  isLoadingGiftCards = signal(true);
  isUpdatingStatus = signal(false);

  // Skeleton data
  skeletonData = Array(8).fill({});

  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);

  // Status options
  statusOptions = [
    { label: 'Todos', value: 'all' },
    { label: 'Creadas', value: 'created' },
    { label: 'Impresas', value: 'printed' },
    { label: 'Asignadas', value: 'assigned' },
    { label: 'Usadas', value: 'used' }
  ];

  async ngOnInit() {
    await Promise.all([
      this.loadPackages(),
      this.loadGiftCards()
    ]);
  }

  async loadGiftCards() {
    this.isLoadingGiftCards.set(true);
    try {
      const result = await this.giftCardService.searchGiftCards({
        status: this.selectedStatus() as any,
        packageId: this.selectedPackageFilter() === 'all' ? undefined : this.selectedPackageFilter(),
        searchCode: this.searchCode() || undefined
      });

      if (result.success && result.giftCards) {
        this.giftCards.set(result.giftCards);
      } else {
        throw new Error(result.error || 'Error al cargar gift cards');
      }
    } catch (error: any) {
      console.error('Error loading gift cards:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al cargar gift cards'
      });
    } finally {
      this.isLoadingGiftCards.set(false);
    }
  }

  openCreateDialog() {
    this.showCreateDialog.set(true);
  }

  onCreateSuccess() {
    // Reload gift cards when dialog succeeds
    this.loadGiftCards();
  }

  async markAsPrinted() {
    const selected = this.selectedGiftCards();

    if (selected.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Selecciona al menos una gift card'
      });
      return;
    }

    this.isUpdatingStatus.set(true);

    try {
      const ids = selected.map(gc => gc.id);
      const result = await this.giftCardService.bulkUpdateStatus(ids, 'printed');

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `${result.updatedCount} gift card${result.updatedCount! > 1 ? 's' : ''} marcada${result.updatedCount! > 1 ? 's' : ''} como impresa${result.updatedCount! > 1 ? 's' : ''}`
        });

        // Clear selection and reload
        this.selectedGiftCards.set([]);
        await this.loadGiftCards();
      } else {
        throw new Error(result.error || 'Error al actualizar estado');
      }
    } catch (error: any) {
      console.error('Error updating status:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al actualizar estado'
      });
    } finally {
      this.isUpdatingStatus.set(false);
    }
  }

  clearFilters() {
    this.selectedStatus.set('all');
    this.selectedPackageFilter.set('all');
    this.searchCode.set('');
    this.loadGiftCards();
  }

  // Computed properties
  get filteredGiftCards() {
    return this.giftCards();
  }

  get paginatedGiftCards() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.filteredGiftCards.slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }

  // Helpers
  getStatusSeverity(status: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined {
    const severityMap: { [key: string]: 'success' | 'secondary' | 'info' | 'warn' } = {
      'created': 'secondary',
      'printed': 'info',
      'assigned': 'warn',
      'used': 'success'
    };
    return severityMap[status];
  }

  getStatusLabel(status: string): string {
    const labelMap: { [key: string]: string } = {
      'created': 'Creada',
      'printed': 'Impresa',
      'assigned': 'Asignada',
      'used': 'Usada'
    };
    return labelMap[status] || status;
  }

  copyToClipboard(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      this.messageService.add({
        severity: 'info',
        summary: 'Copiado',
        detail: 'Código copiado al portapapeles',
        life: 2000
      });
    });
  }

  onStatusFilterChange() {
    this.loadGiftCards();
  }

  onPackageFilterChange() {
    this.loadGiftCards();
  }

  onSearchChange() {
    // Debounce opcional, por ahora búsqueda directa
    this.loadGiftCards();
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

  get packageFilterOptions() {
    const packages = this.availablePackages().map(pkg => ({
      label: pkg.title,
      value: pkg.id
    }));
    return [{ label: 'Todos', value: 'all' }, ...packages];
  }
}
