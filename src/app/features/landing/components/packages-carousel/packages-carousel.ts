import { Component, OnInit, inject, signal } from '@angular/core';
import { CarouselModule } from 'primeng/carousel';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { PackagesService, Package } from '../../services/packages.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { AuthUiService } from '../../../../core/services/auth-ui.service';
import { BlacklistService } from '../../../../core/services/blacklist.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-packages-carousel',
  imports: [CarouselModule, ButtonModule, DialogModule, SkeletonModule, ToastModule],
  providers: [MessageService],
  templateUrl: './packages-carousel.html',
  styleUrl: './packages-carousel.scss'
})
export class PackagesCarousel implements OnInit {
  private packagesService = inject(PackagesService);
  private supabaseService = inject(SupabaseService);
  private authUiService = inject(AuthUiService);
  private blacklistService = inject(BlacklistService);
  private messageService = inject(MessageService);
  private router = inject(Router);

  packages = signal<Package[]>([]);
  isLoading = signal(true);
  isLoggedIn = signal(false);
  isBlacklisted = signal(false);
  selectedPackage = signal<Package | null>(null);
  showPoliciesDialog = signal(false);
  
  responsiveOptions = [
    {
      breakpoint: '1400px',
      numVisible: 3,
      numScroll: 1
    },
    {
      breakpoint: '1024px',
      numVisible: 2,
      numScroll: 1
    },
    {
      breakpoint: '768px',
      numVisible: 1,
      numScroll: 1
    }
  ];
  
  ngOnInit() {
    this.loadPackages();
    this.checkAuthStatus();
  }
  
  private checkAuthStatus() {
    this.supabaseService.currentUser$.subscribe(async user => {
      this.isLoggedIn.set(!!user);
      if (user) {
        const blacklisted = await this.blacklistService.checkBlacklistStatus(user.id);
        this.isBlacklisted.set(blacklisted);
      } else {
        this.isBlacklisted.set(false);
      }
    });
  }
  
  async loadPackages() {
    try {
      this.isLoading.set(true);
      const data = await this.packagesService.getActivePackages();
      this.packages.set(data);
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  showPolicies(packageItem: Package) {
    this.selectedPackage.set(packageItem);
    this.showPoliciesDialog.set(true);
  }
  
  closePoliciesDialog() {
    this.showPoliciesDialog.set(false);
    setTimeout(() => {
      this.selectedPackage.set(null);
    }, 300);
  }
  
  onPurchaseClick(packageItem: Package) {
    if (!this.isLoggedIn()) {
      this.openLoginDialog();
      return;
    }
    if (this.isBlacklisted()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Acceso restringido',
        detail: 'Para más información sobre el estado de tu cuenta, comunícate con el personal de Rage Studios.',
        life: 6000
      });
      return;
    }
    this.router.navigate(['/checkout', packageItem.id]);
  }
  
  openLoginDialog() {
    this.authUiService.openLoginDialog();
  }
  
  getClassesText(packageItem: Package): string {
    if (packageItem.is_unlimited) {
      return 'CLASES ILIMITADAS';
    }
    return `${packageItem.classes_count} ${packageItem.classes_count === 1 ? 'CLASE' : 'CLASES'}`;
  }
  
  getValidityText(days: number): string {
    return `VIGENCIA: ${days} DÍAS`;
  }
}
