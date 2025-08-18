import { Component } from '@angular/core';
import { HeroSlider } from '../../components/hero-slider/hero-slider';
import { SessionsGrid } from '../../components/sessions-grid/sessions-grid';
import { PackagesCarousel } from '../../components/packages-carousel/packages-carousel';
import { CoachesGrid } from '../../components/coaches-grid/coaches-grid';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [HeroSlider, SessionsGrid, PackagesCarousel, CoachesGrid],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class Landing {
}