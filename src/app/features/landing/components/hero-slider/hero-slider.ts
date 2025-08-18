import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy, inject, ViewChild, ElementRef, AfterViewInit, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SkeletonModule } from 'primeng/skeleton';
import { SlidesService, HeroSlide } from '../../services/slides.service';

// Import Swiper core and required modules
import { Swiper } from 'swiper';
import { Pagination, Autoplay, EffectFade } from 'swiper/modules';

@Component({
  selector: 'app-hero-slider',
  standalone: true,
  imports: [SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-slider.html',
  styleUrl: './hero-slider.scss'
})
export class HeroSlider implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('swiperContainer', { static: false }) swiperContainer!: ElementRef;
  
  private slidesService = inject(SlidesService);
  platformId = inject(PLATFORM_ID); // Made public for template access
  private cdr = inject(ChangeDetectorRef);
  private swiper?: Swiper;
  
  // Make isPlatformBrowser accessible in template
  isPlatformBrowser = isPlatformBrowser;
  
  currentIndex = signal(0);
  slides = signal<HeroSlide[]>([]);
  isLoading = signal(true);
  
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
    // Set fallback slides directly for testing
    this.slides.set(this.fallbackSlides);
    this.isLoading.set(false);
    
    // Force change detection to ensure template updates
    this.cdr.detectChanges();
    
    // Also load from service (but don't depend on it)
    this.loadSlides();
  }
  
  ngAfterViewInit() {
    // Only initialize Swiper in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      // Wait for DOM to be fully ready and slides to render
      setTimeout(() => {
        // Only try to initialize if container exists to prevent error
        if (this.swiperContainer?.nativeElement || document.querySelector('.hero-swiper')) {
          this.initializeSwiper();
        }
      }, 1000);
    }
  }
  
  async loadSlides() {
    try {
      this.isLoading.set(true);
      
      const data = await this.slidesService.getActiveSlides();
      
      if (data && data.length > 0) {
        this.slides.set(data);
      } else {
        this.slides.set(this.fallbackSlides);
      }
    } catch (error) {
      console.error('Error loading slides:', error);
      this.slides.set(this.fallbackSlides);
    } finally {
      this.isLoading.set(false);
      
      // CRITICAL: Force change detection after updating signals
      this.cdr.detectChanges();
      
      // Re-initialize Swiper if already in browser and container exists
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => {
          // Force another change detection cycle before Swiper init
          this.cdr.detectChanges();
          this.initializeSwiper();
        }, 500);
      }
    }
  }
  
  private initializeSwiper() {
    // Try ViewChild first, then manual selector
    let containerElement = this.swiperContainer?.nativeElement;
    if (!containerElement) {
      containerElement = document.querySelector('.hero-swiper') as HTMLElement;
    }
    
    // Silently exit if container not found (prevents console error)
    if (!containerElement) {
      return;
    }
    
    if (this.swiper) {
      this.swiper.destroy(true, true);
    }
    
    if (this.slides().length === 0) {
      return;
    }
    
    try {
      this.swiper = new Swiper(containerElement, {
        modules: [Pagination, Autoplay, EffectFade],
        slidesPerView: 1,
        spaceBetween: 0,
        loop: this.slides().length > 1,
        effect: 'fade',
        fadeEffect: {
          crossFade: true,
        },
        autoplay: this.slides().length > 1 ? {
          delay: 5000,
          disableOnInteraction: false,
          pauseOnMouseEnter: false,
        } : false,
        pagination: {
          el: '.swiper-pagination',
          clickable: true,
        },
        speed: 600,
        // CRITICAL: Allow vertical scroll on mobile
        touchStartPreventDefault: false,
        allowTouchMove: true,
        on: {
          slideChange: (swiper) => {
            this.currentIndex.set(swiper.realIndex);
          }
        },
      });
    } catch (error) {
      console.error('Error initializing Swiper:', error);
    }
  }
  
  ngOnDestroy() {
    if (this.swiper) {
      this.swiper.destroy(true, true);
      this.swiper = undefined;
    }
  }
}