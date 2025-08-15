import { Component, signal, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Button } from 'primeng/button';

interface NavItem {
  label: string;
  routerLink: string;
}

@Component({
  selector: 'app-topbar',
  imports: [RouterModule, Button],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss'
})
export class Topbar implements OnInit {
  isLoggedIn = signal(false);
  menuItems = signal<NavItem[]>([]);

  private navigationItems: NavItem[] = [
    { label: 'Paquetes', routerLink: '/paquetes' },
    { label: 'Coaches', routerLink: '/coaches' },
    { label: 'Training', routerLink: '/training' }
  ];

  private loggedInItems: NavItem[] = [
    { label: 'Paquetes', routerLink: '/paquetes' },
    { label: 'Coaches', routerLink: '/coaches' },
    { label: 'Training', routerLink: '/training' },
    { label: 'Mi Cuenta', routerLink: '/mi-cuenta' }
  ];

  ngOnInit() {
    this.updateMenuItems();
  }


  private updateMenuItems() {
    this.menuItems.set(this.isLoggedIn() ? this.loggedInItems : this.navigationItems);
  }

  toggleLogin() {
    this.isLoggedIn.set(!this.isLoggedIn());
    this.updateMenuItems();
  }
}
