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
  private creditsService = inject(CreditsService);

  // 🚨 FIX: Estados mejorados para evitar el flash de error
  isProcessing = signal(true);
  isSuccess = signal(false);
  hasError = signal(false); // Nuevo estado explícito para errores
  errorMessage = signal('');

  async ngOnInit() {
    // 🔄 Asegurar que estamos procesando desde el inicio
    this.isProcessing.set(true);
    this.hasError.set(false);
    
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');

    if (!sessionId) {
      this.errorMessage.set('Sesión de pago no válida');
      this.hasError.set(true);
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

      // 🎯 Marcar como exitoso
      this.isSuccess.set(true);
      
      // Esperar un momento para que la BD se actualice
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refrescar los créditos
      await this.creditsService.refreshCredits();
      
      // Refresh adicional como respaldo
      setTimeout(async () => {
        await this.creditsService.refreshCredits();
      }, 2000);
      
    } catch (error: any) {
      this.errorMessage.set(error.message || 'Error al procesar el pago');
      this.hasError.set(true);
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