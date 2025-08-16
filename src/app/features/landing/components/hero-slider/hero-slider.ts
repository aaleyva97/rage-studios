import { Component, ChangeDetectionStrategy, ViewChild, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CarouselModule, Carousel } from 'primeng/carousel';

@Component({
  selector: 'app-hero-slider',
  standalone: true,
  imports: [CarouselModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-slider.html',
  styleUrl: './hero-slider.scss'
})
export class HeroSlider implements AfterViewInit, OnDestroy {
  @ViewChild('carousel') carousel!: Carousel;
  
  currentIndex = signal(0);
  private autoplayTimer: any;
  private readonly autoplayInterval = 5000;
  
  slides = [
    {
      title: 'Welcome to RageStudios',
      description: 'Experience the power of modern web development with cutting-edge technology and innovative solutions.',
      image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'
    },
    {
      title: 'Innovative Design Solutions',
      description: 'Transform your ideas into stunning digital experiences with our comprehensive design and development services.',
      image: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'
    },
    {
      title: 'Technology at Your Service',
      description: 'Leverage the latest technologies and frameworks to build scalable, efficient, and modern applications.',
      image: 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'
    },
    {
      title: 'Build the Future',
      description: 'Join us in creating tomorrow\'s digital landscape with innovative solutions and exceptional user experiences.',
      image: 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'
    }
  ];
  
  ngAfterViewInit() {
    // Listen to page changes to update our signal
    if (this.carousel) {
      this.carousel.onPage.subscribe((event: any) => {
        this.currentIndex.set(event.page);
      });
      
      // Start custom autoplay since PrimeNG's autoplay might stop on manual navigation
      this.startAutoplay();
    }
  }
  
  private startAutoplay() {
    this.clearAutoplay();
    this.autoplayTimer = setInterval(() => {
      if (this.carousel) {
        const nextIndex = (this.currentIndex() + 1) % this.slides.length;
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