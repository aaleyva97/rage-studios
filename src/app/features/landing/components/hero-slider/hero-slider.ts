import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CarouselModule } from 'primeng/carousel';

@Component({
  selector: 'app-hero-slider',
  standalone: true,
  imports: [CarouselModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-slider.html',
  styleUrl: './hero-slider.scss'
})
export class HeroSlider {
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
}