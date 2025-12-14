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
import { FileUploadModule } from 'primeng/fileupload';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, ConfirmationService } from 'primeng/api';
import { SlidesService, HeroSlide } from '../../../landing/services/slides.service';

@Component({
  selector: 'app-admin-slides',
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
    FileUploadModule,
    InputNumberModule,
    CheckboxModule
  ],
  providers: [ConfirmationService],
  templateUrl: './admin-slides.html',
  styleUrl: './admin-slides.scss'
})
export class AdminSlides implements OnInit {
  private slidesService = inject(SlidesService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  slides = signal<HeroSlide[]>([]);
  isLoading = signal(true);
  skeletonData = Array(6).fill({});

  // Dialog state
  displayDialog = signal(false);
  isEditing = signal(false);
  isUploading = signal(false);

  // Form data
  slideForm = signal<Partial<HeroSlide>>({
    image_url: '',
    title: null,
    description: null,
    order_index: 1,
    is_active: true
  });

  selectedFile = signal<File | null>(null);
  imagePreview = signal<string>('');

  // Form validation state
  formTouched = signal({
    image: false
  });

  formErrors = signal({
    image: ''
  });

  // Mobile pagination
  mobileCurrentPage = signal(0);
  mobileRowsPerPage = signal(10);

  async ngOnInit() {
    await this.loadSlides();
  }

  async loadSlides() {
    this.isLoading.set(true);

    try {
      const slides = await this.slidesService.getAllSlides();
      this.slides.set(slides);
    } catch (error) {
      console.error('Error loading slides:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cargar los slides'
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  openCreateDialog() {
    this.isEditing.set(false);
    this.slideForm.set({
      image_url: '',
      title: null,
      description: null,
      order_index: this.slides().length + 1,
      is_active: true
    });
    this.selectedFile.set(null);
    this.imagePreview.set('');
    this.resetFormValidation();
    this.displayDialog.set(true);
  }

  openEditDialog(slide: HeroSlide) {
    this.isEditing.set(true);
    this.slideForm.set({
      id: slide.id,
      image_url: slide.image_url,
      title: slide.title,
      description: slide.description,
      order_index: slide.order_index,
      is_active: slide.is_active
    });
    this.selectedFile.set(null);
    this.imagePreview.set(slide.image_url);
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
    }
  }

  async saveSlide() {
    const form = this.slideForm();

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
        imageUrl = await this.slidesService.uploadSlideImage(file, fileName);
      }

      const slideData = {
        image_url: imageUrl,
        title: null,
        description: null,
        order_index: form.order_index!,
        is_active: form.is_active!
      };

      if (this.isEditing()) {
        await this.slidesService.updateSlide(form.id!, slideData);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Slide actualizado correctamente'
        });
      } else {
        await this.slidesService.createSlide(slideData);
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Slide creado correctamente'
        });
      }

      this.displayDialog.set(false);
      await this.loadSlides();

    } catch (error) {
      console.error('Error saving slide:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al guardar el slide'
      });
    } finally {
      this.isUploading.set(false);
    }
  }

  confirmDeleteSlide(slide: HeroSlide) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de eliminar este slide? Esta acción no se puede deshacer.`,
      header: 'Confirmar Eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      accept: () => this.deleteSlide(slide)
    });
  }

  async deleteSlide(slide: HeroSlide) {
    try {
      await this.slidesService.deleteSlide(slide.id);

      // Try to delete image from storage (optional, doesn't fail if error)
      if (slide.image_url) {
        try {
          const fileName = slide.image_url.split('/').pop();
          if (fileName) {
            await this.slidesService.deleteSlideImage(fileName);
          }
        } catch (imageError) {
          console.warn('Could not delete image:', imageError);
        }
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Slide eliminado correctamente'
      });

      await this.loadSlides();
    } catch (error) {
      console.error('Error deleting slide:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al eliminar el slide'
      });
    }
  }

  // Mobile pagination methods
  get paginatedSlides() {
    const start = this.mobileCurrentPage() * this.mobileRowsPerPage();
    const end = start + this.mobileRowsPerPage();
    return this.slides().slice(start, end);
  }

  onMobilePageChange(event: any) {
    this.mobileCurrentPage.set(event.page);
    this.mobileRowsPerPage.set(event.rows);
  }

  getActiveSlidesCount(): number {
    return this.slides().filter(slide => slide.is_active).length;
  }

  getInactiveSlidesCount(): number {
    return this.slides().filter(slide => !slide.is_active).length;
  }

  // Form validation methods
  resetFormValidation() {
    this.formTouched.set({
      image: false
    });
    this.formErrors.set({
      image: ''
    });
  }

  validateForm(): boolean {
    const form = this.slideForm();
    let isValid = true;
    const errors = { image: '' };

    // Mark all fields as touched
    this.formTouched.set({
      image: true
    });

    // Validate image (only for create, not edit)
    if (!this.isEditing() && !form.image_url && !this.selectedFile()) {
      errors.image = 'La imagen es requerida';
      isValid = false;
    }

    this.formErrors.set(errors);
    return isValid;
  }

  onFieldTouch(fieldName: 'image') {
    const touched = this.formTouched();
    this.formTouched.set({
      ...touched,
      [fieldName]: true
    });
    this.validateField(fieldName);
  }

  validateField(fieldName: 'image') {
    const form = this.slideForm();
    const errors = this.formErrors();

    if (fieldName === 'image') {
      if (!this.isEditing() && !form.image_url && !this.selectedFile()) {
        errors.image = 'La imagen es requerida';
      } else {
        errors.image = '';
      }
    }

    this.formErrors.set({ ...errors });
  }

  isFieldInvalid(fieldName: 'image'): boolean {
    const touched = this.formTouched();
    const errors = this.formErrors();
    return touched[fieldName] && !!errors[fieldName];
  }
}
