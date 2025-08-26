import { Component, signal, inject, computed, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { RouterModule } from '@angular/router';
import { NavigationService } from '../../../../core/services/navigation.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { BookingUiService } from '../../../../core/services/booking-ui.service';

interface NavigationItem {
  label: string;
  routerLink?: string;
  sectionId?: string;
  action?: 'route' | 'scroll' | 'booking' | 'whatsapp';
}

@Component({
  selector: 'app-secondary-nav',
  imports: [RouterModule],
  templateUrl: './secondary-nav.html',
  styleUrl: './secondary-nav.scss'
})
export class SecondaryNav implements OnInit, OnDestroy {
  private navigationService = inject(NavigationService);
  private supabaseService = inject(SupabaseService);
  private bookingUiService = inject(BookingUiService);
  
  private isLoggedIn = signal(false);
  private authSubscription?: Subscription;
  
  navigationItems = computed<NavigationItem[]>(() => {
    const baseItems: NavigationItem[] = [
      { label: 'PAQUETES', sectionId: 'packages', action: 'scroll' },
      { label: 'OUR COACHES', sectionId: 'coaches', action: 'scroll' },
      { label: 'TRAINING PLAN', sectionId: 'sessions', action: 'scroll' },
      { label: 'CONTÁCTANOS', action: 'whatsapp' }
    ];
    
    if (this.isLoggedIn()) {
      return [{ label: 'RESERVAR CLASE', action: 'booking' }, ...baseItems];
    }
    
    return baseItems;
  });
  
  ngOnInit() {
    this.authSubscription = this.supabaseService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
    });
  }
  
  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }
  
  onNavItemClick(item: NavigationItem, event?: Event) {
    if (event) {
      event.preventDefault();
    }
    
    switch (item.action) {
      case 'scroll':
        if (item.sectionId) {
          this.navigationService.navigateToSection(item.sectionId);
        }
        break;
        
      case 'booking':
        this.bookingUiService.openBookingDialog();
        break;
        
      case 'whatsapp':
        window.open('https://wa.me/528715817065', '_blank');
        break;
    }
  }
}
