import { Component, OnInit, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SessionsService, Session } from '../../services/sessions.service';

@Component({
  selector: 'app-sessions-grid',
  imports: [DialogModule, ButtonModule, ProgressSpinnerModule],
  templateUrl: './sessions-grid.html',
  styleUrl: './sessions-grid.scss'
})
export class SessionsGrid implements OnInit {
  private sessionsService = inject(SessionsService);
  
  sessions = signal<Session[]>([]);
  selectedSession = signal<Session | null>(null);
  showDetailsDialog = signal(false);
  isLoading = signal(true);
  
  ngOnInit() {
    this.loadSessions();
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