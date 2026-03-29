import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageService, ConfirmationService } from 'primeng/api';
import {
  MembershipService,
  Membership,
  MembershipSchedule,
} from '../../../../core/services/membership.service';
import { ScheduleService, ScheduleSlot } from '../../../../core/services/schedule.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

interface ScheduleOption {
  label: string;
  value: string;
  slot: ScheduleSlot;
}

interface PendingSchedule {
  slotId: string;
  slotLabel: string;
  beds: number[];
}

@Component({
  selector: 'app-admin-memberships',
  imports: [
    FormsModule,
    CardModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    MultiSelectModule,
    ToggleSwitchModule,
    SkeletonModule,
    TooltipModule,
    IconFieldModule,
    InputIconModule,
    AutoCompleteModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-memberships.html',
  styleUrl: './admin-memberships.scss',
})
export class AdminMemberships implements OnInit {
  private membershipService = inject(MembershipService);
  private scheduleService = inject(ScheduleService);
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  // State
  memberships = signal<Membership[]>([]);
  loading = signal(true);
  searchTerm = signal('');

  // Dialog state
  showDialog = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
  saving = signal(false);

  // Form
  formClientName = '';
  formUserId: string | null = null;
  formNotes = '';
  selectedUser: any = null;
  filteredUsers = signal<any[]>([]);
  linkToWebUser = true; // toggle: link to web user (default ON)

  // Schedule assignment dialog
  showScheduleDialog = signal(false);
  selectedMembership = signal<Membership | null>(null);
  editingMembershipId = signal<string | null>(null);

  // Schedule form (used in both create dialog and schedule dialog)
  scheduleOptions = signal<ScheduleOption[]>([]);
  selectedScheduleSlotId = '';
  selectedBeds = signal<number[]>([]);
  occupiedBedsByOtherMemberships = signal<number[]>([]);
  loadingBeds = signal(false);

  // Pending schedules for create mode (multiple horarios at once)
  pendingSchedules = signal<PendingSchedule[]>([]);
  sameBeds = true; // toggle: same beds for all schedules
  selectedSlotIds = signal<string[]>([]); // multi-select for same-beds mode

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    try {
      const [memberships] = await Promise.all([
        this.membershipService.loadMemberships(),
        this.loadScheduleOptions(),
      ]);
      this.memberships.set(memberships);
    } catch (error) {
      console.error('Error loading data:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los datos',
      });
    } finally {
      this.loading.set(false);
    }
  }

  private async loadScheduleOptions() {
    const slots = await this.scheduleService.getAllScheduleSlots(true);
    const options: ScheduleOption[] = slots
      .filter((s) => s.is_active)
      .map((s) => ({
        label: `${s.day_name} ${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}`,
        value: s.id,
        slot: s,
      }));
    this.scheduleOptions.set(options);
  }

  // Filtered memberships
  get filteredMemberships(): Membership[] {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.memberships();
    return this.memberships().filter(
      (m) =>
        m.client_name.toLowerCase().includes(term) ||
        (m.user_full_name && m.user_full_name.toLowerCase().includes(term))
    );
  }

  get activeMembershipsCount(): number {
    return this.memberships().filter((m) => m.is_active).length;
  }

  get totalSchedulesCount(): number {
    return this.memberships().reduce((acc, m) => acc + m.schedules.length, 0);
  }

  // ============================================================
  // MEMBERSHIP CRUD
  // ============================================================

  openCreateDialog() {
    this.dialogMode.set('create');
    this.formClientName = '';
    this.formUserId = null;
    this.formNotes = '';
    this.selectedUser = null;
    this.linkToWebUser = true;
    this.editingMembershipId.set(null);
    this.selectedScheduleSlotId = '';
    this.selectedBeds.set([]);
    this.occupiedBedsByOtherMemberships.set([]);
    this.pendingSchedules.set([]);
    this.sameBeds = true;
    this.selectedSlotIds.set([]);
    this.showDialog.set(true);
  }

  openEditDialog(membership: Membership) {
    this.dialogMode.set('edit');
    this.formClientName = membership.client_name;
    this.formUserId = membership.user_id;
    this.formNotes = membership.notes || '';
    this.linkToWebUser = !!membership.user_id;
    this.selectedUser = membership.user_id
      ? { id: membership.user_id, full_name: membership.user_full_name || '' }
      : null;
    this.editingMembershipId.set(membership.id);
    this.showDialog.set(true);
  }

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
    const user = event?.value ?? event;
    if (user && typeof user === 'object' && user.id) {
      this.formUserId = user.id;
      this.selectedUser = user;
      // Auto-fill client name from user's full_name
      if (user.full_name) {
        this.formClientName = user.full_name;
      }
    }
  }

  onUserClear() {
    this.formUserId = null;
    this.selectedUser = null;
    this.formClientName = '';
  }

  onLinkToggleChange() {
    // Reset user/name when switching modes
    this.formUserId = null;
    this.selectedUser = null;
    this.formClientName = '';
  }

  clearUserSelection() {
    this.formUserId = null;
    this.selectedUser = null;
    this.formClientName = '';
  }

  async saveMembership() {
    if (this.linkToWebUser && !this.formUserId) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Debes seleccionar un usuario de la web',
      });
      return;
    }

    if (!this.linkToWebUser && !this.formClientName.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'El nombre del cliente es requerido',
      });
      return;
    }

    // Ensure client_name is set
    if (this.linkToWebUser && this.selectedUser?.full_name) {
      this.formClientName = this.selectedUser.full_name;
    }

    if (!this.formClientName.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'El nombre del cliente es requerido',
      });
      return;
    }

    this.saving.set(true);
    try {
      if (this.dialogMode() === 'create') {
        const result = await this.membershipService.createMembership({
          client_name: this.formClientName.trim(),
          user_id: this.formUserId,
          notes: this.formNotes.trim() || null,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // Build the list of schedules to save
        const schedulesToSave = this.buildSchedulesToSave();

        if (schedulesToSave.length > 0 && result.id) {
          const errors: string[] = [];
          for (const schedule of schedulesToSave) {
            const scheduleResult = await this.membershipService.addSchedule(
              result.id,
              schedule.slotId,
              schedule.beds
            );
            if (!scheduleResult.success) {
              errors.push(`${schedule.slotLabel}: ${scheduleResult.error}`);
            }
          }
          if (errors.length > 0) {
            this.messageService.add({
              severity: 'warn',
              summary: 'Atenci\u00f3n',
              detail: 'Membres\u00eda creada pero algunos horarios fallaron:\n' + errors.join('\n'),
            });
          }
        }

        this.messageService.add({
          severity: 'success',
          summary: '\u00c9xito',
          detail: `Membres\u00eda creada con ${schedulesToSave.length} horario(s)`,
        });
      } else {
        const id = this.editingMembershipId();
        if (!id) return;

        const result = await this.membershipService.updateMembership(id, {
          client_name: this.formClientName.trim(),
          user_id: this.formUserId,
          notes: this.formNotes.trim() || null,
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        this.messageService.add({
          severity: 'success',
          summary: '\u00c9xito',
          detail: 'Membres\u00eda actualizada correctamente',
        });
      }

      this.showDialog.set(false);
      await this.loadData();
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al guardar la membres\u00eda',
      });
    } finally {
      this.saving.set(false);
    }
  }

  async toggleMembershipActive(membership: Membership) {
    const newState = !membership.is_active;
    const action = newState ? 'activar' : 'pausar';

    this.confirmationService.confirm({
      message: `\u00bfEst\u00e1s seguro de ${action} la membres\u00eda de ${membership.client_name}?${!newState ? '\n\nLas camas asignadas quedar\u00e1n disponibles para reservas mientras est\u00e9 pausada.' : ''}`,
      header: `Confirmar ${newState ? 'activaci\u00f3n' : 'pausa'}`,
      icon: newState ? 'pi pi-check-circle' : 'pi pi-pause-circle',
      acceptLabel: `S\u00ed, ${action}`,
      rejectLabel: 'No',
      accept: async () => {
        const result = await this.membershipService.updateMembership(membership.id, {
          is_active: newState,
        });

        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: '\u00c9xito',
            detail: `Membres\u00eda ${newState ? 'activada' : 'pausada'} correctamente`,
          });
          await this.loadData();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error || 'Error al actualizar la membres\u00eda',
          });
        }
      },
    });
  }

  confirmDeleteMembership(membership: Membership) {
    this.confirmationService.confirm({
      message: `\u00bfEst\u00e1s seguro de eliminar la membres\u00eda de ${membership.client_name}?\n\nSe eliminar\u00e1n todos los horarios y camas asignadas. Esta acci\u00f3n no se puede deshacer.`,
      header: 'Confirmar eliminaci\u00f3n',
      icon: 'pi pi-trash',
      acceptLabel: 'S\u00ed, eliminar',
      rejectLabel: 'No',
      accept: async () => {
        const result = await this.membershipService.deleteMembership(membership.id);

        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: '\u00c9xito',
            detail: 'Membres\u00eda eliminada correctamente',
          });
          await this.loadData();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error || 'Error al eliminar la membres\u00eda',
          });
        }
      },
    });
  }

  // ============================================================
  // SCHEDULE MANAGEMENT
  // ============================================================

  openScheduleDialog(membership: Membership) {
    this.selectedMembership.set(membership);
    this.selectedScheduleSlotId = '';
    this.selectedBeds.set([]);
    this.occupiedBedsByOtherMemberships.set([]);
    this.showScheduleDialog.set(true);
  }

  async onScheduleSlotChange() {
    if (!this.selectedScheduleSlotId) {
      this.occupiedBedsByOtherMemberships.set([]);
      this.selectedBeds.set([]);
      return;
    }

    this.loadingBeds.set(true);
    try {
      // In schedule dialog we have a membership to exclude; in create mode we don't
      const membership = this.selectedMembership();
      const excludeId = membership?.id || this.editingMembershipId() || undefined;

      const validation = await this.membershipService.validateBeds(
        this.selectedScheduleSlotId,
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        excludeId
      );

      this.occupiedBedsByOtherMemberships.set(validation.conflicting_beds || []);
      this.selectedBeds.set([]);
    } catch (error) {
      console.error('Error loading bed availability:', error);
    } finally {
      this.loadingBeds.set(false);
    }
  }

  toggleBed(bedNumber: number) {
    const current = this.selectedBeds();
    if (current.includes(bedNumber)) {
      this.selectedBeds.set(current.filter((b) => b !== bedNumber));
    } else {
      this.selectedBeds.set([...current, bedNumber]);
    }
  }

  isBedOccupied(bed: number): boolean {
    return this.occupiedBedsByOtherMemberships().includes(bed);
  }

  isBedSelected(bed: number): boolean {
    return this.selectedBeds().includes(bed);
  }

  getScheduleOptionLabel(slotId: string): string {
    const option = this.scheduleOptions().find((o) => o.value === slotId);
    return option ? option.label : slotId;
  }

  // Available options for the schedule management dialog (existing membership)
  get availableScheduleOptions(): ScheduleOption[] {
    const membership = this.selectedMembership();
    if (!membership) return this.scheduleOptions();
    const assignedIds = new Set(membership.schedules.map((s) => s.schedule_slot_id));
    return this.scheduleOptions().filter((o) => !assignedIds.has(o.value));
  }

  // Available options for the create dialog (excludes already-added pending schedules)
  get availableScheduleOptionsForCreate(): ScheduleOption[] {
    const pendingIds = new Set(this.pendingSchedules().map((p) => p.slotId));
    return this.scheduleOptions().filter((o) => !pendingIds.has(o.value));
  }

  // Builds the final list of schedules to save based on current mode
  private buildSchedulesToSave(): PendingSchedule[] {
    if (this.sameBeds) {
      // Same-beds mode: beds + multi-selected slots
      const beds = this.selectedBeds();
      const slotIds = this.selectedSlotIds();
      if (beds.length === 0 || slotIds.length === 0) return [];
      return slotIds.map((slotId) => ({
        slotId,
        slotLabel: this.getScheduleOptionLabel(slotId),
        beds: [...beds],
      }));
    } else {
      // Per-schedule mode: pending list + current unsaved selection
      const list = [...this.pendingSchedules()];
      if (this.selectedScheduleSlotId && this.selectedBeds().length > 0) {
        list.push({
          slotId: this.selectedScheduleSlotId,
          slotLabel: this.getScheduleOptionLabel(this.selectedScheduleSlotId),
          beds: [...this.selectedBeds()],
        });
      }
      return list;
    }
  }

  addPendingSchedule() {
    if (!this.selectedScheduleSlotId || this.selectedBeds().length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenci\u00f3n',
        detail: 'Selecciona un horario y al menos una cama',
      });
      return;
    }

    const label = this.getScheduleOptionLabel(this.selectedScheduleSlotId);
    const pending: PendingSchedule = {
      slotId: this.selectedScheduleSlotId,
      slotLabel: label,
      beds: [...this.selectedBeds()],
    };

    this.pendingSchedules.set([...this.pendingSchedules(), pending]);
    this.selectedScheduleSlotId = '';
    this.selectedBeds.set([]);
    this.occupiedBedsByOtherMemberships.set([]);
  }

  removePendingSchedule(index: number) {
    const current = this.pendingSchedules();
    this.pendingSchedules.set(current.filter((_, i) => i !== index));
  }

  onSameBedsToggle() {
    // Reset schedule selections when switching modes
    this.selectedScheduleSlotId = '';
    this.selectedSlotIds.set([]);
    this.selectedBeds.set([]);
    this.occupiedBedsByOtherMemberships.set([]);
    this.pendingSchedules.set([]);
  }

  async addScheduleToMembership() {
    const membership = this.selectedMembership();
    if (!membership || !this.selectedScheduleSlotId || this.selectedBeds().length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atenci\u00f3n',
        detail: 'Selecciona un horario y al menos una cama',
      });
      return;
    }

    this.saving.set(true);
    try {
      const result = await this.membershipService.addSchedule(
        membership.id,
        this.selectedScheduleSlotId,
        this.selectedBeds()
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      this.messageService.add({
        severity: 'success',
        summary: '\u00c9xito',
        detail: 'Horario asignado correctamente',
      });

      // Reset form and reload
      this.selectedScheduleSlotId = '';
      this.selectedBeds.set([]);
      this.occupiedBedsByOtherMemberships.set([]);
      await this.loadData();

      // Update selected membership reference
      const updated = this.memberships().find((m) => m.id === membership.id);
      if (updated) this.selectedMembership.set(updated);
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'Error al asignar el horario',
      });
    } finally {
      this.saving.set(false);
    }
  }

  confirmRemoveSchedule(schedule: MembershipSchedule) {
    const slotLabel = `${schedule.day_name} ${schedule.start_time.substring(0, 5)}`;

    this.confirmationService.confirm({
      message: `\u00bfQuitar el horario ${slotLabel} (camas ${schedule.bed_numbers.join(', ')})?`,
      header: 'Quitar horario',
      icon: 'pi pi-times-circle',
      acceptLabel: 'S\u00ed, quitar',
      rejectLabel: 'No',
      accept: async () => {
        const result = await this.membershipService.removeSchedule(schedule.id);

        if (result.success) {
          this.messageService.add({
            severity: 'success',
            summary: '\u00c9xito',
            detail: 'Horario removido correctamente',
          });
          await this.loadData();

          const membership = this.selectedMembership();
          if (membership) {
            const updated = this.memberships().find((m) => m.id === membership.id);
            if (updated) this.selectedMembership.set(updated);
          }
        } else {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: result.error || 'Error al quitar el horario',
          });
        }
      },
    });
  }

  async toggleScheduleActive(schedule: MembershipSchedule) {
    const result = await this.membershipService.toggleScheduleActive(
      schedule.id,
      !schedule.is_active
    );

    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: '\u00c9xito',
        detail: `Horario ${!schedule.is_active ? 'activado' : 'pausado'}`,
      });
      await this.loadData();

      const membership = this.selectedMembership();
      if (membership) {
        const updated = this.memberships().find((m) => m.id === membership.id);
        if (updated) this.selectedMembership.set(updated);
      }
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: result.error || 'Error al cambiar estado del horario',
      });
    }
  }
}
