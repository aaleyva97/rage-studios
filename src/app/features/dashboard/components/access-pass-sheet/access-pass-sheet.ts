import { Component, inject, signal, effect, input, model, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DrawerModule } from 'primeng/drawer';
import QRCode from 'qrcode';
import { CheckinService } from '../../../../core/services/checkin.service';
import { CreditsService } from '../../../../core/services/credits.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

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
  private supabaseService = inject(SupabaseService);

  visible = model<boolean>(false);
  streak = input<number>(0);
  membership = input<string>('');

  qrDataUrl = signal<string | null>(null);
  memberCode = signal<string>('');
  secondsLeft = signal<number>(0);
  loading = signal<boolean>(false);
  errorMsg = signal<string | null>(null);

  // Señales para capturar el resultado del escaneo en vivo
  successScanResult = signal<any | null>(null);
  failScanResult = signal<any | null>(null);

  private countdownTimer?: ReturnType<typeof setInterval>;
  private expEpoch = 0;
  private realtimeChannel?: any;

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
    this.setupRealtimeListener();
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
    this.teardownRealtimeListener();
    this.qrDataUrl.set(null);
    this.errorMsg.set(null);
    this.successScanResult.set(null);
    this.failScanResult.set(null);
  }

  private async setupRealtimeListener() {
    try {
      const { data: { user } } = await this.supabaseService.client.auth.getUser();
      if (!user) {
        console.warn('AccessPassSheet: No user logged in, cannot listen for check-in broadcast.');
        return;
      }

      const userId = user.id;
      console.log('AccessPassSheet: Setting up realtime channel checkin-status:' + userId);
      // Escuchar eventos de broadcast en el canal del usuario
      this.realtimeChannel = this.supabaseService.client.channel(`checkin-status:${userId}`)
        .on('broadcast', { event: 'scan-result' }, (payload: any) => {
          console.log('AccessPassSheet: Received scan-result broadcast:', payload);
          if (payload && payload.payload) {
            this.handleScanResult(payload.payload);
          }
        });

      this.realtimeChannel.subscribe((status: string) => {
        console.log(`AccessPassSheet: Channel checkin-status:${userId} subscription status:`, status);
      });
    } catch (err) {
      console.warn('AccessPassSheet: No se pudo establecer el canal realtime de check-in:', err);
    }
  }

  private teardownRealtimeListener() {
    if (this.realtimeChannel) {
      console.log('AccessPassSheet: Unsubscribing from realtime checkin channel.');
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = undefined;
    }
  }

  private handleScanResult(res: any) {
    if (!isPlatformBrowser(this.platformId)) return;

    if (res.status_code === 'OK') {
      // Vibración de éxito en dispositivos móviles
      if ('vibrate' in navigator) {
        navigator.vibrate(100);
      }
      this.successScanResult.set(res);
      // Cerrar la hoja automáticamente después de 3.5 segundos
      setTimeout(() => {
        this.close();
      }, 3500);
    } else {
      // Vibración de alerta/error en dispositivos móviles
      if ('vibrate' in navigator) {
        navigator.vibrate([150, 80, 150]);
      }
      this.failScanResult.set(res);
    }
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

  clearFailResult() {
    this.failScanResult.set(null);
  }

  formatNextDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayName = days[date.getDay()];
      const dayNum = date.getDate();
      const monthName = months[date.getMonth()];
      return `${dayName} ${dayNum} de ${monthName}`;
    } catch {
      return dateStr;
    }
  }

  close() {
    this.visible.set(false);
  }

  ngOnDestroy() {
    this.stop();
  }
}
