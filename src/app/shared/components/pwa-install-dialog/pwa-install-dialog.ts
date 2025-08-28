import { Component, inject, OnInit, OnDestroy, effect, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ButtonModule } from 'primeng/button';
import { MessageService, ConfirmationService } from 'primeng/api';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

@Component({
  selector: 'app-pwa-install-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ConfirmDialogModule,
    ButtonModule
  ],
  providers: [ConfirmationService],
  template: `
    <p-confirmDialog 
      key="pwa-install" 
      [style]="dialogStyle"
      [baseZIndex]="10000"
      [closable]="false"
      styleClass="pwa-install-dialog">
    </p-confirmDialog>
  `,
  styles: [`
    :host ::ng-deep .pwa-install-dialog {
      .p-confirm-dialog {
        border-radius: 1rem;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .p-confirm-dialog-message {
        font-size: 1rem;
        line-height: 1.5;
        color: var(--text-color);
      }
      
      .p-confirm-dialog-icon {
        font-size: 2rem;
        color: var(--primary-color);
      }
      
      .p-button {
        border-radius: 0.75rem;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
        transition: all 0.2s ease;
      }
      
      .p-button-success {
        background: linear-gradient(135deg, var(--primary-color), var(--primary-600));
        border-color: transparent;
      }
      
      .p-button-success:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      }
      
      .p-button-outlined {
        color: var(--text-color-secondary);
        border-color: var(--surface-border);
      }
      
      .p-button-outlined:hover {
        background-color: var(--surface-hover);
      }
      
      /* Mobile specific styles */
      @media (max-width: 768px) {
        .p-confirm-dialog {
          margin: 1rem;
          max-width: calc(100vw - 2rem);
          border-radius: 1.5rem 1.5rem 0 0;
        }
        
        .p-confirm-dialog-message {
          font-size: 1.1rem;
          text-align: center;
        }
        
        .p-button {
          padding: 1rem 2rem;
          font-size: 1.1rem;
        }
      }
    }
  `]
})
export class PwaInstallDialogComponent implements OnInit, OnDestroy {
  private readonly pwaInstallService = inject(PwaInstallService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  get dialogStyle() {
    const state = this.pwaInstallService.installabilityState();
    const isMobile = state.platform === 'android' || state.platform === 'ios';
    
    return {
      width: isMobile ? '90vw' : '28rem',
      maxWidth: isMobile ? 'calc(100vw - 2rem)' : '32rem'
    };
  }

  ngOnInit(): void {
    // Only setup effects in browser environment
    if (this.isBrowser) {
      // Listen for dialog state changes using effect
      effect(() => {
        const show = this.pwaInstallService.showInstallDialog();
        if (show) {
          this.showInstallConfirmation();
        }
      });
    }
  }

  ngOnDestroy(): void {
    // Effects are automatically cleaned up by Angular
  }

  private showInstallConfirmation(): void {
    const isIosSafari = this.pwaInstallService.isIosSafari();
    const instructions = this.pwaInstallService.getInstallInstructions();
    
    // Different dialog configurations based on platform
    if (isIosSafari) {
      this.showIosInstallInstructions(instructions);
    } else {
      this.showStandardInstallPrompt(instructions);
    }
  }

  private showIosInstallInstructions(instructions: string): void {
    this.confirmationService.confirm({
      key: 'pwa-install',
      header: '📱 Instalar RageStudios',
      message: `
        <div style="text-align: center; line-height: 1.6;">
          <p style="margin-bottom: 1rem; font-size: 1.1em;">
            ¡Instala RageStudios como aplicación!
          </p>
          <div style="background: var(--surface-ground); padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; border-left: 4px solid var(--primary-color);">
            <p style="margin: 0; font-size: 0.95em;">
              ${instructions}
            </p>
          </div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 1rem; font-size: 0.9em; color: var(--text-color-secondary);">
            <i class="pi pi-info-circle"></i>
            <span>Acceso rápido y notificaciones de tus clases</span>
          </div>
        </div>
      `,
      icon: 'pi pi-mobile',
      acceptLabel: 'Entendido',
      rejectLabel: 'No mostrar más',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-outlined',
      position: this.getDialogPosition(),
      accept: () => {
        this.handleInstallDecision('understood');
      },
      reject: () => {
        this.handleInstallDecision('dismiss');
      }
    });
  }

  private showStandardInstallPrompt(instructions: string): void {
    this.confirmationService.confirm({
      key: 'pwa-install',
      header: '🚀 Instalar RageStudios',
      message: `
        <div style="text-align: center; line-height: 1.6;">
          <p style="margin-bottom: 1rem; font-size: 1.1em; font-weight: 600;">
            ¡Convierte RageStudios en una aplicación!
          </p>
          <p style="margin-bottom: 1rem; color: var(--text-color-secondary);">
            ${instructions}
          </p>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1.5rem 0; font-size: 0.9em;">
            <div style="text-align: center;">
              <i class="pi pi-bolt" style="font-size: 1.5rem; color: var(--primary-color); margin-bottom: 0.5rem;"></i>
              <p style="margin: 0; font-weight: 600;">Acceso rápido</p>
              <p style="margin: 0; color: var(--text-color-secondary);">Sin abrir el navegador</p>
            </div>
            <div style="text-align: center;">
              <i class="pi pi-bell" style="font-size: 1.5rem; color: var(--primary-color); margin-bottom: 0.5rem;"></i>
              <p style="margin: 0; font-weight: 600;">Notificaciones</p>
              <p style="margin: 0; color: var(--text-color-secondary);">Recordatorios de clases</p>
            </div>
          </div>
        </div>
      `,
      icon: 'pi pi-download',
      acceptLabel: 'Instalar ahora',
      rejectLabel: 'Ahora no',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-outlined',
      position: this.getDialogPosition(),
      accept: () => {
        this.handleInstallDecision('install');
      },
      reject: () => {
        this.handleInstallDecision('later');
      }
    });
  }

  private getDialogPosition(): 'center' | 'top' | 'bottom' | 'left' | 'right' | 'topleft' | 'topright' | 'bottomleft' | 'bottomright' {
    const state = this.pwaInstallService.installabilityState();
    const isMobile = state.platform === 'android' || state.platform === 'ios';
    
    // For mobile, show from bottom for better UX
    // For desktop, center is more appropriate
    return isMobile ? 'bottom' : 'center';
  }

  private async handleInstallDecision(decision: 'install' | 'later' | 'dismiss' | 'understood'): Promise<void> {
    switch (decision) {
      case 'install':
        const installed = await this.pwaInstallService.promptInstall();
        if (installed) {
          this.messageService.add({
            severity: 'success',
            summary: '¡Instalación exitosa!',
            detail: 'RageStudios se ha instalado correctamente',
            life: 4000
          });
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'Instalación cancelada',
            detail: 'Podrás instalar la app más tarde desde el menú del navegador',
            life: 4000
          });
        }
        break;
        
      case 'later':
        this.pwaInstallService.closeInstallDialog();
        this.messageService.add({
          severity: 'info',
          summary: 'Instalación pospuesta',
          detail: 'Te recordaremos más tarde',
          life: 3000
        });
        break;
        
      case 'dismiss':
        this.pwaInstallService.dismissInstall();
        this.messageService.add({
          severity: 'info',
          summary: 'Recordatorio desactivado',
          detail: 'No volveremos a mostrar este mensaje',
          life: 3000
        });
        break;
        
      case 'understood':
        this.pwaInstallService.closeInstallDialog();
        break;
    }
  }
}