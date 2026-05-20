import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { SupabaseService, UserSearchResult } from '../../../../core/services/supabase-service';
import { BlacklistService, BlacklistEntry } from '../../../../core/services/blacklist.service';

@Component({
  selector: 'app-admin-blacklist',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    AutoCompleteModule,
    DialogModule,
    TextareaModule,
    TagModule
  ],
  providers: [MessageService],
  templateUrl: './admin-blacklist.html',
  styleUrl: './admin-blacklist.scss'
})
export class AdminBlacklist implements OnInit {
  private supabaseService = inject(SupabaseService);
  private blacklistService = inject(BlacklistService);
  private messageService = inject(MessageService);

  filteredUsers = signal<UserSearchResult[]>([]);
  selectedUser = signal<UserSearchResult | null>(null);
  blacklist = signal<BlacklistEntry[]>([]);

  isLoadingList = signal(false);
  isProcessing = signal(false);

  showAddDialog = signal(false);
  showRemoveDialog = signal(false);
  userToRemove = signal<BlacklistEntry | null>(null);
  addReason = signal('');
  removeReason = signal('');

  async ngOnInit() {
    await this.loadBlacklist();
  }

  async loadBlacklist() {
    this.isLoadingList.set(true);
    try {
      const list = await this.blacklistService.getBlacklist();
      this.blacklist.set(list);
    } catch (error) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Error al cargar la lista negra' });
    } finally {
      this.isLoadingList.set(false);
    }
  }

  async searchUsers(event: any) {
    const query = event.query;
    if (!query || query.length < 2) {
      this.filteredUsers.set([]);
      return;
    }
    try {
      const users = await this.supabaseService.searchUsers(query);
      const blacklistedIds = new Set(this.blacklist().map(e => e.user_id));
      this.filteredUsers.set(users.filter(u => !blacklistedIds.has(u.id)));
    } catch {
      this.filteredUsers.set([]);
    }
  }

  onUserSelect(event: any) {
    const user = (event?.value ? event.value : event) as UserSearchResult;
    this.selectedUser.set(user);
  }

  onUserBlur() {
    if (this.selectedUser() && typeof this.selectedUser() !== 'object') {
      this.selectedUser.set(null);
    }
  }

  openAddDialog() {
    this.addReason.set('');
    this.showAddDialog.set(true);
  }

  closeAddDialog() {
    this.showAddDialog.set(false);
    this.addReason.set('');
  }

  openRemoveDialog(entry: BlacklistEntry) {
    this.userToRemove.set(entry);
    this.removeReason.set('');
    this.showRemoveDialog.set(true);
  }

  closeRemoveDialog() {
    this.showRemoveDialog.set(false);
    this.userToRemove.set(null);
    this.removeReason.set('');
  }

  async confirmAdd() {
    const user = this.selectedUser();
    const reason = this.addReason().trim();

    if (!user || !reason) return;

    this.isProcessing.set(true);
    try {
      await this.blacklistService.addToBlacklist(user.id, reason);
      this.blacklistService.clearCache();
      this.messageService.add({
        severity: 'success',
        summary: 'Usuario bloqueado',
        detail: `${user.full_name} ha sido agregado a la lista negra`
      });
      this.selectedUser.set(null);
      this.closeAddDialog();
      await this.loadBlacklist();
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'No se pudo agregar el usuario a la lista negra'
      });
    } finally {
      this.isProcessing.set(false);
    }
  }

  async confirmRemove() {
    const entry = this.userToRemove();
    if (!entry) return;

    this.isProcessing.set(true);
    try {
      await this.blacklistService.removeFromBlacklist(entry.user_id);
      this.blacklistService.clearCache();
      this.messageService.add({
        severity: 'success',
        summary: 'Restricción removida',
        detail: `${entry.profiles.full_name} ha sido removido de la lista negra`
      });
      this.closeRemoveDialog();
      await this.loadBlacklist();
    } catch (error: any) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'No se pudo remover el usuario de la lista negra'
      });
    } finally {
      this.isProcessing.set(false);
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
