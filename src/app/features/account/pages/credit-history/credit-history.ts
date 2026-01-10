import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { SupabaseService } from '../../../../core/services/supabase-service';

interface ICreditHistory {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
  booking_id?: string;
  payment_id?: string;
}


@Component({
  selector: 'app-credit-history',
  imports: [CommonModule, TableModule, TagModule, SkeletonModule, PaginatorModule],
  templateUrl: './credit-history.html',
  styleUrl: './credit-history.scss'
})
export class CreditHistory implements OnInit {
  private supabaseService = inject(SupabaseService);
  
  creditHistory = signal<ICreditHistory[]>([]);
  isLoading = signal(true);
  skeletonData = Array(5).fill({});
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  constructor() {
    // Ya no necesitamos crear una instancia independiente
  }
  
  async ngOnInit() {
    await this.loadCreditHistory();
  }
  
  async loadCreditHistory() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    
    if (user) {
      const { data, error } = await this.supabaseService.client
        .from('credit_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        this.creditHistory.set(data);
      }
    }
    
    this.isLoading.set(false);
  }
  
  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'purchase': 'Compra',
      'used': 'Usado',
      'refunded': 'Devuelto',
      'expired': 'Expirado',
      'added': 'Agregado',
      'penalty': 'Descuento'
    };
    return labels[type] || type;
  }

  getTypeSeverity(type: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    const severities: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
      'purchase': 'success',
      'used': 'warn',
      'refunded': 'info',
      'expired': 'danger',
      'added': 'success',
      'penalty': 'danger'
    };
    return severities[type] || 'secondary';
  }
  
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Mobile pagination methods
  get paginatedCreditHistory() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.creditHistory().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
}