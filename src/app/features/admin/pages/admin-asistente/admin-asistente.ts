import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { PanelModule } from 'primeng/panel';
import { MessageService } from 'primeng/api';
import { SupabaseService, UserSearchResult } from '../../../../core/services/supabase-service';
import { AsistenteService, AsistenteResponse } from '../../../../core/services/asistente.service';

interface PromptTemplate {
  label: string;
  value: string;
  text: string;
}

@Component({
  selector: 'app-admin-asistente',
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    ToastModule,
    AutoCompleteModule,
    SelectModule,
    TextareaModule,
    PanelModule
  ],
  providers: [MessageService],
  templateUrl: './admin-asistente.html',
  styleUrl: './admin-asistente.scss'
})
export class AdminAsistente {
  private supabaseService = inject(SupabaseService);
  private asistenteService = inject(AsistenteService);
  private messageService = inject(MessageService);

  // Selección de usuario (mismo patrón que admin-credits-assign)
  selectedUser = signal<UserSearchResult | null>(null);
  filteredUsers = signal<UserSearchResult[]>([]);

  // Plantillas de consulta
  templates: PromptTemplate[] = [
    {
      label: 'Créditos vencidos',
      value: 'expired',
      text: 'Revisa por qué a esta clienta se le vencieron los créditos. Explica las fechas de vencimiento de cada lote y cuántos créditos quedaban en cada uno.'
    },
    {
      label: '¿Dónde están mis créditos?',
      value: 'find-credits',
      text: 'La clienta dice que no encuentra sus créditos. Revisa si tiene más de una cuenta (mismo nombre o teléfono) y dime exactamente en qué cuenta están los créditos disponibles.'
    },
    {
      label: 'Cuentas duplicadas',
      value: 'duplicates',
      text: 'Verifica si esta persona tiene más de una cuenta registrada (mismo nombre o teléfono, posiblemente con emails distintos). Lista todas las cuentas con su email y dónde están sus créditos y reservas.'
    },
    {
      label: 'Resumen general de la cuenta',
      value: 'summary',
      text: 'Dame un resumen general del estado de la cuenta: créditos disponibles, lotes y fechas de vencimiento, compras recientes y las últimas reservas.'
    }
  ];
  selectedTemplate = signal<PromptTemplate | null>(null);

  // Prompt editable (se prellena al elegir plantilla)
  promptText = signal('');

  // Estado
  isLoading = signal(false);
  result = signal<AsistenteResponse | null>(null);

  reportHtml = computed(() => this.toHtml(this.result()?.report ?? ''));

  async searchUsers(event: any) {
    const query = event.query;
    if (!query || query.length < 2) {
      this.filteredUsers.set([]);
      return;
    }
    try {
      const users = await this.supabaseService.searchUsers(query);
      this.filteredUsers.set(users);
    } catch (error) {
      console.error('Error searching users:', error);
      this.filteredUsers.set([]);
    }
  }

  onUserSelect(event: any) {
    const user = (event?.value ? event.value : event) as UserSearchResult;
    this.selectedUser.set(user);
  }

  onTemplateChange(event: any) {
    const tpl = (event?.value ?? null) as PromptTemplate | null;
    this.selectedTemplate.set(tpl);
    if (tpl) {
      this.promptText.set(tpl.text);
    }
  }

  async generar() {
    const prompt = this.promptText().trim();
    if (!prompt) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Atención',
        detail: 'Escribe una consulta o elige una plantilla'
      });
      return;
    }

    this.isLoading.set(true);
    this.result.set(null);

    try {
      const user = this.selectedUser();
      const response = await this.asistenteService.consultar({
        prompt,
        user_id: user?.id,
        user_name: user?.full_name
      });
      this.result.set(response);
    } catch (error: any) {
      console.error('Error consultando asistente:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: error.message || 'No se pudo generar el informe'
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  resetForm() {
    this.selectedUser.set(null);
    this.selectedTemplate.set(null);
    this.promptText.set('');
    this.result.set(null);
    this.filteredUsers.set([]);
  }

  getUserDisplayText(user: UserSearchResult): string {
    return `${user.full_name} ${user.phone ? '(' + user.phone + ')' : ''}`;
  }

  formatToolInput(input: Record<string, unknown>): string {
    const parts = Object.entries(input).map(([k, v]) => `${k}: ${v}`);
    return parts.length ? parts.join(', ') : '(sin parámetros)';
  }

  /**
   * Render mínimo y seguro de markdown. Escapa el HTML de entrada y solo emite
   * etiquetas controladas (<strong>, <h4>, <ul>, <li>, <br>), que el sanitizador
   * de Angular permite al hacer binding con [innerHTML].
   */
  private toHtml(text: string): string {
    if (!text) return '';
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s: string) =>
      escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    const lines = text.split('\n');
    const out: string[] = [];
    let inList = false;

    const closeList = () => {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      const bullet = line.match(/^[-*]\s+(.*)$/);

      if (heading) {
        closeList();
        out.push(`<h4>${inline(heading[1])}</h4>`);
      } else if (bullet) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push(`<li>${inline(bullet[1])}</li>`);
      } else if (line === '') {
        closeList();
        out.push('<br>');
      } else {
        closeList();
        out.push(`${inline(line)}<br>`);
      }
    }
    closeList();
    return out.join('');
  }
}
