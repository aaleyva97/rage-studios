import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SupabaseService } from '../../../../core/services/supabase-service';
import {
  WaitlistService,
  WaitlistEntry,
  WaitlistStatus,
} from '../../../../core/services/waitlist.service';
import {
  formatDateForDisplay,
  formatDateToLocalYYYYMMDD,
} from '../../../../core/functions/date-utils';

interface DisplayWaitlistEntry extends WaitlistEntry {
  formattedDate: string;
  formattedTime: string;
  statusLabel: string;
  statusSeverity:
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'secondary'
    | 'contrast';
  userDisplayName: string;
  canCancel: boolean;
  canPromote: boolean;
}

interface StatusOption {
  label: string;
  value: 'all' | WaitlistStatus;
}

@Component({
  selector: 'app-admin-waitlist',
  imports: [
    FormsModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    PaginatorModule,
    CardModule,
    TooltipModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-waitlist.html',
})
export class AdminWaitlist implements OnInit {
  private supabaseService = inject(SupabaseService);
  private waitlistService = inject(WaitlistService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  entries = signal<DisplayWaitlistEntry[]>([]);
  isLoading = signal(true);
  skeletonData = Array(8).fill({});

  // Filtros
  dateRange = signal<Date[] | null>(null);
  selectedStatus = signal<'all' | WaitlistStatus>('waiting');
  searchTerm = signal<string>('');
  selectedTime = signal<string>('all');
  availableTimes = signal<{ label: string; value: string }[]>([]);

  statusOptions: StatusOption[] = [
    { label: 'Solo en espera', value: 'waiting' },
    { label: 'Solo promovidas', value: 'promoted' },
    { label: 'Solo falladas', value: 'failed_promotion' },
    { label: 'Solo expiradas', value: 'expired' },
    { label: 'Solo canceladas', value: 'cancelled' },
    { label: 'Todas', value: 'all' },
  ];

  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);

  async ngOnInit() {
    this.setDefaultRange();
    await this.loadEntries();
  }

  private setDefaultRange() {
    // Default: hoy + próximos 7 días (la mayoría de inscripciones serán futuras)
    const today = new Date();
    const inAWeek = new Date();
    inAWeek.setDate(today.getDate() + 7);
    this.dateRange.set([today, inAWeek]);
  }

  async loadEntries() {
    const range = this.dateRange();
    if (!range || range.length !== 2 || !range[0] || !range[1]) return;

    this.isLoading.set(true);
    try {
      const startStr = formatDateToLocalYYYYMMDD(range[0]);
      const endStr = formatDateToLocalYYYYMMDD(range[1]);
      const filter = this.selectedStatus();

      const rawEntries = await this.waitlistService.getEntriesForDateRange(
        startStr,
        endStr,
        filter
      );

      // Hidratar nombres en una sola query
      const userIds = Array.from(new Set(rawEntries.map((e) => e.user_id)));
      const nameByUser: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await this.supabaseService.client
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => {
          nameByUser[p.id] = p.full_name || p.phone || p.id.substring(0, 8);
        });
      }

      const display = rawEntries.map((e) =>
        this.toDisplay(e, nameByUser[e.user_id] || 'Usuario')
      );
      this.entries.set(display);

      await this.loadAvailableTimes();
    } catch (err) {
      console.error('Error loading waitlist entries:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar las inscripciones.',
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  private toDisplay(
    e: WaitlistEntry,
    userDisplayName: string
  ): DisplayWaitlistEntry {
    const map: Record<
      WaitlistStatus,
      { label: string; severity: DisplayWaitlistEntry['statusSeverity'] }
    > = {
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
      userDisplayName,
      canCancel: e.status === 'waiting',
      canPromote: e.status === 'waiting',
    };
  }

  async loadAvailableTimes() {
    const range = this.dateRange();
    if (!range || !range[0]) {
      this.availableTimes.set([{ label: 'Todas las horas', value: 'all' }]);
      return;
    }

    const startDate = range[0];
    let dayOfWeek = startDate.getDay();
    dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

    try {
      const { data, error } = await this.supabaseService.client
        .from('schedule_slots')
        .select('start_time')
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .order('start_time');

      if (error) throw error;

      const times = [{ label: 'Todas las horas', value: 'all' }];
      const generated = new Set<string>();
      (data || []).forEach((slot: any) => {
        generated.add(slot.start_time.substring(0, 5));
      });
      Array.from(generated)
        .sort()
        .forEach((t) => times.push({ label: t, value: t }));
      this.availableTimes.set(times);
    } catch {
      this.availableTimes.set([{ label: 'Todas las horas', value: 'all' }]);
    }
  }

  onDateRangeChange() {
    const r = this.dateRange();
    if (r && r.length === 2 && r[0] && r[1]) {
      this.loadEntries();
    }
  }

  onStatusChange() {
    this.loadEntries();
  }

  clearFilters() {
    this.setDefaultRange();
    this.selectedStatus.set('waiting');
    this.searchTerm.set('');
    this.selectedTime.set('all');
    this.loadEntries();
  }

  // Filtro front-end (búsqueda y hora)
  get filteredEntries(): DisplayWaitlistEntry[] {
    let list = [...this.entries()];

    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      list = list.filter((e) =>
        e.userDisplayName.toLowerCase().includes(term)
      );
    }

    const time = this.selectedTime();
    if (time && time !== 'all') {
      list = list.filter((e) => e.formattedTime === time);
    }

    return list;
  }

  // KPI counts (sobre filtered)
  getCount(status: WaitlistStatus | 'all'): number {
    const list = this.filteredEntries;
    if (status === 'all') return list.length;
    return list.filter((e) => e.status === status).length;
  }

  // Mobile pagination
  get paginatedEntries(): DisplayWaitlistEntry[] {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    return this.filteredEntries.slice(start, start + this.mobileRowsPerPage());
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }

  // Acciones
  confirmCancel(entry: DisplayWaitlistEntry) {
    this.confirmationService.confirm({
      message: `¿Cancelar la inscripción de ${entry.userDisplayName} del ${entry.formattedDate} a las ${entry.formattedTime}?`,
      header: 'Confirmar cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'No',
      accept: () => this.cancel(entry),
    });
  }

  async cancel(entry: DisplayWaitlistEntry) {
    const result = await this.waitlistService.cancelWaitlistEntry(entry.id);
    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Inscripción cancelada',
        detail: `Inscripción de ${entry.userDisplayName} cancelada.`,
      });
      await this.loadEntries();
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'No se pudo cancelar la inscripción.',
      });
    }
  }

  confirmPromote(entry: DisplayWaitlistEntry) {
    this.confirmationService.confirm({
      message: `Forzar la promoción de la lista de espera para ${entry.formattedDate} a las ${entry.formattedTime}? Se intentará promover en orden FIFO a quienes quepan en la capacidad libre.`,
      header: 'Forzar promoción',
      icon: 'pi pi-bolt',
      acceptLabel: 'Sí, promover',
      rejectLabel: 'No',
      accept: () => this.promote(entry),
    });
  }

  async promote(entry: DisplayWaitlistEntry) {
    try {
      const { data, error } = await this.supabaseService.client.rpc(
        'promote_waitlist_for_session',
        {
          p_session_date: entry.session_date,
          p_session_time: entry.session_time,
        }
      );
      if (error) throw error;

      const result: any = data;
      if (result?.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Promoción ejecutada',
          detail: `Promovidas: ${result.promoted_count}, falladas: ${result.failed_count}, omitidas: ${result.skipped_count}.`,
          life: 6000,
        });
        await this.loadEntries();
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: 'Sin promoción',
          detail: result?.error || 'No se promovieron entradas.',
        });
      }
    } catch (err: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: err?.message || 'Error inesperado al promover.',
      });
    }
  }

  formatDateForDisplay = formatDateForDisplay;
}
