import {
  Component,
  inject,
  signal,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

interface InstallStep {
  icon: string;
  title: string;
  detail?: string;
}

interface PlatformInstructions {
  platformLabel: string;
  platformIcon: string;
  intro: string;
  steps: InstallStep[];
  closingNote?: string;
}

@Component({
  selector: 'app-pwa-install-instructions-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="true"
      [showHeader]="false"
      styleClass="pwa-instructions-dialog"
      [breakpoints]="{ '640px': '100vw' }"
      [style]="{ width: '28rem', maxWidth: 'calc(100vw - 2rem)' }">

      <div class="flex flex-col">
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 pt-5 pb-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50">
            <i class="pi {{ instructions().platformIcon }} text-blue-600 text-lg"></i>
          </div>
          <div class="flex-1">
            <h3 class="text-base font-semibold text-gray-900 leading-tight">
              Instalar RageStudios
            </h3>
            <p class="text-xs text-gray-500 mt-0.5">
              {{ instructions().platformLabel }}
            </p>
          </div>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-700 transition-colors p-1 -mr-1"
            (click)="close()"
            aria-label="Cerrar">
            <i class="pi pi-times text-base"></i>
          </button>
        </div>

        <!-- Intro -->
        <div class="px-5 pb-2">
          <p class="text-sm text-gray-700 leading-relaxed">
            {{ instructions().intro }}
          </p>
        </div>

        <!-- Steps -->
        <ol class="px-5 py-4 space-y-3">
          @for (step of instructions().steps; track $index) {
            <li class="flex items-start gap-3">
              <div class="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-semibold shrink-0 mt-0.5">
                {{ $index + 1 }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-gray-900">{{ step.title }}</span>
                  @if (step.icon) {
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-100 border border-gray-200 shrink-0">
                      <i class="pi {{ step.icon }} text-gray-700 text-xs"></i>
                    </span>
                  }
                </div>
                @if (step.detail) {
                  <p class="text-xs text-gray-600 mt-1 leading-relaxed">
                    {{ step.detail }}
                  </p>
                }
              </div>
            </li>
          }
        </ol>

        <!-- Closing note -->
        @if (instructions().closingNote) {
          <div class="mx-5 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
            <p class="text-xs text-blue-900 leading-relaxed">
              <i class="pi pi-info-circle mr-1"></i>
              {{ instructions().closingNote }}
            </p>
          </div>
        }

        <!-- Footer -->
        <div class="px-5 pb-5 pt-2">
          <p-button
            label="Entendido"
            severity="contrast"
            styleClass="w-full"
            [style]="{ width: '100%' }"
            (onClick)="close()">
          </p-button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .pwa-instructions-dialog {
      .p-dialog-content {
        padding: 0;
      }
      .p-dialog {
        border-radius: 1rem;
        overflow: hidden;
      }
    }
  `],
})
export class PwaInstallInstructionsDialogComponent {
  private pwaInstallService = inject(PwaInstallService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  visible = this.pwaInstallService.showInstructionsDialog;

  instructions = computed<PlatformInstructions>(() => {
    if (!this.isBrowser) return this.iosInstructions();
    const state = this.pwaInstallService.installabilityState();

    if (state.platform === 'ios') {
      return this.iosInstructions();
    }
    if (state.platform === 'android') {
      return this.androidInstructions();
    }
    return this.desktopInstructions();
  });

  close() {
    this.pwaInstallService.closeInstructionsDialog();
  }

  private iosInstructions(): PlatformInstructions {
    return {
      platformLabel: 'iPhone · Safari',
      platformIcon: 'pi-apple',
      intro: 'Instala RageStudios en tu pantalla de inicio para recibir notificaciones y acceder más rápido.',
      steps: [
        {
          icon: 'pi-share-alt',
          title: 'Toca el botón Compartir',
          detail: 'Está en la barra inferior de Safari (icono de cuadrado con flecha hacia arriba).',
        },
        {
          icon: 'pi-arrow-down',
          title: 'Desplázate hacia abajo en el menú',
          detail: 'Verás varias opciones de compartir; sigue bajando hasta encontrar la siguiente.',
        },
        {
          icon: 'pi-plus',
          title: 'Toca "Añadir a la pantalla de inicio"',
        },
        {
          icon: 'pi-check',
          title: 'Confirma tocando "Añadir"',
          detail: 'Está en la esquina superior derecha. La app aparecerá en tu pantalla de inicio.',
        },
      ],
      closingNote: 'iOS solo permite notificaciones push si abres la app desde el icono de la pantalla de inicio (no desde Safari).',
    };
  }

  private androidInstructions(): PlatformInstructions {
    return {
      platformLabel: 'Android · Chrome',
      platformIcon: 'pi-android',
      intro: 'Instala RageStudios como una app nativa para recibir notificaciones y abrirla más rápido.',
      steps: [
        {
          icon: 'pi-ellipsis-v',
          title: 'Toca el menú de Chrome',
          detail: 'Está en la esquina superior derecha (tres puntos verticales).',
        },
        {
          icon: 'pi-download',
          title: 'Selecciona "Instalar app"',
          detail: 'En algunas versiones aparece como "Añadir a pantalla principal".',
        },
        {
          icon: 'pi-check',
          title: 'Confirma tocando "Instalar"',
          detail: 'La app se instalará y aparecerá entre tus aplicaciones.',
        },
      ],
    };
  }

  private desktopInstructions(): PlatformInstructions {
    return {
      platformLabel: 'Computadora · Chrome / Edge',
      platformIcon: 'pi-desktop',
      intro: 'Instala RageStudios como una aplicación de escritorio para abrirla en su propia ventana.',
      steps: [
        {
          icon: 'pi-download',
          title: 'Click en el icono de instalación',
          detail: 'Aparece a la derecha de la barra de direcciones (icono de monitor con flecha).',
        },
        {
          icon: 'pi-check',
          title: 'Click en "Instalar"',
          detail: 'La app se abrirá en su propia ventana sin la barra del navegador.',
        },
      ],
      closingNote: 'Si no ves el icono de instalación, abre el menú del navegador y busca "Instalar RageStudios".',
    };
  }
}
