import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { SkeletonModule } from 'primeng/skeleton';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { SupabaseService } from '../../../../core/services/supabase-service';
import { ScheduleService, ScheduleSlotOverride, ScheduleSlot, Coach } from '../../../../core/services/schedule.service';
import { MessageService, ConfirmationService } from 'primeng/api';

interface ExceptionForm {
  id?: string;
  schedule_slot_id: string;
  override_date: Date | null;
  description: string;
  coaches: Coach[];
}

@Component({
  selector: 'app-admin-exceptions',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    CardModule,
    DialogModule,
    SelectModule,
    DatePickerModule,
    TextareaModule,
    TooltipModule,
    MultiSelectModule,
    ConfirmDialogModule,
    ToastModule,
    SkeletonModule,
    ChipModule,
    TagModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-exceptions.html',
  styleUrls: ['./admin-exceptions.scss']
})
export class AdminExceptions implements OnInit {
  private supabaseService = inject(SupabaseService);
  private scheduleService = inject(ScheduleService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private route = inject(ActivatedRoute);

  // Estados del componente
  exceptions = signal<ScheduleSlotOverride[]>([]);
  scheduleSlots = signal<ScheduleSlot[]>([]);
  availableCoaches = signal<Coach[]>([]);
  loading = signal(false);

  // Dialog state
  showDialog = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
  selectedException = signal<ExceptionForm | null>(null);
  selectedCoaches = signal<string[]>([]);

  // Filtro para buscar excepciones
  selectedSlotFilter = signal<string | null>(null);

  // Fecha mínima para el date picker (hoy)
  minDate = new Date();

  async ngOnInit() {
    await this.loadData();

    // Leer parámetro de query para filtrar por horario
    this.route.queryParams.subscribe(params => {
      if (params['slotId']) {
        this.selectedSlotFilter.set(params['slotId']);
      }
    });
  }

  async loadData() {
    this.loading.set(true);

    try {
      // Cargar excepciones, horarios y coaches en paralelo
      const [exceptions, scheduleSlots, coaches] = await Promise.all([
        this.scheduleService.getAllScheduleOverrides(),
        this.scheduleService.getAllScheduleSlots(true),
        this.scheduleService.getAllCoaches()
      ]);

      this.exceptions.set(exceptions);
      this.scheduleSlots.set(scheduleSlots);
      this.availableCoaches.set(coaches);
    } catch (error) {
      console.error('Error loading data:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los datos'
      });
    } finally {
      this.loading.set(false);
    }
  }

  openCreateDialog() {
    this.dialogMode.set('create');
    this.selectedException.set({
      schedule_slot_id: '',
      override_date: null,
      description: '',
      coaches: []
    });
    this.selectedCoaches.set([]);
    this.showDialog.set(true);
  }

  openEditDialog(exception: ScheduleSlotOverride) {
    this.dialogMode.set('edit');

    // Convertir string date a Date object
    const [year, month, day] = exception.override_date.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    this.selectedException.set({
      id: exception.id,
      schedule_slot_id: exception.schedule_slot_id,
      override_date: date,
      description: exception.description || '',
      coaches: [...exception.coaches]
    });

    this.selectedCoaches.set(exception.coaches.map(c => c.id));
    this.showDialog.set(true);
  }

  closeDialog() {
    this.showDialog.set(false);
    this.selectedException.set(null);
    this.selectedCoaches.set([]);
  }

  async saveException() {
    const exception = this.selectedException();
    if (!exception) return;

    // Validaciones
    if (!exception.schedule_slot_id || !exception.override_date) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Por favor complete todos los campos requeridos'
      });
      return;
    }

    // Convertir Date a string YYYY-MM-DD
    const year = exception.override_date.getFullYear();
    const month = String(exception.override_date.getMonth() + 1).padStart(2, '0');
    const day = String(exception.override_date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    this.loading.set(true);

    try {
      let result;

      if (this.dialogMode() === 'create') {
        // Crear excepción
        result = await this.scheduleService.createScheduleOverride(
          exception.schedule_slot_id,
          dateStr,
          exception.description
        );

        if (result.success && result.override_id) {
          // Asignar coaches al override
          const coachIds = this.selectedCoaches();
          for (let i = 0; i < coachIds.length; i++) {
            await this.scheduleService.assignCoachToOverride(
              result.override_id,
              coachIds[i],
              i === 0 // El primero es principal
            );
          }
        }
      } else if (exception.id) {
        // Actualizar excepción
        result = await this.scheduleService.updateScheduleOverride(exception.id, {
          override_date: dateStr,
          description: exception.description
        });

        if (result.success) {
          // Reasignar coaches (eliminar todos y volver a asignar)
          const currentException = this.exceptions().find(e => e.id === exception.id);
          if (currentException) {
            // Remover coaches existentes
            for (const existingCoach of currentException.coaches) {
              await this.scheduleService.removeCoachFromOverride(exception.id!, existingCoach.id);
            }
          }

          // Asignar coaches nuevos
          const coachIds = this.selectedCoaches();
          for (let i = 0; i < coachIds.length; i++) {
            await this.scheduleService.assignCoachToOverride(
              exception.id,
              coachIds[i],
              i === 0 // El primero es principal
            );
          }
        }
      }

      if (result?.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: `Excepción ${this.dialogMode() === 'create' ? 'creada' : 'actualizada'} correctamente`
        });

        this.closeDialog();
        await this.loadData();
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result?.error || 'Error al guardar la excepción'
        });
      }
    } catch (error) {
      console.error('Error saving exception:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al guardar la excepción'
      });
    } finally {
      this.loading.set(false);
    }
  }

  deleteException(exception: ScheduleSlotOverride) {
    this.confirmationService.confirm({
      message: `¿Está seguro que desea eliminar la excepción del ${this.formatDate(exception.override_date)}?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        this.loading.set(true);

        try {
          const result = await this.scheduleService.deleteScheduleOverride(exception.id);

          if (result.success) {
            this.messageService.add({
              severity: 'success',
              summary: 'Éxito',
              detail: 'Excepción eliminada correctamente'
            });

            await this.loadData();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: result.error || 'Error al eliminar la excepción'
            });
          }
        } catch (error) {
          console.error('Error deleting exception:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Error al eliminar la excepción'
          });
        } finally {
          this.loading.set(false);
        }
      }
    });
  }

  // Formatear fecha para mostrar
  formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Formatear coaches como string
  formatCoaches(coaches: Coach[]): string {
    if (coaches.length === 0) return 'Sin coach asignado';

    const primary = coaches.find(c => c.is_primary);
    const others = coaches.filter(c => !c.is_primary);

    if (primary && others.length > 0) {
      return `${primary.name} (Principal), ${others.map(c => c.name).join(', ')}`;
    }

    return coaches.map(c => c.name).join(', ');
  }

  // Obtener el nombre del horario
  getScheduleSlotName(scheduleSlotId: string): string {
    const slot = this.scheduleSlots().find(s => s.id === scheduleSlotId);
    if (!slot) return 'Horario desconocido';

    return `${slot.day_name} ${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}`;
  }

  // Preparar opciones de horarios para el select
  get scheduleSlotOptions() {
    return this.scheduleSlots().map(slot => ({
      label: `${slot.day_name} ${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}`,
      value: slot.id
    }));
  }

  // Preparar opciones de coaches para MultiSelect
  get coachOptions() {
    return this.availableCoaches();
  }

  // Manejar selección de coaches
  onCoachesChange(selectedCoachIds: string[]) {
    this.selectedCoaches.set(selectedCoachIds);

    const exception = this.selectedException();
    if (exception) {
      const selectedCoachObjects = selectedCoachIds.map((id, index) => {
        const coach = this.availableCoaches().find(c => c.id === id);
        return {
          id: coach?.id || id,
          name: coach?.name || '',
          image_url: coach?.image_url,
          is_primary: index === 0
        };
      });

      this.selectedException.set({
        ...exception,
        coaches: selectedCoachObjects
      });
    }
  }

  // Filtrar excepciones (computed signal en lugar de getter)
  filteredExceptions = () => {
    const filter = this.selectedSlotFilter();
    if (!filter) return this.exceptions();

    return this.exceptions().filter(e => e.schedule_slot_id === filter);
  };

  // Estadísticas (computed signal en lugar de getter)
  upcomingExceptions = () => {
    const today = new Date().toISOString().split('T')[0];
    return this.exceptions().filter(e => e.override_date >= today);
  };

  pastExceptions = () => {
    const today = new Date().toISOString().split('T')[0];
    return this.exceptions().filter(e => e.override_date < today);
  };

  // Limpiar filtro
  clearFilter() {
    this.selectedSlotFilter.set(null);
  }
}
