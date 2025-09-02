import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
// DatePicker import removed as it's not used in this component
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
  
  // Dialog state
  showDialog = signal(false);
  dialogMode = signal<'create' | 'edit'>('create');
  selectedSlot = signal<ScheduleSlotForm | null>(null);
  public selectedCoaches = signal<string[]>([]);

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

  // Horarios predefinidos
  timeOptions = [
    { label: '06:00', value: '06:00:00' },
    { label: '07:00', value: '07:00:00' },
    { label: '08:00', value: '08:00:00' },
    { label: '09:00', value: '09:00:00' },
    { label: '10:00', value: '10:00:00' },
    { label: '11:00', value: '11:00:00' },
    { label: '12:00', value: '12:00:00' },
    { label: '13:00', value: '13:00:00' },
    { label: '14:00', value: '14:00:00' },
    { label: '15:00', value: '15:00:00' },
    { label: '16:00', value: '16:00:00' },
    { label: '17:00', value: '17:00:00' },
    { label: '18:00', value: '18:00:00' },
    { label: '19:00', value: '19:00:00' },
    { label: '20:00', value: '20:00:00' },
    { label: '21:00', value: '21:00:00' }
  ];

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
}