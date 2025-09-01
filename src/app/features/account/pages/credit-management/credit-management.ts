import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { DividerModule } from 'primeng/divider';
import { PurchasesService, ICreditBatch, IPackage } from '../../../../core/services/purchases.service';

@Component({
  selector: 'app-credit-management',
  imports: [
    CommonModule, 
    TableModule, 
    TagModule, 
    SkeletonModule, 
    PaginatorModule,
    ButtonModule,
    PanelModule,
    DividerModule
  ],
  templateUrl: './credit-management.html',
  styleUrl: './credit-management.scss'
})
export class CreditManagement implements OnInit {
  private purchasesService = inject(PurchasesService);
  
  creditBatches = signal<ICreditBatch[]>([]);
  packages = signal<IPackage[]>([]);
  isLoading = signal(true);
  skeletonData = Array(5).fill({});
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  async ngOnInit() {
    await this.loadData();
  }
  
  async loadData() {
    this.isLoading.set(true);
    
    try {
      // Load credit batches and packages in parallel
      const [creditBatches, packages] = await Promise.all([
        this.purchasesService.getUserCreditBatches(),
        this.purchasesService.loadPackages()
      ]);
      
      this.creditBatches.set(creditBatches);
      this.packages.set(packages);
      
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  // Mobile pagination methods
  get paginatedCreditBatches() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.creditBatches().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
  
  // Helper methods
  formatDate(date: string): string {
    return this.purchasesService.formatDate(date);
  }
  
  formatDateTime(date: string): string {
    return this.purchasesService.formatDateTime(date);
  }
  
  getStatusLabel(batch: ICreditBatch): string {
    return this.purchasesService.getStatusLabel(batch);
  }
  
  getStatusSeverity(batch: ICreditBatch): string {
    return this.purchasesService.getStatusSeverity(batch);
  }
  
  getRemainingDays(expirationDate: string | null): number | null {
    return this.purchasesService.getRemainingDays(expirationDate);
  }
  
  isExpired(batch: ICreditBatch): boolean {
    return this.purchasesService.isExpired(batch.expiration_date, batch.expiration_activated);
  }
  
  getPackageTitle(batch: ICreditBatch): string {
    return batch.package?.title || 'Paquete no disponible';
  }
  
  getPurchaseAmount(batch: ICreditBatch): number {
    return batch.purchase?.amount || 0;
  }
  
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  }
  
  getExpirationText(batch: ICreditBatch): string {
    if (!batch.expiration_activated || batch.is_unlimited) {
      return 'Sin vencimiento';
    }
    
    if (!batch.expiration_date) {
      return 'Sin vencimiento activado';
    }
    
    const remainingDays = this.getRemainingDays(batch.expiration_date);
    
    if (remainingDays === null || remainingDays <= 0) {
      return 'Expirado';
    }
    
    if (remainingDays === 1) {
      return 'Expira mañana';
    }
    
    return `${remainingDays} días restantes`;
  }
  
  getExpirationSeverity(batch: ICreditBatch): string {
    if (!batch.expiration_activated || batch.is_unlimited) {
      return 'success';
    }
    
    const remainingDays = this.getRemainingDays(batch.expiration_date);
    
    if (remainingDays === null || remainingDays <= 0) {
      return 'danger';
    }
    
    if (remainingDays <= 7) {
      return 'warning';
    }
    
    return 'info';
  }
  
  async refreshData() {
    await this.loadData();
  }
}