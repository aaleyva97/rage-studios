import { Injectable, signal, computed, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallabilityState {
  canInstall: boolean;
  isInstalled: boolean;
  isInstallable: boolean;
  platform: 'android' | 'ios' | 'desktop' | 'unknown';
  browser: 'chrome' | 'safari' | 'firefox' | 'edge' | 'unknown';
}

@Injectable({
  providedIn: 'root'
})
export class PwaInstallService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  
  // Core state signals
  showInstallDialog = signal(false);
  installPromptEvent = signal<BeforeInstallPromptEvent | null>(null);
  installabilityState = signal<InstallabilityState>({
    canInstall: false,
    isInstalled: false,
    isInstallable: false,
    platform: 'unknown',
    browser: 'unknown'
  });

  // User preference signals
  private userDismissedInstall = signal(false);
  private lastPromptTime = signal<number>(0);
  private installPromptCount = signal(0);

  // Computed properties
  shouldShowInstallPrompt = computed(() => {
    const state = this.installabilityState();
    const dismissed = this.userDismissedInstall();
    const promptCount = this.installPromptCount();
    const lastPrompt = this.lastPromptTime();
    const now = Date.now();
    
    // Don't show if:
    // - Not installable or already installed
    // - User dismissed permanently (more than 3 times)
    // - Prompted recently (within 24 hours)
    return state.canInstall && 
           !state.isInstalled && 
           !dismissed &&
           promptCount < 3 &&
           (now - lastPrompt) > 24 * 60 * 60 * 1000; // 24 hours
  });

  isIosSafari = computed(() => {
    const state = this.installabilityState();
    return state.platform === 'ios' && state.browser === 'safari';
  });

  constructor() {
    if (this.isBrowser) {
      this.initializeService();
      this.loadUserPreferences();
      this.setupEventListeners();
      
      // Auto-detect installability after a short delay
      setTimeout(() => this.detectInstallability(), 1000);
    }
  }

  private initializeService(): void {
    const detection = this.detectPlatformAndBrowser();
    this.installabilityState.set(detection);
  }

  private detectPlatformAndBrowser(): InstallabilityState {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone ||
                        document.referrer.includes('android-app://');

    // Platform detection
    let platform: InstallabilityState['platform'] = 'unknown';
    if (/android/.test(userAgent)) {
      platform = 'android';
    } else if (/iphone|ipad|ipod/.test(userAgent)) {
      platform = 'ios';
    } else if (/windows|mac|linux/.test(userAgent)) {
      platform = 'desktop';
    }

    // Browser detection
    let browser: InstallabilityState['browser'] = 'unknown';
    if (/chrome/.test(userAgent) && !/edg/.test(userAgent)) {
      browser = 'chrome';
    } else if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
      browser = 'safari';
    } else if (/firefox/.test(userAgent)) {
      browser = 'firefox';
    } else if (/edg/.test(userAgent)) {
      browser = 'edge';
    }

    return {
      canInstall: false, // Will be updated by detectInstallability
      isInstalled: isStandalone,
      isInstallable: false, // Will be updated by detectInstallability
      platform,
      browser
    };
  }

  private detectInstallability(): void {
    const currentState = this.installabilityState();
    
    // Check if already installed
    if (currentState.isInstalled) {
      this.installabilityState.set({
        ...currentState,
        canInstall: false,
        isInstallable: false
      });
      return;
    }

    // Check for beforeinstallprompt support (Chrome/Edge Android/Desktop)
    const hasBeforeInstallPrompt = this.installPromptEvent() !== null;
    
    // iOS Safari specific detection
    const isIosSafariInstallable = currentState.platform === 'ios' && 
                                  currentState.browser === 'safari' && 
                                  !currentState.isInstalled;

    // Desktop Chrome/Edge with manifest
    const isDesktopInstallable = currentState.platform === 'desktop' && 
                                (currentState.browser === 'chrome' || currentState.browser === 'edge');

    const canInstall = hasBeforeInstallPrompt || isIosSafariInstallable;
    const isInstallable = canInstall || isDesktopInstallable;

    this.installabilityState.set({
      ...currentState,
      canInstall,
      isInstallable
    });
  }

  private setupEventListeners(): void {
    // Listen for beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPromptEvent.set(event as BeforeInstallPromptEvent);
      this.detectInstallability();
    });

    // Listen for appinstalled
    window.addEventListener('appinstalled', () => {
      const currentState = this.installabilityState();
      this.installabilityState.set({
        ...currentState,
        isInstalled: true,
        canInstall: false
      });
      this.closeInstallDialog();
    });

    // Listen for display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      const currentState = this.installabilityState();
      this.installabilityState.set({
        ...currentState,
        isInstalled: e.matches
      });
    });
  }

  private loadUserPreferences(): void {
    try {
      const dismissed = localStorage.getItem('pwa-install-dismissed') === 'true';
      const lastPrompt = parseInt(localStorage.getItem('pwa-last-prompt') || '0');
      const promptCount = parseInt(localStorage.getItem('pwa-prompt-count') || '0');

      this.userDismissedInstall.set(dismissed);
      this.lastPromptTime.set(lastPrompt);
      this.installPromptCount.set(promptCount);
    } catch (error) {
      console.warn('Could not load PWA preferences from localStorage:', error);
    }
  }

  private saveUserPreferences(): void {
    try {
      localStorage.setItem('pwa-install-dismissed', this.userDismissedInstall().toString());
      localStorage.setItem('pwa-last-prompt', this.lastPromptTime().toString());
      localStorage.setItem('pwa-prompt-count', this.installPromptCount().toString());
    } catch (error) {
      console.warn('Could not save PWA preferences to localStorage:', error);
    }
  }

  // Public API methods
  openInstallDialog(): void {
    const currentCount = this.installPromptCount();
    this.installPromptCount.set(currentCount + 1);
    this.lastPromptTime.set(Date.now());
    this.showInstallDialog.set(true);
    this.saveUserPreferences();
  }

  closeInstallDialog(): void {
    this.showInstallDialog.set(false);
  }

  async promptInstall(): Promise<boolean> {
    const promptEvent = this.installPromptEvent();
    
    if (!promptEvent) {
      return false;
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      
      if (choice.outcome === 'accepted') {
        this.installPromptEvent.set(null);
        this.closeInstallDialog();
        return true;
      } else {
        this.dismissInstall();
        return false;
      }
    } catch (error) {
      console.error('Error during PWA install prompt:', error);
      return false;
    }
  }

  dismissInstall(): void {
    const currentCount = this.installPromptCount();
    
    // If user dismissed 3 times, mark as permanently dismissed
    if (currentCount >= 3) {
      this.userDismissedInstall.set(true);
    }
    
    this.closeInstallDialog();
    this.saveUserPreferences();
  }

  resetDismissal(): void {
    this.userDismissedInstall.set(false);
    this.installPromptCount.set(0);
    this.lastPromptTime.set(0);
    this.saveUserPreferences();
  }

  // Utility methods
  getInstallInstructions(): string {
    const state = this.installabilityState();
    
    if (state.platform === 'ios' && state.browser === 'safari') {
      return 'Para instalar la app, toca el botón de compartir y selecciona "Añadir a la pantalla de inicio"';
    } else if (state.platform === 'android') {
      return 'Instala la app para un acceso más rápido y notificaciones';
    } else {
      return 'Instala RageStudios como aplicación para una mejor experiencia';
    }
  }

  canShowAutomaticPrompt(): boolean {
    return this.shouldShowInstallPrompt() && this.installabilityState().canInstall;
  }
}