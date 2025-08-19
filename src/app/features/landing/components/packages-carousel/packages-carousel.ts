import { Component, OnInit, inject, signal } from '@angular/core';
import { CarouselModule } from 'primeng/carousel';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { PackagesService, Package } from '../../services/packages.service';
import { SupabaseService } from '../../../../core/services/supabase-service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-packages-carousel',
  imports: [CarouselModule, ButtonModule, DialogModule, SkeletonModule],
  templateUrl: './packages-carousel.html',
  styleUrl: './packages-carousel.scss'
})
export class PackagesCarousel implements OnInit {
  private packagesService = inject(PackagesService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  
  packages = signal<Package[]>([]);
  isLoading = signal(true);
  isLoggedIn = signal(false);
  selectedPackage = signal<Package | null>(null);
  showPoliciesDialog = signal(false);
  showLoginDialog = signal(false);
  
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
    this.supabaseService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
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
  if (this.isLoggedIn()) {
    // Navegar a la página de checkout
    this.router.navigate(['/checkout', packageItem.id]);
  } else {
    this.openLoginDialog();
  }
}
  
  openLoginDialog() {
    // Aquí deberías emitir un evento o usar un servicio compartido
    // para abrir el dialog de login del topbar
    const event = new CustomEvent('openLoginDialog');
    window.dispatchEvent(event);
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
