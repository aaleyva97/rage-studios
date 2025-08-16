import { Component, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { LoginDialog } from '../login-dialog/login-dialog';
import { RegisterDialog } from '../register-dialog/register-dialog';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase-service';

interface NavItem {
  label: string;
  routerLink: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterModule, Button, Drawer, LoginDialog, RegisterDialog, ToastModule],
  providers: [MessageService],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss'
})
export class Topbar implements OnInit, OnDestroy {
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  
  isLoggedIn = signal(false);
  menuItems = signal<NavItem[]>([]);
  showLoginDialog = signal(false);
  showRegisterDialog = signal(false);
  mobileMenuVisible = signal(false);
  
  private authSubscription?: Subscription;
  
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
    this.authSubscription = this.supabaseService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
      this.updateMenuItems();
    });
  }
  
  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }
  
  private updateMenuItems() {
    this.menuItems.set(this.isLoggedIn() ? this.loggedInItems : this.navigationItems);
  }
  
  async logout() {
    try {
      await this.supabaseService.signOut();
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Sesión cerrada correctamente'
      });
    } catch (error) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Error al cerrar sesión'
      });
    }
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
  
  toggleMobileMenu() {
    this.mobileMenuVisible.set(!this.mobileMenuVisible());
  }
  
  closeMobileMenu() {
    this.mobileMenuVisible.set(false);
  }
  
  onMenuItemClick() {
    this.closeMobileMenu();
  }
  
  onLoginFromMobile() {
    this.closeMobileMenu();
    this.openLoginDialog();
  }
  
  onLogoutFromMobile() {
    this.closeMobileMenu();
    this.logout();
  }
}