import { Component, inject, signal, computed, viewChild, ElementRef, AfterViewInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckinService, ScanResult, ClassInfo, RosterEntry } from '../../../../core/services/checkin.service';

/**
 * Estación de check-in para recepción.
 *
 * - Un lector USB de QR (modo "keyboard wedge": teclea el contenido + Enter)
 *   inyecta el token en un input siempre enfocado; al recibir Enter se valida
 *   contra la RPC y se marca la asistencia.
 * - Muestra la LISTA en vivo de la clase en curso (esperados), con contador
 *   "X de Y", palomeando a cada quien al escanear. Permite marcado manual
 *   (respaldo) y cambiar de clase.
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

  // ── Escaneo ────────────────────────────────────────────────
  buffer = '';
  processing = signal(false);
  result = signal<ScanResult | null>(null);
  successCount = signal(0);

  // ── Lista en vivo ──────────────────────────────────────────
  classes = signal<ClassInfo[]>([]);
  selectedTime = signal<string | null>(null);
  roster = signal<RosterEntry[]>([]);
  loadingRoster = signal(false);
  markingKey = signal<string | null>(null);

  expectedCount = computed(() => this.roster().length);
  checkedCount = computed(() => this.roster().filter(e => e.attended).length);
  progressPct = computed(() => {
    const total = this.expectedCount();
    return total === 0 ? 0 : Math.round((this.checkedCount() / total) * 100);
  });
  selectedClass = computed(() => this.classes().find(c => c.session_time === this.selectedTime()) ?? null);

  private resetTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private refocus = () => this.focusInput();

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.focusInput();
    window.addEventListener('click', this.refocus);
    this.loadAll();
    // Refresco en vivo (la clase dura ~50 min; 5s es de sobra)
    this.pollTimer = setInterval(() => this.refresh(), 5000);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('click', this.refocus);
    }
    if (this.resetTimer) clearTimeout(this.resetTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  focusInput() {
    setTimeout(() => this.scanInput()?.nativeElement?.focus(), 0);
  }

  // ── Carga / refresco ───────────────────────────────────────
  private async loadAll() {
    await this.loadClasses();
    if (!this.selectedTime()) {
      const current = this.classes().find(c => c.is_current) ?? this.classes()[0];
      if (current) this.selectedTime.set(current.session_time);
    }
    await this.loadRoster();
  }

  private async loadClasses() {
    try {
      this.classes.set(await this.checkinService.getTodayClasses());
    } catch {
      // mantener lo previo en caso de fallo de red puntual
    }
  }

  private async loadRoster() {
    const time = this.selectedTime();
    if (!time) {
      this.roster.set([]);
      return;
    }
    this.loadingRoster.set(true);
    try {
      this.roster.set(await this.checkinService.getRoster(time));
    } catch {
      // ignorar fallo puntual
    } finally {
      this.loadingRoster.set(false);
    }
  }

  private async refresh() {
    if (this.markingKey()) return; // no pisar una acción en curso
    await this.loadClasses();
    await this.loadRoster();
  }

  selectClass(time: string) {
    if (time === this.selectedTime()) return;
    this.selectedTime.set(time);
    this.loadRoster();
    this.focusInput();
  }

  // ── Escaneo ────────────────────────────────────────────────
  async onEnter() {
    const token = this.buffer.trim();
    this.buffer = '';
    console.log('AdminCheckin: Scanned code / input text entered:', token);
    if (!token) {
      console.warn('AdminCheckin: Empty token entered.');
      return;
    }
    if (this.processing()) {
      console.warn('AdminCheckin: Busy processing previous scan.');
      return;
    }

    this.processing.set(true);
    try {
      console.log('AdminCheckin: Submitting scanPass RPC with token:', token);
      const res = await this.checkinService.scanPass(token);
      console.log('AdminCheckin: Received scanPass response:', res);
      this.result.set(res);
      this.beep(res.status_code === 'OK');
      if (res.status_code === 'OK') {
        this.successCount.update(c => c + 1);
      }
      
      // Difundir resultado en tiempo real al dispositivo del cliente
      if (res.client_id) {
        console.log(`AdminCheckin: Client ID found in response: ${res.client_id}. Initiating realtime broadcast...`);
        this.checkinService.broadcastScanResult(res.client_id, res).catch(err => {
          console.warn('AdminCheckin: Error al transmitir el resultado del escaneo al cliente:', err);
        });
      } else {
        console.warn('AdminCheckin: No client_id returned from scanPass RPC, cannot broadcast.');
      }
    } catch (error) {
      console.error('AdminCheckin: Error executing scanPass RPC:', error);
      this.result.set({ status_code: 'INVALID_TOKEN', message: 'Error al procesar el QR. Intenta de nuevo.' });
      this.beep(false);
    } finally {
      this.processing.set(false);
      this.focusInput();
      this.refresh(); // palomear en vivo a quien acaba de escanear
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.result.set(null), 5000);
    }
  }

  // ── Marcado manual ─────────────────────────────────────────
  entryKey(e: RosterEntry): string {
    return e.booking_id ?? e.membership_schedule_id ?? e.user_id ?? e.display_name;
  }

  async toggleEntry(entry: RosterEntry) {
    if (this.markingKey()) return;
    const key = this.entryKey(entry);
    this.markingKey.set(key);
    try {
      if (entry.kind === 'booking' && entry.booking_id) {
        await this.checkinService.markBooking(entry.booking_id, entry.attended ? 'pending' : 'attended');
      } else if (entry.kind === 'membership' && entry.membership_schedule_id) {
        await this.checkinService.checkinMembership(entry.membership_schedule_id);
      }
      await this.loadClasses();
      await this.loadRoster();
    } catch {
      // ignorar; el próximo poll reconcilia
    } finally {
      this.markingKey.set(null);
      this.focusInput();
    }
  }

  isOk(): boolean {
    return this.result()?.status_code === 'OK';
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
      // sin audio: no es crítico
    }
  }
}
