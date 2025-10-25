import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-admin-credits-navigation',
  imports: [CardModule],
  templateUrl: './admin-credits-navigation.html',
  styleUrl: './admin-credits-navigation.scss'
})
export class AdminCreditsNavigation {
  private router = inject(Router);

  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}
