import { Component, model, signal, computed, inject, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService, ConfirmationService } from 'primeng/api';
import { WaitlistService, WaitlistEntry, WaitlistStatus } from '../../../core/services/waitlist.service';
import { SupabaseService } from '../../../core/services/supabase-service';
import { formatDateForDisplay } from '../../../core/functions/date-utils';
import { Subscription } from 'rxjs';

interface DisplayEntry extends WaitlistEntry {
  formattedDate: string;
  formattedTime: string;
  statusLabel: string;
  statusSeverity: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
  canCancel: boolean;
}

@Component({
  selector: 'app-waitlist-dialog',
  standalone: true,
  imports: [
    CommonModule,
    DialogModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './waitlist-dialog.html',
  styleUrl: './waitlist-dialog.scss'
})
export class WaitlistDialog implements OnInit, OnDestroy {
  visible = model<boolean>(false);

  protected waitlistService = inject(WaitlistService);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  isLoading = signal(true);
  isCancelling = signal(false);
  skeletonData = Array(3).fill({});

  private authSubscription?: Subscription;
  private currentUserId: string | null = null;

  entries = computed<DisplayEntry[]>(() => {
    return this.waitlistService.userEntries()
      .map((e) => this.toDisplay(e));
  });

  // Filter entries to only show active ones or all
  activeEntriesCount = computed(() => {
    return this.entries().filter(e => e.status === 'waiting').length;
  });

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.loadWaitlistData();
      }
    });
  }

  async ngOnInit() {
    this.authSubscription = this.supabaseService.currentUser$.subscribe(user => {
      this.currentUserId = user?.id || null;
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }

  async loadWaitlistData() {
    this.isLoading.set(true);
    const user = this.supabaseService.getUser();
    if (user) {
      this.currentUserId = user.id;
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
    if (this.isCancelling()) return;
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
    if (this.isCancelling()) return;
    this.isCancelling.set(true);
    const result = await this.waitlistService.cancelWaitlistEntry(entry.id);
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Inscripción cancelada',
        detail: 'Tu inscripción a lista de espera fue cancelada.',
      });
      await this.waitlistService.refreshUserEntries();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la inscripción.',
      });
    }
    this.isCancelling.set(false);
  }

  closeDialog() {
    this.visible.set(false);
  }
}
