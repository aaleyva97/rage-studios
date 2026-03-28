import { Component, inject, model } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { MembershipService } from '../../../core/services/membership.service';

@Component({
  selector: 'app-membership-info-dialog',
  standalone: true,
  imports: [DialogModule, TagModule],
  template: `
    <p-dialog
      header="Mi Membres\u00eda"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '95vw', 'max-width': '450px' }"
      [breakpoints]="{ '640px': '95vw' }"
      [dismissableMask]="true">

      @if (membership(); as m) {
        <div class="space-y-4">
          <!-- Status -->
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900">{{ m.client_name }}</h3>
            <p-tag value="Activa" severity="success" [rounded]="true" />
          </div>

          <!-- Notes -->
          @if (m.notes) {
            <p class="text-sm text-gray-500 italic">{{ m.notes }}</p>
          }

          <!-- Schedules -->
          @if (m.schedules.length > 0) {
            <div>
              <h4 class="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">
                Horarios asignados
              </h4>
              <div class="space-y-2">
                @for (schedule of m.schedules; track schedule.id) {
                  <div class="bg-gray-50 rounded-lg p-3">
                    <div class="font-medium text-gray-900">
                      {{ schedule.day_name }} {{ schedule.start_time.substring(0, 5) }} - {{ schedule.end_time.substring(0, 5) }}
                    </div>
                    <div class="text-sm text-gray-600 mt-1">
                      Camas: <strong>{{ schedule.bed_numbers.join(', ') }}</strong>
                    </div>
                  </div>
                }
              </div>
            </div>
          } @else {
            <p class="text-sm text-gray-400 italic">Sin horarios asignados</p>
          }
        </div>
      } @else {
        <div class="text-center py-6">
          <i class="pi pi-id-card text-4xl text-gray-300 mb-3"></i>
          <p class="text-gray-500">No tienes una membres\u00eda activa</p>
        </div>
      }
    </p-dialog>
  `,
})
export class MembershipInfoDialog {
  visible = model(false);
  protected membership = inject(MembershipService).userMembership;
}
