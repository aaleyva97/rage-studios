import { Component, OnInit, inject, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { CoachesService, Coach } from '../../services/coaches.service';

@Component({
  selector: 'app-coaches-grid',
  imports: [DialogModule, ButtonModule, SkeletonModule],
  templateUrl: './coaches-grid.html',
  styleUrl: './coaches-grid.scss'
})
export class CoachesGrid implements OnInit {
  private coachesService = inject(CoachesService);
  
  coaches = signal<Coach[]>([]);
  selectedCoach = signal<Coach | null>(null);
  showDetailsDialog = signal(false);
  isLoading = signal(true);
  
  ngOnInit() {
    this.loadCoaches();
  }
  
  async loadCoaches() {
    try {
      this.isLoading.set(true);
      const data = await this.coachesService.getActiveCoaches();
      this.coaches.set(data);
    } catch (error) {
      console.error('Error loading coaches:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  openCoachDetails(coach: Coach) {
    this.selectedCoach.set(coach);
    this.showDetailsDialog.set(true);
  }
  
  closeDetailsDialog() {
    this.showDetailsDialog.set(false);
    setTimeout(() => {
      this.selectedCoach.set(null);
    }, 300);
  }
}
