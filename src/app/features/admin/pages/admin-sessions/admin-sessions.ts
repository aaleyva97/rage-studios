import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PaginatorModule } from 'primeng/paginator';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SessionsService, Session } from '../../../landing/services/sessions.service';

interface DayOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-admin-sessions',
  imports: [
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    SkeletonModule,
    PaginatorModule,
    CardModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    FileUploadModule,
    InputNumberModule,
    CheckboxModule,
    SelectModule
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-sessions.html',
  styleUrl: './admin-sessions.scss'
})
export class AdminSessions implements OnInit {
  private sessionsService = inject(SessionsService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  
  sessions = signal<Session[]>([]);
  isLoading = signal(true);
  skeletonData = Array(7).fill({});
  
  // Dialog state
  displayDialog = signal(false);
  isEditing = signal(false);
  isUploading = signal(false);
  
  // Form data
  sessionForm = signal<Partial<Session>>({
    class_name: '',
    class_subtitle: '',
    description: '',
    image_url: '',
    day_of_week: 1,
    day_name: 'LUNES',
    duration: '1 hora',
    level: 'Todos los niveles',
    max_spots: 14,
    order_index: 1,
    is_active: true
  });
  
  selectedFile = signal<File | null>(null);
  imagePreview = signal<string>('');
  
  // Form validation state
  formTouched = signal({
    class_name: false,
    day_of_week: false,
    day_name: false,
    image: false
  });
  
  formErrors = signal({
    class_name: '',
    day_of_week: '',
    day_name: '',
    image: ''
  });
  
  // Dropdown options
  dayOptions: DayOption[] = [
    { label: 'LUNES', value: 1 },
    { label: 'MARTES', value: 2 },
    { label: 'MIÉRCOLES', value: 3 },
    { label: 'JUEVES', value: 4 },
    { label: 'VIERNES', value: 5 },
    { label: 'SÁBADO', value: 6 },
    { label: 'DOMINGO', value: 7 }
  ];
  
  levelOptions = [
    'Todos los niveles',
    'Principiante',
    'Intermedio',
    'Avanzado'
  ];
  
  durationOptions = [
    '45 minutos',
    '1 hora',
    '1 hora 15 minutos',
    '1 hora 30 minutos'
  ];
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  async ngOnInit() {
    await this.loadSessions();
  }
  
  async loadSessions() {
    this.isLoading.set(true);
    
    try {
      const sessions = await this.sessionsService.getAllSessions();
      this.sessions.set(sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar las sesiones'
      });
    } finally {
      this.isLoading.set(false);
    }
  }
  
  openCreateDialog() {
    this.isEditing.set(false);
    const nextOrderIndex = Math.max(...this.sessions().map(s => s.order_index), 0) + 1;
    this.sessionForm.set({
      class_name: '',
      class_subtitle: '',
      description: '',
      image_url: '',
      day_of_week: 1,
      day_name: 'LUNES',
      duration: '1 hora',
      level: 'Todos los niveles',
      max_spots: 14,
      order_index: nextOrderIndex,
      is_active: true
    });
    this.selectedFile.set(null);
    this.imagePreview.set('');
    this.resetFormValidation();
    this.displayDialog.set(true);
  }
  
  openEditDialog(session: Session) {
    this.isEditing.set(true);
    this.sessionForm.set({
      id: session.id,
      class_name: session.class_name,
      class_subtitle: session.class_subtitle,
      description: session.description,
      image_url: session.image_url,
      day_of_week: session.day_of_week,
      day_name: session.day_name,
      duration: session.duration,
      level: session.level,
      max_spots: session.max_spots,
      order_index: session.order_index,
      is_active: session.is_active
    });
    this.selectedFile.set(null);
    this.imagePreview.set(session.image_url);
    this.resetFormValidation();
    this.displayDialog.set(true);
  }
  
  onFileSelect(event: any) {
    const file = event.files[0];
    if (file) {
      this.selectedFile.set(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview.set(e.target.result);
      };
      reader.readAsDataURL(file);
      this.onFieldTouch('image');
    }
  }
  
  onDayChange(dayValue: number) {
    const dayOption = this.dayOptions.find(d => d.value === dayValue);
    if (dayOption) {
      const form = this.sessionForm();
      this.sessionForm.set({
        ...form,
        day_of_week: dayValue,
        day_name: dayOption.label
      });
      this.validateField('day_of_week');
    }
  }
  
  async saveSession() {
    const form = this.sessionForm();
    
    // Validate form
    if (!this.validateForm()) {
      return;
    }
    
    this.isUploading.set(true);
    
    try {
      let imageUrl = form.image_url || '';
      
      // Upload new image if selected
      if (this.selectedFile()) {
        const file = this.selectedFile()!;
        const fileName = `${Date.now()}-${file.name}`;
        imageUrl = await this.sessionsService.uploadSessionImage(file, fileName);
      }
      
      const sessionData = {
        ...form,
        image_url: imageUrl
      };
      
      if (this.isEditing()) {
        await this.sessionsService.updateSession(form.id!, sessionData);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Sesión actualizada correctamente'
        });
      } else {
        await this.sessionsService.createSession(sessionData as Omit<Session, 'id' | 'created_at' | 'updated_at'>);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Sesión creada correctamente'
        });
      }
      
      this.displayDialog.set(false);
      await this.loadSessions();
      
    } catch (error) {
      console.error('Error saving session:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al guardar la sesión'
      });
    } finally {
      this.isUploading.set(false);
    }
  }
  
  confirmDeleteSession(session: Session) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de eliminar la sesión "${session.class_name}" del ${session.day_name}? Esta acción no se puede deshacer.`,
      header: 'Confirmar Eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.deleteSession(session)
    });
  }
  
  async deleteSession(session: Session) {
    try {
      await this.sessionsService.deleteSession(session.id);
      
      // Try to delete image from storage (optional)
      if (session.image_url) {
        try {
          const fileName = session.image_url.split('/').pop();
          if (fileName) {
            await this.sessionsService.deleteSessionImage(fileName);
          }
        } catch (imageError) {
          console.warn('Could not delete image:', imageError);
        }
      }
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Sesión eliminada correctamente'
      });
      
      await this.loadSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al eliminar la sesión'
      });
    }
  }
  
  // Mobile pagination methods
  get paginatedSessions() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.sessions().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
  
  getActiveSessionsCount(): number {
    return this.sessions().filter(session => session.is_active).length;
  }
  
  getInactiveSessionsCount(): number {
    return this.sessions().filter(session => !session.is_active).length;
  }
  
  getSessionsByDay(): Record<string, number> {
    const sessionsByDay: Record<string, number> = {};
    this.sessions().forEach(session => {
      sessionsByDay[session.day_name] = (sessionsByDay[session.day_name] || 0) + 1;
    });
    return sessionsByDay;
  }
  
  // Form validation methods
  resetFormValidation() {
    this.formTouched.set({
      class_name: false,
      day_of_week: false,
      day_name: false,
      image: false
    });
    this.formErrors.set({
      class_name: '',
      day_of_week: '',
      day_name: '',
      image: ''
    });
  }
  
  validateForm(): boolean {
    const form = this.sessionForm();
    let isValid = true;
    const errors = { class_name: '', day_of_week: '', day_name: '', image: '' };
    
    // Mark all fields as touched
    this.formTouched.set({
      class_name: true,
      day_of_week: true,
      day_name: true,
      image: true
    });
    
    // Validate class_name
    if (!form.class_name?.trim()) {
      errors.class_name = 'Este campo es requerido';
      isValid = false;
    }
    
    // Validate day_of_week
    if (!form.day_of_week || form.day_of_week < 1 || form.day_of_week > 7) {
      errors.day_of_week = 'Selecciona un día válido';
      isValid = false;
    }
    
    // Validate day_name
    if (!form.day_name?.trim()) {
      errors.day_name = 'Este campo es requerido';
      isValid = false;
    }
    
    // Validate image (only for create, not edit)
    if (!this.isEditing() && !form.image_url && !this.selectedFile()) {
      errors.image = 'La imagen es requerida';
      isValid = false;
    }
    
    this.formErrors.set(errors);
    return isValid;
  }
  
  onFieldTouch(fieldName: 'class_name' | 'day_of_week' | 'day_name' | 'image') {
    const touched = this.formTouched();
    this.formTouched.set({
      ...touched,
      [fieldName]: true
    });
    this.validateField(fieldName);
  }
  
  validateField(fieldName: 'class_name' | 'day_of_week' | 'day_name' | 'image') {
    const form = this.sessionForm();
    const errors = this.formErrors();
    
    switch (fieldName) {
      case 'class_name':
        errors.class_name = !form.class_name?.trim() ? 'Este campo es requerido' : '';
        break;
      case 'day_of_week':
        errors.day_of_week = (!form.day_of_week || form.day_of_week < 1 || form.day_of_week > 7) ? 'Selecciona un día válido' : '';
        break;
      case 'day_name':
        errors.day_name = !form.day_name?.trim() ? 'Este campo es requerido' : '';
        break;
      case 'image':
        if (!this.isEditing() && !form.image_url && !this.selectedFile()) {
          errors.image = 'La imagen es requerida';
        } else {
          errors.image = '';
        }
        break;
    }
    
    this.formErrors.set({ ...errors });
  }
  
  isFieldInvalid(fieldName: 'class_name' | 'day_of_week' | 'day_name' | 'image'): boolean {
    const touched = this.formTouched();
    const errors = this.formErrors();
    return touched[fieldName] && !!errors[fieldName];
  }
}
