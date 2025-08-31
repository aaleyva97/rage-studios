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
import { TooltipModule } from 'primeng/tooltip';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { FileUploadModule } from 'primeng/fileupload';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CoachesService, Coach } from '../../../landing/services/coaches.service';

@Component({
  selector: 'app-admin-coaches',
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
    TooltipModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
    FileUploadModule,
    InputNumberModule,
    CheckboxModule
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-coaches.html',
  styleUrl: './admin-coaches.scss'
})
export class AdminCoaches implements OnInit {
  private coachesService = inject(CoachesService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  
  coaches = signal<Coach[]>([]);
  isLoading = signal(true);
  skeletonData = Array(6).fill({});
  
  // Dialog state
  displayDialog = signal(false);
  isEditing = signal(false);
  isUploading = signal(false);
  
  // Form data
  coachForm = signal<Partial<Coach>>({
    name: '',
    description: '',
    image_url: '',
    order_index: 1,
    is_active: true
  });
  
  selectedFile = signal<File | null>(null);
  imagePreview = signal<string>('');
  
  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);
  
  async ngOnInit() {
    await this.loadCoaches();
  }
  
  async loadCoaches() {
    this.isLoading.set(true);
    
    try {
      const coaches = await this.coachesService.getAllCoaches();
      this.coaches.set(coaches);
    } catch (error) {
      console.error('Error loading coaches:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los coaches'
      });
    } finally {
      this.isLoading.set(false);
    }
  }
  
  openCreateDialog() {
    this.isEditing.set(false);
    this.coachForm.set({
      name: '',
      description: '',
      image_url: '',
      order_index: this.coaches().length + 1,
      is_active: true
    });
    this.selectedFile.set(null);
    this.imagePreview.set('');
    this.displayDialog.set(true);
  }
  
  openEditDialog(coach: Coach) {
    this.isEditing.set(true);
    this.coachForm.set({
      id: coach.id,
      name: coach.name,
      description: coach.description,
      image_url: coach.image_url,
      order_index: coach.order_index,
      is_active: coach.is_active
    });
    this.selectedFile.set(null);
    this.imagePreview.set(coach.image_url);
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
    }
  }
  
  async saveCoach() {
    const form = this.coachForm();
    
    if (!form.name || !form.description) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Advertencia',
        detail: 'Por favor completa todos los campos requeridos'
      });
      return;
    }
    
    this.isUploading.set(true);
    
    try {
      let imageUrl = form.image_url || '';
      
      // Upload new image if selected
      if (this.selectedFile()) {
        const file = this.selectedFile()!;
        const fileName = `${Date.now()}-${file.name}`;
        imageUrl = await this.coachesService.uploadCoachImage(file, fileName);
      }
      
      const coachData = {
        ...form,
        image_url: imageUrl
      };
      
      if (this.isEditing()) {
        await this.coachesService.updateCoach(form.id!, coachData);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Coach actualizado correctamente'
        });
      } else {
        await this.coachesService.createCoach(coachData as Omit<Coach, 'id' | 'created_at' | 'updated_at'>);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Coach creado correctamente'
        });
      }
      
      this.displayDialog.set(false);
      await this.loadCoaches();
      
    } catch (error) {
      console.error('Error saving coach:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al guardar el coach'
      });
    } finally {
      this.isUploading.set(false);
    }
  }
  
  confirmDeleteCoach(coach: Coach) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de eliminar al coach ${coach.name}? Esta acción no se puede deshacer.`,
      header: 'Confirmar Eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.deleteCoach(coach)
    });
  }
  
  async deleteCoach(coach: Coach) {
    try {
      await this.coachesService.deleteCoach(coach.id);
      
      // Try to delete image from storage (optional, doesn't fail if error)
      if (coach.image_url) {
        try {
          const fileName = coach.image_url.split('/').pop();
          if (fileName) {
            await this.coachesService.deleteCoachImage(fileName);
          }
        } catch (imageError) {
          console.warn('Could not delete image:', imageError);
        }
      }
      
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Coach eliminado correctamente'
      });
      
      await this.loadCoaches();
    } catch (error) {
      console.error('Error deleting coach:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al eliminar el coach'
      });
    }
  }
  
  // Mobile pagination methods
  get paginatedCoaches() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.coaches().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }
  
  getActiveCoachesCount(): number {
    return this.coaches().filter(coach => coach.is_active).length;
  }
  
  getInactiveCoachesCount(): number {
    return this.coaches().filter(coach => !coach.is_active).length;
  }
}
