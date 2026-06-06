import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import type { EmailOtpType } from '@supabase/supabase-js';
import { SupabaseService } from '../../../../core/services/supabase-service';

type ConfirmState = 'checking' | 'error';

/**
 * Página intermedia para enlaces de correo (recuperación de contraseña y confirmación
 * de registro). El enlace del correo apunta a NUESTRO dominio
 * (https://ragestudios.mx/auth/confirm?token_hash=...&type=...) en vez de al dominio de
 * Supabase, para que coincida con el remitente y Gmail no lo marque como phishing.
 * Aquí intercambiamos el token_hash por una sesión con verifyOtp y redirigimos según el tipo.
 */
@Component({
  selector: 'app-auth-confirm',
  imports: [ButtonModule, CardModule, ProgressSpinnerModule],
  templateUrl: './auth-confirm.html',
  styleUrl: './auth-confirm.scss',
})
export class AuthConfirm implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supabaseService = inject(SupabaseService);
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  state = signal<ConfirmState>('checking');

  async ngOnInit() {
    // El intercambio de token solo tiene sentido en el navegador.
    if (!this.isBrowser) {
      return;
    }

    const params = this.route.snapshot.queryParamMap;
    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;

    if (!tokenHash || !type) {
      this.state.set('error');
      return;
    }

    try {
      const { error } = await this.supabaseService.client.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });

      if (error) {
        this.state.set('error');
        return;
      }

      // Token válido: ya hay sesión. Redirigimos según la acción del correo.
      if (type === 'recovery') {
        this.router.navigate(['/mi-cuenta/cambiar-contrasena']);
      } else {
        this.router.navigate(['/email-confirmado']);
      }
    } catch {
      this.state.set('error');
    }
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
