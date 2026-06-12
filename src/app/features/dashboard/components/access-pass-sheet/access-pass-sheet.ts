import { Component, inject, signal, effect, input, model, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DrawerModule } from 'primeng/drawer';
import QRCode from 'qrcode';
import { CheckinService } from '../../../../core/services/checkin.service';
import { CreditsService } from '../../../../core/services/credits.service';

/**
 * Hoja inferior (bottom sheet) con el "Pase de acceso": muestra un QR firmado
 * por el servidor que se renueva solo mientras la hoja está abierta. El admin
 * lo escanea en recepción con el lector USB para marcar la asistencia.
 */
@Component({
  selector: 'app-access-pass-sheet',
  standalone: true,
  imports: [DrawerModule],
  templateUrl: './access-pass-sheet.html',
  styleUrl: './access-pass-sheet.scss'
})
export class AccessPassSheet implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private checkinService = inject(CheckinService);
  protected creditsService = inject(CreditsService);

  visible = model<boolean>(false);
  streak = input<number>(0);
  membership = input<string>('');

  qrDataUrl = signal<string | null>(null);
  memberCode = signal<string>('');
  secondsLeft = signal<number>(0);
  loading = signal<boolean>(false);
  errorMsg = signal<string | null>(null);

  private countdownTimer?: ReturnType<typeof setInterval>;
  private expEpoch = 0;

  constructor() {
    effect(() => {
      const isOpen = this.visible();
      if (!isPlatformBrowser(this.platformId)) return;
      if (isOpen) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  private start() {
    this.refresh();
    this.countdownTimer = setInterval(() => {
      const left = Math.max(0, this.expEpoch - Math.floor(Date.now() / 1000));
      this.secondsLeft.set(left);
      // Renovar un poco antes de expirar para no mostrar nunca un QR muerto
      if (left <= 3 && !this.loading()) {
        this.refresh();
      }
    }, 1000);
  }

  private stop() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    this.qrDataUrl.set(null);
    this.errorMsg.set(null);
  }

  async refresh() {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const pass = await this.checkinService.issuePass();
      this.memberCode.set(pass.member_code);
      this.expEpoch = Math.floor(new Date(pass.expires_at).getTime() / 1000);
      this.secondsLeft.set(Math.max(0, this.expEpoch - Math.floor(Date.now() / 1000)));
      this.qrDataUrl.set(
        await QRCode.toDataURL(pass.token, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 320,
          color: { dark: '#0a0a0a', light: '#ffffff' }
        })
      );
    } catch {
      this.errorMsg.set('No se pudo generar el pase. Revisa tu conexión.');
    } finally {
      this.loading.set(false);
    }
  }

  close() {
    this.visible.set(false);
  }

  ngOnDestroy() {
    this.stop();
  }
}
