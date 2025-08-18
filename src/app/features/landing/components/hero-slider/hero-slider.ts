import { Component, ChangeDetectionStrategy, ViewChild, signal, AfterViewInit, OnDestroy, OnInit, inject } from '@angular/core';
import { CarouselModule, Carousel } from 'primeng/carousel';
import { SkeletonModule } from 'primeng/skeleton';
import { SlidesService, HeroSlide } from '../../services/slides.service';

@Component({
  selector: 'app-hero-slider',
  standalone: true,
  imports: [CarouselModule, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-slider.html',
  styleUrl: './hero-slider.scss'
})
export class HeroSlider implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('carousel') carousel!: Carousel;
  
  private slidesService = inject(SlidesService);
  
  currentIndex = signal(0);
  slides = signal<HeroSlide[]>([]);
  isLoading = signal(true);
  
  private autoplayTimer: any;
  private readonly autoplayInterval = 5000;
  
  // Slides de respaldo por si falla la carga
  private fallbackSlides: HeroSlide[] = [
    {
      id: '1',
      image_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: null,
      description: null,
      order_index: 1,
      is_active: true,
      created_at: '',
      updated_at: ''
    }
  ];
  
  ngOnInit() {
    this.loadSlides();
  }
  
  async loadSlides() {
    try {
      this.isLoading.set(true);
      const data = await this.slidesService.getActiveSlides();
      
      if (data && data.length > 0) {
        this.slides.set(data);
      } else {
        // Si no hay slides, usar los de respaldo
        this.slides.set(this.fallbackSlides);
      }
    } catch (error) {
      console.error('Error loading slides:', error);
      // En caso de error, usar slides de respaldo
      this.slides.set(this.fallbackSlides);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  ngAfterViewInit() {
    // Esperar un poco para que los slides se carguen
    setTimeout(() => {
      if (this.carousel && this.slides().length > 0) {
        this.carousel.onPage.subscribe((event: any) => {
          this.currentIndex.set(event.page);
        });
        
        this.startAutoplay();
      }
    }, 500);
  }
  
  private startAutoplay() {
    this.clearAutoplay();
    this.autoplayTimer = setInterval(() => {
      if (this.carousel && this.slides().length > 1) {
        const nextIndex = (this.currentIndex() + 1) % this.slides().length;
        this.carousel.page = nextIndex;
        this.currentIndex.set(nextIndex);
      }
    }, this.autoplayInterval);
  }
  
  private clearAutoplay() {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
  
  goToSlide(index: number) {
    if (this.carousel && index !== this.currentIndex()) {
      this.carousel.page = index;
      this.currentIndex.set(index);
      
      // Restart autoplay after manual navigation
      this.startAutoplay();
    }
  }
  
  ngOnDestroy() {
    this.clearAutoplay();
  }
}