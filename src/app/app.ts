import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Topbar } from './shared/components/topbar/topbar';
import { Footer } from './shared/components/footer/footer';
import { SocialSpeedDial } from './shared/components/social-speed-dial/social-speed-dial';
import { PwaInstallDialogComponent } from './shared/components/pwa-install-dialog/pwa-install-dialog';
import { PwaInstallService } from './core/services/pwa-install.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ButtonModule, ToastModule, Topbar, SocialSpeedDial, PwaInstallDialogComponent],
  providers: [MessageService],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected title = 'rage-studios';
  
  private readonly pwaInstallService = inject(PwaInstallService);
  
  ngOnInit(): void {
    // PWA Install Service is initialized automatically via constructor
    // Set up automatic install prompt detection for new users
    this.setupAutoInstallPrompt();
  }
  
  private setupAutoInstallPrompt(): void {
    // Show install prompt ONLY for mobile first-time visitors
    // No manual buttons anywhere - only automatic dialog
    setTimeout(() => {
      const state = this.pwaInstallService.installabilityState();
      const isMobile = state.platform === 'android' || state.platform === 'ios';
      
      if (isMobile && this.pwaInstallService.canShowAutomaticPrompt()) {
        this.pwaInstallService.openInstallDialog();
      }
    }, 10000); // 10 seconds after app initialization
  }
}