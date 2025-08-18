import { Component, signal, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavigationService } from '../../../../core/services/navigation.service';

interface NavigationItem {
  label: string;
  routerLink?: string;
  sectionId?: string;
  action?: 'route' | 'scroll';
}

@Component({
  selector: 'app-secondary-nav',
  imports: [RouterModule],
  templateUrl: './secondary-nav.html',
  styleUrl: './secondary-nav.scss'
})
export class SecondaryNav {
  private navigationService = inject(NavigationService);
  
  navigationItems = signal<NavigationItem[]>([
    { label: 'RESERVAR CLASE', routerLink: '/reservar', action: 'route' },
    { label: 'PAQUETES', sectionId: 'packages', action: 'scroll' },
    { label: 'OUR COACHES', sectionId: 'coaches', action: 'scroll' },
    { label: 'TRAINING PLAN', sectionId: 'sessions', action: 'scroll' },
    { label: 'CONTÁCTANOS', routerLink: '/contact', action: 'route' }
  ]);
  
  onNavItemClick(item: NavigationItem, event?: Event) {
    if (event) {
      event.preventDefault();
    }
    
    if (item.action === 'scroll' && item.sectionId) {
      this.navigationService.navigateToSection(item.sectionId);
    }
  }
}
