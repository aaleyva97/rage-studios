import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { MultiSelectModule } from 'primeng/multiselect';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { SkeletonModule } from 'primeng/skeleton';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { SupabaseService } from '../../../../core/services/supabase-service';
import { ScheduleService, ScheduleSlot, Coach } from '../../../../core/services/schedule.service';
import { MessageService, ConfirmationService } from 'primeng/api';

interface ScheduleSlotForm {
  id?: string;
  day_of_week: number;
  day_name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  max_capacity: number;
  description: string;
  coaches: Coach[];
}

interface ExceptionForm {
  id?: string;
  schedule_slot_id: string;
  override_date: Date | null;
  description: string;
  coaches: Coach[];
}

@Component({
  selector: 'app-admin-schedule',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    CardModule,
    DialogModule,
    SelectModule,
    InputTextModule,
    TextareaModule,
    DatePickerModule,
    TooltipModule,
    CheckboxModule,
    MultiSelectModule,
    ConfirmDialogModule,
    ToastModule,
    SkeletonModule,
    ChipModule,
    TagModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './admin-schedule.html',
  styleUrls: ['./admin-schedule.scss']
})
export class AdminSchedule implements OnInit {
  private supabaseService = inject(SupabaseService);
  private scheduleService = inject(ScheduleService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  // Estados del componente
  scheduleSlots = signal<ScheduleSlot[]>([]);
  availableCoaches = signal<Coach[]>([]);
  loading = signal(false);
  
  // Dialog state for schedule slots
  showDialog = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
  selectedSlot = signal<ScheduleSlotForm | null>(null);
  public selectedCoaches = signal<string[]>([]);

  // Dialog state for exceptions
  showExceptionDialog = signal(false);
  exceptionDialogMode = signal<'create' | 'edit'>('create');
  selectedException = signal<ExceptionForm | null>(null);
  selectedExceptionCoaches = signal<string[]>([]);
  minDate = new Date();

  // Opciones para dropdowns
  daysOfWeek = [
    { label: 'Lunes', value: 1 },
    { label: 'Martes', value: 2 },
    { label: 'Miércoles', value: 3 },
    { label: 'Jueves', value: 4 },
    { label: 'Viernes', value: 5 },
    { label: 'Sábado', value: 6 },
    { label: 'Domingo', value: 7 }
  ];

  /**
   * Genera opciones de tiempo de 06:00 a 21:00 con incrementos de 5 minutos
   * Ejemplos: 06:00, 06:05, 06:10, ..., 20:55, 21:00
   * Total: 181 opciones (16 horas * 12 opciones/hora + 1)
   */
  private generateTimeOptions(): Array<{ label: string; value: string }> {
    const options: Array<{ label: string; value: string }> = [];
    const startHour = 6;
    const endHour = 21;
    const minuteStep = 5;

    for (let hour = startHour; hour <= endHour; hour++) {
      // Para la hora final (21), solo agregar 21:00
      const maxMinute = hour === endHour ? 0 : 55;

      for (let minute = 0; minute <= maxMinute; minute += minuteStep) {
        const hourStr = hour.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');
        const timeLabel = `${hourStr}:${minuteStr}`;
        const timeValue = `${hourStr}:${minuteStr}:00`;

        options.push({ label: timeLabel, value: timeValue });
      }
    }

    return options;
  }

  // Horarios predefinidos: Opciones de 6:00 a 21:00 con incrementos de 5 minutos
  // Esto permite crear horarios como 6:25-7:25, 7:10-8:10, etc.
  timeOptions = this.generateTimeOptions();

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading.set(true);
    
    try {
      // Cargar horarios y coaches en paralelo
      const [scheduleSlots, coaches] = await Promise.all([
        this.scheduleService.getAllScheduleSlots(true),
        this.scheduleService.getAllCoaches()
      ]);

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
    this.selectedSlot.set({
      day_of_week: 1,
      day_name: 'Lunes',
      start_time: '06:00:00',
      end_time: '07:00:00',
      is_active: true,
      max_capacity: 14,
      description: '',
      coaches: []
    });
    this.selectedCoaches.set([]);
    this.showDialog.set(true);
  }

  openEditDialog(slot: ScheduleSlot) {
    this.dialogMode.set('edit');
    this.selectedSlot.set({
      id: slot.id,
      day_of_week: slot.day_of_week,
      day_name: slot.day_name,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_active: slot.is_active,
      max_capacity: slot.max_capacity,
      description: slot.description || '',
      coaches: [...slot.coaches]
    });
    // Extraer IDs de coaches para el multiselect
    this.selectedCoaches.set(slot.coaches.map(c => c.id));
    this.showDialog.set(true);
  }

  closeDialog() {
    this.showDialog.set(false);
    this.selectedSlot.set(null);
    this.selectedCoaches.set([]);
  }

  onDayOfWeekChange() {
    const slot = this.selectedSlot();
    if (slot) {
      const dayOption = this.daysOfWeek.find(d => d.value === slot.day_of_week);
      if (dayOption) {
        this.selectedSlot.set({
          ...slot,
          day_name: dayOption.label
        });
      }
    }
  }

  async saveSlot() {
    const slot = this.selectedSlot();
    if (!slot) return;

    // Validaciones
    if (!slot.day_of_week || !slot.start_time || !slot.end_time) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Por favor complete todos los campos requeridos'
      });
      return;
    }

    if (slot.start_time >= slot.end_time) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'La hora de inicio debe ser menor a la hora de fin'
      });
      return;
    }

    // Validar que el horario sea exactamente de 1 hora (60 minutos)
    const startMinutes = this.parseTimeToMinutes(slot.start_time);
    const endMinutes = this.parseTimeToMinutes(slot.end_time);
    const durationMinutes = endMinutes - startMinutes;

    if (durationMinutes !== 60) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: `El horario debe ser exactamente de 1 hora. Duración actual: ${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      });
      return;
    }

    this.loading.set(true);

    try {
      let result;
      
      if (this.dialogMode() === 'create') {
        result = await this.scheduleService.createScheduleSlot({
          day_of_week: slot.day_of_week,
          day_name: slot.day_name,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_active: slot.is_active,
          max_capacity: slot.max_capacity,
          description: slot.description
        });
        
        if (result.success && result.slot_id) {
          // Asignar coaches al nuevo slot
          const coachIds = this.selectedCoaches();
          for (let i = 0; i < coachIds.length; i++) {
            await this.scheduleService.assignCoachToSlot(
              result.slot_id,
              coachIds[i],
              i === 0 // El primero es principal
            );
          }
        }
      } else if (slot.id) {
        result = await this.scheduleService.updateScheduleSlot(slot.id, {
          day_of_week: slot.day_of_week,
          day_name: slot.day_name,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_active: slot.is_active,
          max_capacity: slot.max_capacity,
          description: slot.description
        });
        
        if (result.success) {
          // Reasignar coaches (simple: eliminar todos y volver a asignar)
          const currentSlot = this.scheduleSlots().find(s => s.id === slot.id);
          if (currentSlot) {
            // Remover coaches existentes
            for (const existingCoach of currentSlot.coaches) {
              await this.scheduleService.removeCoachFromSlot(slot.id!, existingCoach.id);
            }
          }
          
          // Asignar coaches nuevos
          const coachIds = this.selectedCoaches();
          for (let i = 0; i < coachIds.length; i++) {
            await this.scheduleService.assignCoachToSlot(
              slot.id,
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
          detail: `Horario ${this.dialogMode() === 'create' ? 'creado' : 'actualizado'} correctamente`
        });
        
        this.closeDialog();
        await this.loadData();
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: result?.error || 'Error al guardar el horario'
        });
      }
    } catch (error) {
      console.error('Error saving slot:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al guardar el horario'
      });
    } finally {
      this.loading.set(false);
    }
  }

  deleteSlot(slot: ScheduleSlot) {
    this.confirmationService.confirm({
      message: `¿Está seguro que desea eliminar el horario del ${slot.day_name} de ${slot.start_time} a ${slot.end_time}?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        this.loading.set(true);
        
        try {
          const result = await this.scheduleService.deleteScheduleSlot(slot.id);
          
          if (result.success) {
            this.messageService.add({
              severity: 'success',
              summary: 'Éxito',
              detail: 'Horario eliminado correctamente'
            });
            
            await this.loadData();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: result.error || 'Error al eliminar el horario'
            });
          }
        } catch (error) {
          console.error('Error deleting slot:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Error al eliminar el horario'
          });
        } finally {
          this.loading.set(false);
        }
      }
    });
  }

  toggleSlotStatus(slot: ScheduleSlot) {
    const newStatus = !slot.is_active;
    
    this.confirmationService.confirm({
      message: `¿Está seguro que desea ${newStatus ? 'activar' : 'desactivar'} este horario?`,
      header: 'Confirmar cambio',
      icon: 'pi pi-question-circle',
      accept: async () => {
        this.loading.set(true);
        
        try {
          const result = await this.scheduleService.updateScheduleSlot(slot.id, {
            is_active: newStatus
          });
          
          if (result.success) {
            this.messageService.add({
              severity: 'success',
              summary: 'Éxito',
              detail: `Horario ${newStatus ? 'activado' : 'desactivado'} correctamente`
            });
            
            await this.loadData();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: result.error || 'Error al cambiar estado del horario'
            });
          }
        } catch (error) {
          console.error('Error toggling slot status:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Error al cambiar estado del horario'
          });
        } finally {
          this.loading.set(false);
        }
      }
    });
  }

  /**
   * Convierte una cadena de tiempo "HH:MM:SS" a minutos totales desde medianoche
   * Ejemplos:
   * - "06:00:00" -> 360 (6 * 60)
   * - "06:25:00" -> 385 (6 * 60 + 25)
   * - "21:00:00" -> 1260 (21 * 60)
   */
  private parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  }

  // Método para formatear coaches como string
  formatCoaches(coaches: Coach[]): string {
    if (coaches.length === 0) return 'Sin coach asignado';
    
    const primary = coaches.find(c => c.is_primary);
    const others = coaches.filter(c => !c.is_primary);
    
    if (primary && others.length > 0) {
      return `${primary.name} (Principal), ${others.map(c => c.name).join(', ')}`;
    }
    
    return coaches.map(c => c.name).join(', ');
  }

  // Método para obtener severidad del tag de estado
  getStatusSeverity(isActive: boolean): 'success' | 'danger' {
    return isActive ? 'success' : 'danger';
  }

  // Método para obtener texto del estado
  getStatusText(isActive: boolean): string {
    return isActive ? 'Activo' : 'Inactivo';
  }

  // Método para obtener severidad de botones
  getButtonSeverity(isActive: boolean): 'secondary' | 'success' {
    return isActive ? 'secondary' : 'success';
  }

  // Métodos para calcular estadísticas
  get activeSlots() {
    return this.scheduleSlots().filter(s => s.is_active);
  }

  get inactiveSlots() {
    return this.scheduleSlots().filter(s => !s.is_active);
  }

  // Preparar opciones de coaches para MultiSelect
  get coachOptions() {
    return this.availableCoaches();
  }

  // Método para manejar selección de coaches
  onCoachesChange(selectedCoachIds: string[]) {
    this.selectedCoaches.set(selectedCoachIds);

    const slot = this.selectedSlot();
    if (slot) {
      // Convertir IDs a objetos Coach con is_primary
      const selectedCoachObjects = selectedCoachIds.map((id, index) => {
        const coach = this.availableCoaches().find(c => c.id === id);
        return {
          id: coach?.id || id,
          name: coach?.name || '',
          image_url: coach?.image_url,
          is_primary: index === 0 // El primer coach seleccionado será primary
        };
      });

      this.selectedSlot.set({
        ...slot,
        coaches: selectedCoachObjects
      });
    }
  }

  // Abrir dialog de excepciones para este horario
  viewExceptions(slot: ScheduleSlot) {
    this.exceptionDialogMode.set('create');
    this.selectedException.set({
      schedule_slot_id: slot.id,
      override_date: null,
      description: '',
      coaches: []
    });
    this.selectedExceptionCoaches.set([]);
    this.showExceptionDialog.set(true);
  }

  closeExceptionDialog() {
    this.showExceptionDialog.set(false);
    this.selectedException.set(null);
    this.selectedExceptionCoaches.set([]);
  }

  onExceptionCoachesChange(selectedCoachIds: string[]) {
    this.selectedExceptionCoaches.set(selectedCoachIds);

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
      // Crear excepción
      const result = await this.scheduleService.createScheduleOverride(
        exception.schedule_slot_id,
        dateStr,
        exception.description
      );

      if (result.success && result.override_id) {
        // Asignar coaches al override
        const coachIds = this.selectedExceptionCoaches();
        for (let i = 0; i < coachIds.length; i++) {
          await this.scheduleService.assignCoachToOverride(
            result.override_id,
            coachIds[i],
            i === 0 // El primero es principal
          );
        }

        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Excepción creada correctamente'
        });

        this.closeExceptionDialog();
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
}