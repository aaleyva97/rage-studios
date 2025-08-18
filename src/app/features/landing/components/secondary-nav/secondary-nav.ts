import { Component, signal } from '@angular/core';
import { RouterModule } from '@angular/router';

interface NavigationItem {
  label: string;
  routerLink: string;
}

@Component({
  selector: 'app-secondary-nav',
  imports: [RouterModule],
  templateUrl: './secondary-nav.html',
  styleUrl: './secondary-nav.scss'
})
export class SecondaryNav {
  navigationItems = signal<NavigationItem[]>([
    { label: 'RESERVAR CLASE', routerLink: '/reservar' },
    { label: 'OUR COACHES', routerLink: '/coaches' },
    { label: 'TRAINING PLAN', routerLink: '/training-plan' },
    { label: 'CONTÁCTANOS', routerLink: '/contact' },
    { label: 'ABOUT US', routerLink: '/about' }
  ]);
}
