import { Component, signal, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Button } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { Menu } from 'primeng/menu';
import { ToastModule } from 'primeng/toast';
import { MessageService, MenuItem } from 'primeng/api';
import { LoginDialog } from '../login-dialog/login-dialog';
import { RegisterDialog } from '../register-dialog/register-dialog';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase-service';
import { NavigationService } from '../../../core/services/navigation.service';
import { OverlayBadge } from 'primeng/overlaybadge';
import { Tooltip } from 'primeng/tooltip'
import { CreditsService } from '../../../core/services/credits.service';
import { BookingDialog } from '../../../features/booking/components/booking-dialog/booking-dialog';

interface NavItem {
  label: string;
  routerLink?: string;
  sectionId?: string;
  action?: 'route' | 'scroll';
}

interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: string;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
   imports: [
    RouterModule, 
    Button, 
    Drawer, 
    Menu, 
    LoginDialog, 
    RegisterDialog, 
    ToastModule,
    OverlayBadge,
    Tooltip,
    BookingDialog
  ],
  providers: [MessageService],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss'
})
export class Topbar implements OnInit, OnDestroy {
  @ViewChild('userMenu') userMenu!: Menu;
  
  private supabaseService = inject(SupabaseService);
  private messageService = inject(MessageService);
  private navigationService = inject(NavigationService);
  protected creditsService = inject(CreditsService);
  
  isLoggedIn = signal(false);
  currentUser = signal<any>(null);
  userProfile = signal<Profile | null>(null);
  profileLoading = signal(false);
  profileLoadAttempted = signal(false);
  leftMenuItems = signal<NavItem[]>([]);
  rightMenuItems = signal<NavItem[]>([]);
  showLoginDialog = signal(false);
  showRegisterDialog = signal(false);
  mobileMenuVisible = signal(false);
  userMenuVisible = signal(false);
  userMenuItems = signal<MenuItem[]>([]);
  showBookingDialog = signal(false);
  
  private authSubscription?: Subscription;
  
  // Left side menu items
  private leftNavItems: NavItem[] = [
    { label: 'Paquetes', sectionId: 'packages', action: 'scroll' },
    { label: 'Training', sectionId: 'sessions', action: 'scroll' }
  ];
  
  private leftNavItemsLoggedIn: NavItem[] = [
    { label: 'Reservar', action: 'scroll' },
    { label: 'Paquetes', sectionId: 'packages', action: 'scroll' },
    { label: 'Training', sectionId: 'sessions', action: 'scroll' }
  ];
  
  // Right side menu items
  private rightNavItems: NavItem[] = [
    { label: 'Coaches', sectionId: 'coaches', action: 'scroll' }
  ];
  
  private rightNavItemsLoggedIn: NavItem[] = [
    { label: 'Coaches', sectionId: 'coaches', action: 'scroll' },
    { label: 'Mi Cuenta', routerLink: '/mi-cuenta', action: 'route' }
  ];
  
  ngOnInit() {
    this.authSubscription = this.supabaseService.currentUser$.subscribe(async user => {
      this.isLoggedIn.set(!!user);
      this.currentUser.set(user);
      
      if (user && !this.profileLoadAttempted()) {
        this.loadUserProfile(user.id);
      } else if (!user) {
        this.userProfile.set(null);
        this.profileLoadAttempted.set(false);
      }
      
      this.updateMenuItems();
      this.updateUserMenu();
    });
  }
  
  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
  }
  
  private updateMenuItems() {
    this.leftMenuItems.set(this.isLoggedIn() ? this.leftNavItemsLoggedIn : this.leftNavItems);
    this.rightMenuItems.set(this.isLoggedIn() ? this.rightNavItemsLoggedIn : this.rightNavItems);
  }
  
  private updateUserMenu() {
    if (this.isLoggedIn()) {
      this.userMenuItems.set([
        {
          label: 'Cerrar Sesión',
          icon: 'pi pi-sign-out',
          command: () => this.logout()
        }
      ]);
    }
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
  
  toggleUserMenu(event: Event) {
    this.userMenu.toggle(event);
  }
  
  private async loadUserProfile(userId: string) {
    if (this.profileLoading()) return;
    
    this.profileLoading.set(true);
    this.profileLoadAttempted.set(true);
    
    try {
      const profile = await this.supabaseService.getProfile(userId);
      this.userProfile.set(profile);
    } catch (error: any) {
      console.warn('User profile not found, using basic info:', error?.message);
      this.userProfile.set(null);
    } finally {
      this.profileLoading.set(false);
    }
  }
  
  getUserDisplayName(): string {
    const profile = this.userProfile();
    if (profile?.full_name) {
      return profile.full_name;
    }
    const user = this.currentUser();
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return user?.email?.split('@')[0] || 'Usuario';
  }
  
  closeMobileMenu() {
    this.mobileMenuVisible.set(false);
  }
  
  onMenuItemClick() {
    this.closeMobileMenu();
  }
  
  onNavItemClick(item: NavItem, event?: Event) {
  if (event) {
    event.preventDefault();
  }
  
  // Caso especial para "Reservar"
  if (item.label === 'Reservar' && this.isLoggedIn()) {
    this.openBookingDialog();
    this.closeMobileMenu();
    return;
  }
  
  if (item.action === 'scroll' && item.sectionId) {
    this.navigationService.navigateToSection(item.sectionId);
  }
  
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

  getCreditsTooltip(): string {
    if (this.creditsService.isUnlimited()) {
      return 'Créditos ilimitados';
    }
    return `${this.creditsService.totalCredits()} créditos disponibles`;
  }

  openBookingDialog() {
  this.showBookingDialog.set(true);
}
}