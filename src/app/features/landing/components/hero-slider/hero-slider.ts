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
    console.log('ngOnInit called');
    // TEMPORARY: Set fallback slides directly for testing
    this.slides.set(this.fallbackSlides);
    this.isLoading.set(false);
    console.log('Direct fallback set - slides:', this.slides().length);
    
    // Force change detection to ensure template updates
    this.cdr.detectChanges();
    
    // Also load from service (but don't depend on it)
    this.loadSlides();
  }
  
  ngAfterViewInit() {
    console.log('ngAfterViewInit called');
    console.log('Platform check:', isPlatformBrowser(this.platformId));
    console.log('Container immediately after view init:', this.swiperContainer?.nativeElement);
    
    // Only initialize Swiper in the browser, not during SSR
    if (isPlatformBrowser(this.platformId)) {
      // Wait for DOM to be fully ready and slides to render
      setTimeout(() => {
        console.log('AfterViewInit timeout - Attempting to initialize Swiper');
        console.log('Slides count:', this.slides().length);
        console.log('Container element:', this.swiperContainer?.nativeElement);
        
        // Try to find the element manually if ViewChild fails
        const manualContainer = document.querySelector('.hero-swiper');
        console.log('Manual container search:', manualContainer);
        
        this.initializeSwiper();
      }, 1000); // Further increased timeout
    }
  }
  
  async loadSlides() {
    console.log('loadSlides called');
    try {
      this.isLoading.set(true);
      console.log('Loading slides from service...');
      
      const data = await this.slidesService.getActiveSlides();
      console.log('Service returned data:', data);
      
      if (data && data.length > 0) {
        console.log('Using service data:', data.length, 'slides');
        this.slides.set(data);
      } else {
        console.log('No service data, using fallback slides');
        this.slides.set(this.fallbackSlides);
      }
    } catch (error) {
      console.error('Error loading slides:', error);
      console.log('Error occurred, using fallback slides');
      this.slides.set(this.fallbackSlides);
    } finally {
      this.isLoading.set(false);
      console.log('loadSlides finally - isLoading:', this.isLoading(), 'slides count:', this.slides().length);
      
      // CRITICAL: Force change detection after updating signals
      this.cdr.detectChanges();
      
      // Re-initialize Swiper if already in browser and container exists
      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => {
          console.log('loadSlides complete - Re-initializing Swiper');
          console.log('Final slides count:', this.slides().length);
          // Force another change detection cycle before Swiper init
          this.cdr.detectChanges();
          this.initializeSwiper();
        }, 500);
      }
    }
  }
  
  private initializeSwiper() {
    console.log('initializeSwiper called');
    console.log('Container exists:', !!this.swiperContainer?.nativeElement);
    console.log('Swiper already exists:', !!this.swiper);
    console.log('Slides loaded:', this.slides().length);
    
    // Try ViewChild first, then manual selector
    let containerElement = this.swiperContainer?.nativeElement;
    if (!containerElement) {
      console.log('ViewChild failed, trying manual selector...');
      containerElement = document.querySelector('.hero-swiper') as HTMLElement;
      console.log('Manual selector result:', containerElement);
    }
    
    if (!containerElement) {
      console.error('Swiper container not found by ViewChild OR manual selector!');
      // Let's check if the template is rendering at all
      const heroContainer = document.querySelector('.hero-slider-container');
      console.log('Hero container exists:', !!heroContainer);
      const swiperWrapper = document.querySelector('.swiper-wrapper');
      console.log('Swiper wrapper exists:', !!swiperWrapper);
      return;
    }
    
    if (this.swiper) {
      console.log('Destroying existing Swiper instance');
      this.swiper.destroy(true, true);
    }
    
    if (this.slides().length === 0) {
      console.warn('No slides available, skipping Swiper initialization');
      return;
    }
    
    try {
      console.log('Creating new Swiper instance with container:', containerElement);
      this.swiper = new Swiper(containerElement, {
        modules: [Pagination, Autoplay, EffectFade],
        slidesPerView: 1,
        spaceBetween: 0,
        loop: this.slides().length > 1, // Only loop if more than 1 slide
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
            console.log('Slide changed to:', swiper.realIndex);
            this.currentIndex.set(swiper.realIndex);
          },
          init: (swiper) => {
            console.log('Swiper initialized successfully!');
            console.log('Total slides:', swiper.slides.length);
          }
        },
      });
      
      console.log('Swiper created successfully with', this.slides().length, 'slides');
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