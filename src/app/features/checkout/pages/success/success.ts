import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { CreditsService } from '../../../../core/services/credits.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-success',
  imports: [ButtonModule, CardModule, ProgressSpinnerModule],
  templateUrl: './success.html',
  styleUrl: './success.scss',
})
export class Success implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supabaseService = inject(SupabaseService);

  isProcessing = signal(true);
  isSuccess = signal(false);
  errorMessage = signal('');

  async ngOnInit() {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (!sessionId) {
      this.errorMessage.set('Sesión de pago no válida');
      this.isProcessing.set(false);
      return;
    }

    try {
      // Llamar al webhook manualmente para procesar el pago
      const { data, error } = await this.supabaseService.client.functions.invoke(
        'stripe-webhook',
        {
          body: {
            session_id: sessionId,
            type: 'checkout.session.completed',
          },
        }
      );

      if (error) throw error;

      this.isSuccess.set(true);
      // Refrescar los créditos en el estado global inmediatamente tras éxito
      const creditsService = inject(CreditsService);
      await creditsService.refreshCredits();
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error al procesar el pago');
    } finally {
      this.isProcessing.set(false);
    }
  }

  goToAccount() {
    this.router.navigate(['/mi-cuenta']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
