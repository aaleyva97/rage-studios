import { Component, signal, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Button } from 'primeng/button';
import { LoginDialog } from '../login-dialog/login-dialog';
import { RegisterDialog } from '../register-dialog/register-dialog';

interface NavItem {
  label: string;
  routerLink: string;
}

@Component({
  selector: 'app-topbar',
  imports: [RouterModule, Button, LoginDialog, RegisterDialog],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss'
})
export class Topbar implements OnInit {
  isLoggedIn = signal(false);
  menuItems = signal<NavItem[]>([]);
  showLoginDialog = signal(false);
  showRegisterDialog = signal(false);

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

  openLoginDialog() {
    this.showLoginDialog.set(true);
  }

  openRegisterDialog() {
    this.showRegisterDialog.set(true);
  }

  onLoginDialogClose() {
    this.showLoginDialog.set(false);
  }

  onRegisterDialogClose() {
    this.showRegisterDialog.set(false);
  }

  onOpenRegisterFromLogin() {
    this.showLoginDialog.set(false);
    this.showRegisterDialog.set(true);
  }

  onOpenLoginFromRegister() {
    this.showRegisterDialog.set(false);
    this.showLoginDialog.set(true);
  }
}
