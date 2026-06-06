import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { FileUploadModule } from 'primeng/fileupload';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageService } from 'primeng/api';
import { FooterService, FooterImage } from '../../../landing/services/footer.service';

@Component({
  selector: 'app-admin-footer',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    FileUploadModule,
    InputTextModule,
    SkeletonModule
  ],
  providers: [MessageService],
  templateUrl: './admin-footer.html',
  styleUrl: './admin-footer.scss'
})
export class AdminFooter implements OnInit {
  private footerService = inject(FooterService);
  private messageService = inject(MessageService);

  images = signal<FooterImage[]>([]);
  footerTitle = signal('');
  isLoadingImages = signal(true);
  isLoadingTitle = signal(true);
  isSavingTitle = signal(false);
  uploadingIndex = signal<number | null>(null);

  async ngOnInit() {
    await Promise.all([this.loadImages(), this.loadTitle()]);
  }

  async loadImages() {
    this.isLoadingImages.set(true);
    try {
      const imgs = await this.footerService.getFooterImages();
      this.images.set(imgs);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Error al cargar las imágenes' });
    } finally {
      this.isLoadingImages.set(false);
    }
  }

  async loadTitle() {
    this.isLoadingTitle.set(true);
    try {
      const title = await this.footerService.getFooterTitle();
      this.footerTitle.set(title);
    } catch {
      this.footerTitle.set("I'M THE FINAL BOSS");
    } finally {
      this.isLoadingTitle.set(false);
    }
  }

  async saveTitle() {
    const title = this.footerTitle().trim();
    if (!title) return;
    this.isSavingTitle.set(true);
    try {
      await this.footerService.updateFooterTitle(title);
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Título actualizado correctamente' });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar el título' });
    } finally {
      this.isSavingTitle.set(false);
    }
  }

  async onImageSelect(event: any, image: FooterImage, index: number) {
    const file: File = event.files[0];
    if (!file) return;

    this.uploadingIndex.set(index);
    try {
      const newUrl = await this.footerService.uploadFooterImage(file, image.order_index);
      await this.footerService.updateFooterImage(image.id, newUrl);
      await this.loadImages();
      this.messageService.add({ severity: 'success', summary: 'Éxito', detail: `Imagen ${image.order_index} actualizada` });
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Error al subir la imagen' });
    } finally {
      this.uploadingIndex.set(null);
    }
  }

  getSlotLabel(index: number): string {
    return ['R', 'A', 'G', 'E'][index] ?? `${index + 1}`;
  }
}
