import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../../environments/environment';
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
   imports: [CommonModule, TableModule, TagModule],
  templateUrl: './credit-history.html',
  styleUrl: './credit-history.scss'
})
export class CreditHistory implements OnInit {
  private supabaseService = inject(SupabaseService);
  private supabaseClient: SupabaseClient;
  
  creditHistory = signal<CreditHistory[]>([]);
  isLoading = signal(true);
  
  constructor() {
    this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
  }
  
  async ngOnInit() {
    await this.loadCreditHistory();
  }
  
  async loadCreditHistory() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    
    if (user) {
      const { data, error } = await this.supabaseClient
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
      'expired': 'Expirado'
    };
    return labels[type] || type;
  }
  
  getTypeSeverity(type: string): string {
    const severities: Record<string, string> = {
      'purchase': 'success',
      'used': 'warning',
      'refunded': 'info',
      'expired': 'danger'
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
}