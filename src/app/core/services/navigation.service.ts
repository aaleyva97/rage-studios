import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private router = inject(Router);

  async navigateToSection(sectionId: string): Promise<void> {
    // Check if we're on the landing page
    const currentUrl = this.router.url;
    const isOnLanding = currentUrl === '/' || currentUrl === '/landing' || currentUrl.includes('#');
    
    if (isOnLanding) {
      // If we're on the landing page, scroll to the section
      this.scrollToSection(sectionId);
    } else {
      // If we're on a different page, navigate to landing first, then scroll
      await this.router.navigate(['/']);
      // Wait for navigation to complete, then scroll
      setTimeout(() => {
        this.scrollToSection(sectionId);
      }, 100);
    }
  }

  private scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 100; // Account for fixed header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }
}