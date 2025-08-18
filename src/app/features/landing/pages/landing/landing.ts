import { Component, inject, OnInit } from '@angular/core';
import { HeroSlider } from '../../components/hero-slider/hero-slider';
import { SessionsGrid } from '../../components/sessions-grid/sessions-grid';
import { PackagesCarousel } from '../../components/packages-carousel/packages-carousel';
import { CoachesGrid } from '../../components/coaches-grid/coaches-grid';
import { BrandBanner } from '../../components/brand-banner/brand-banner';
import { SecondaryNav } from '../../components/secondary-nav/secondary-nav';
import { Footer } from '../../../../shared/components/footer/footer';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    HeroSlider,
    SessionsGrid,
    PackagesCarousel,
    CoachesGrid,
    BrandBanner,
    SecondaryNav,
    Footer,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing implements OnInit {
  private title = inject(Title);
  private meta = inject(Meta);

  ngOnInit(): void {
    this.title.setTitle('Rage Studios');

    this.meta.updateTag({
      name: 'description',
      content: 'Página oficial de Rage Studios',
    });
    this.meta.updateTag({ name: 'og:title', content: 'Rage Studios' });
    this.meta.updateTag({
      name: 'og:description',
      content: 'Página oficial de Rage Studios',
    });
    this.meta.updateTag({
      name: 'og:image',
      content:
        'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Header%20Slides/slide1.png',
    });
  }
}
