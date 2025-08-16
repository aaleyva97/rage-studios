import { Component } from '@angular/core';
import { HeroSlider } from '../../components/hero-slider/hero-slider';
import { SessionsGrid } from '../../components/sessions-grid/sessions-grid';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [HeroSlider, SessionsGrid],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class Landing {
}