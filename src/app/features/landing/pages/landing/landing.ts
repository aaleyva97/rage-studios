import { Component } from '@angular/core';
import { HeroSlider } from '../../components/hero-slider/hero-slider';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [HeroSlider],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class Landing {
}