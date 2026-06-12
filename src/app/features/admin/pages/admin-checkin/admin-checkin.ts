import { Component, inject, signal, viewChild, ElementRef, AfterViewInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckinService, ScanResult } from '../../../../core/services/checkin.service';

interface LogEntry {
  name: string;
  cls: string;
  time: string;
  at: string;
}

/**
 * Estación de check-in para recepción. Un lector USB de QR (modo "keyboard
 * wedge": teclea el contenido + Enter) inyecta el token en un input siempre
 * enfocado. Al recibir Enter se valida contra la RPC y se muestra el resultado.
 */
@Component({
  selector: 'app-admin-checkin',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './admin-checkin.html',
  styleUrl: './admin-checkin.scss'
})
export class AdminCheckin implements AfterViewInit, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private checkinService = inject(CheckinService);

  private scanInput = viewChild<ElementRef<HTMLInputElement>>('scanInput');

  buffer = '';
  processing = signal(false);
  result = signal<ScanResult | null>(null);
  log = signal<LogEntry[]>([]);
  successCount = signal(0);

  private resetTimer?: ReturnType<typeof setTimeout>;
  private refocus = () => this.focusInput();

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.focusInput();
    // Mantener el input enfocado para no perder escaneos
    window.addEventListener('click', this.refocus);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('click', this.refocus);
    }
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  focusInput() {
    setTimeout(() => this.scanInput()?.nativeElement?.focus(), 0);
  }

  async onEnter() {
    const token = this.buffer.trim();
    this.buffer = '';
    if (!token || this.processing()) return;

    this.processing.set(true);
    try {
      const res = await this.checkinService.scanPass(token);
      this.result.set(res);
      this.beep(res.status_code === 'OK');

      if (res.status_code === 'OK') {
        this.successCount.update(c => c + 1);
        this.log.update(l => [{
          name: res.client_name || 'Cliente',
          cls: res.class_name || '',
          time: res.session_time || '',
          at: this.nowLabel()
        }, ...l].slice(0, 12));
      }
    } catch {
      this.result.set({ status_code: 'INVALID_TOKEN', message: 'Error al procesar el QR. Intenta de nuevo.' });
      this.beep(false);
    } finally {
      this.processing.set(false);
      this.focusInput();
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.result.set(null), 5000);
    }
  }

  isOk(): boolean {
    return this.result()?.status_code === 'OK';
  }

  private nowLabel(): string {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  private beep(ok: boolean) {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Sin audio disponible: no es crítico
    }
  }
}
