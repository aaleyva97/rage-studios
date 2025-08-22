import { Component, inject, OnInit } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { HeroSlider } from '../../components/hero-slider/hero-slider';
import { SessionsGrid } from '../../components/sessions-grid/sessions-grid';
import { PackagesCarousel } from '../../components/packages-carousel/packages-carousel';
import { CoachesGrid } from '../../components/coaches-grid/coaches-grid';
import { BrandBanner } from '../../components/brand-banner/brand-banner';
import { SecondaryNav } from '../../components/secondary-nav/secondary-nav';
import { Footer } from '../../../../shared/components/footer/footer';
import { BookingDialog } from '../../../booking/components/booking-dialog/booking-dialog';
import { BookingUiService } from '../../../../core/services/booking-ui.service';

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
    BookingDialog,
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing implements OnInit {
  private bookingUiService = inject(BookingUiService);
  private title = inject(Title);
  private meta = inject(Meta);
  
  showBookingDialog = this.bookingUiService.showBookingDialog;

  ngOnInit(): void {
    this.setupSeoAndOpenGraph();
  }

  private setupSeoAndOpenGraph(): void {
    const pageTitle = 'Rage Studios';
    const pageDescription = 'Reserva tus clases de pilates con coaches profesionales certificados. Entrena en un ambiente exclusivo con los mejores instructores.';
    const ogImage = 'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Header%20Slides/slide1.png';
    const siteUrl = 'https://ragestudios.com';

    this.title.setTitle(pageTitle);

    this.meta.updateTag({ name: 'description', content: pageDescription });
    this.meta.updateTag({ name: 'keywords', content: 'pilates, fitness, clases, reservas, coaches, entrenamiento, estudio, wellness' });
    this.meta.updateTag({ name: 'author', content: 'Rage Studios' });
    
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: pageDescription });
    this.meta.updateTag({ property: 'og:image', content: ogImage });
    this.meta.updateTag({ property: 'og:url', content: siteUrl });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'Rage Studios' });
    
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: pageDescription });
    this.meta.updateTag({ name: 'twitter:image', content: ogImage });
  }
}
