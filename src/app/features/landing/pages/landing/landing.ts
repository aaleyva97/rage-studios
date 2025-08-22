import { Component, inject, OnInit } from '@angular/core';
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
export class Landing {
  private bookingUiService = inject(BookingUiService);
  
  showBookingDialog = this.bookingUiService.showBookingDialog;
}
