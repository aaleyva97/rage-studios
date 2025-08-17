import { Component, OnInit, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { SessionsService, Session } from '../../services/sessions.service';
import { SupabaseService } from '../../../../core/services/supabase-service';

@Component({
  selector: 'app-sessions-grid',
  imports: [DialogModule, ButtonModule, ProgressSpinnerModule, SkeletonModule],
  templateUrl: './sessions-grid.html',
  styleUrl: './sessions-grid.scss'
})
export class SessionsGrid implements OnInit {
  private sessionsService = inject(SessionsService);
  private supabaseService = inject(SupabaseService);
  
  sessions = signal<Session[]>([]);
  selectedSession = signal<Session | null>(null);
  showDetailsDialog = signal(false);
  isLoading = signal(true);
  isLoggedIn = signal(false);
  
  ngOnInit() {
    this.loadSessions();
    this.checkAuthStatus();
  }
  
  private checkAuthStatus() {
    this.isLoggedIn.set(this.supabaseService.isLoggedIn());
    
    this.supabaseService.currentUser$.subscribe(user => {
      this.isLoggedIn.set(!!user);
    });
  }
  
  async loadSessions() {
    try {
      this.isLoading.set(true);
      const data = await this.sessionsService.getSessions();
      this.sessions.set(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  openSessionDetails(session: Session) {
    this.selectedSession.set(session);
    this.showDetailsDialog.set(true);
  }
  
  closeDetailsDialog() {
    this.showDetailsDialog.set(false);
    setTimeout(() => {
      this.selectedSession.set(null);
    }, 300);
  }
}