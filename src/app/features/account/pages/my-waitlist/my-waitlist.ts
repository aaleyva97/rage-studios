import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { WaitlistService, WaitlistEntry, WaitlistStatus } from '../../../../core/services/waitlist.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { formatDateForDisplay } from '../../../../core/functions/date-utils';

interface DisplayEntry extends WaitlistEntry {
  formattedDate: string;
  formattedTime: string;
  statusLabel: string;
  statusSeverity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  canCancel: boolean;
}

@Component({
  selector: 'app-my-waitlist',
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    PaginatorModule,
    TooltipModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './my-waitlist.html',
})
export class MyWaitlist implements OnInit {
  private waitlistService = inject(WaitlistService);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  isLoading = signal(true);
  skeletonData = Array(5).fill({});

  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);

  entries = computed<DisplayEntry[]>(() => {
    return this.waitlistService.userEntries().map((e) => this.toDisplay(e));
  });

  get paginatedEntries(): DisplayEntry[] {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.entries().slice(start, end);
  }

  async ngOnInit() {
    const user = this.supabaseService.getUser();
    if (user) {
      this.waitlistService.setCurrentUser(user.id);
      await this.waitlistService.refreshUserEntries();
    }
    this.isLoading.set(false);
  }

  private toDisplay(e: WaitlistEntry): DisplayEntry {
    const map: Record<WaitlistStatus, { label: string; severity: DisplayEntry['statusSeverity'] }> = {
      waiting: { label: 'En espera', severity: 'warn' },
      promoted: { label: 'Promovida', severity: 'success' },
      expired: { label: 'Expirada', severity: 'secondary' },
      cancelled: { label: 'Cancelada', severity: 'danger' },
      failed_promotion: { label: 'Falló', severity: 'danger' },
    };
    const info = map[e.status];
    return {
      ...e,
      formattedDate: formatDateForDisplay(e.session_date),
      formattedTime: e.session_time.substring(0, 5),
      statusLabel: info.label,
      statusSeverity: info.severity,
      canCancel: e.status === 'waiting',
    };
  }

  confirmCancel(entry: DisplayEntry) {
    this.confirmationService.confirm({
      message: `¿Cancelar tu inscripción en lista de espera del ${entry.formattedDate} a las ${entry.formattedTime}?`,
      header: 'Confirmar Cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.cancelEntry(entry),
    });
  }

  async cancelEntry(entry: DisplayEntry) {
    const result = await this.waitlistService.cancelWaitlistEntry(entry.id);
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Inscripción cancelada',
        detail: 'Tu inscripción a lista de espera fue cancelada.',
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la inscripción.',
      });
    }
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
}
