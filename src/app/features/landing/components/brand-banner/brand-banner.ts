import { Component, signal, inject, OnInit } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { FooterService, FooterImage } from '../../services/footer.service';

@Component({
  selector: 'app-brand-banner',
  imports: [SkeletonModule],
  templateUrl: './brand-banner.html',
  styleUrl: './brand-banner.scss'
})
export class BrandBanner implements OnInit {
  private footerService = inject(FooterService);

  isLoading = signal(true);
  brandImages = signal<FooterImage[]>([]);

  async ngOnInit() {
    try {
      const images = await this.footerService.getFooterImages();
      this.brandImages.set(images);
    } catch {
      // fallback silencioso — las imágenes quedan vacías pero no rompe la página
    } finally {
      this.isLoading.set(false);
    }
  }
}
