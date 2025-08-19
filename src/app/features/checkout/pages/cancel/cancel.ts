import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-cancel',
  imports: [ButtonModule, CardModule],
  templateUrl: './cancel.html',
  styleUrl: './cancel.scss'
})
export class Cancel {
  constructor(private router: Router) {}
  
  goToPackages() {
    this.router.navigate(['/'], { fragment: 'packages' });
  }
  
  goToHome() {
    this.router.navigate(['/']);
  }
}
