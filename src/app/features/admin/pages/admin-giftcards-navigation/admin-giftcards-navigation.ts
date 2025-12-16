import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-admin-giftcards-navigation',
  imports: [CardModule],
  templateUrl: './admin-giftcards-navigation.html',
  styleUrl: './admin-giftcards-navigation.scss'
})
export class AdminGiftcardsNavigation {
  private router = inject(Router);

  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}
