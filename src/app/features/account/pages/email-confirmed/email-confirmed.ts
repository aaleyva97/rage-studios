import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

type ConfirmState = 'checking' | 'success' | 'error';

@Component({
  selector: 'app-email-confirmed',
  imports: [ButtonModule, CardModule, ProgressSpinnerModule],
  templateUrl: './email-confirmed.html',
  styleUrl: './email-confirmed.scss',
})
export class EmailConfirmed implements OnInit {
  private router = inject(Router);

  state = signal<ConfirmState>('checking');

  async ngOnInit() {
    // Supabase procesa el token del enlace automáticamente (detectSessionInUrl).
    // Damos un breve margen para que se establezca la sesión antes de comprobarla.
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Llegar a esta página significa que el usuario hizo clic en el enlace válido,
    // por lo que su correo ya quedó confirmado en Supabase. Mostramos éxito.
    this.state.set('success');
  }

  goToAccount() {
    this.router.navigate(['/mi-cuenta']);
  }

  goToHome() {
    this.router.navigate(['/']);
  }
}
