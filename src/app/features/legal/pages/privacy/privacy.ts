import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Aviso de privacidad.
 *
 * Existe por dos motivos que conviene no confundir:
 *
 * 1. **App Store Review Guideline 5.1.1(i)** exige una URL de política de
 *    privacidad en la ficha de App Store Connect —sin ella no se puede ni
 *    enviar— y un enlace accesible dentro de la app. La app nativa apunta aquí.
 * 2. **La LFPDPPP** (art. 15-16) obliga a que el responsable se identifique y
 *    explique qué datos trata, para qué, a quién los transfiere y cómo se
 *    ejercen los derechos ARCO.
 *
 * Lo que dice sobre la eliminación de cuenta es carga estructural, no relleno:
 * `delete_my_account()` conserva compras y reservas disociadas porque seis
 * llaves foráneas en cascada se llevarían el histórico contable del estudio.
 * Apple permite esa retención sólo si está declarada, así que si esta página
 * deja de decirlo, la retención deja de estar amparada.
 *
 * Estático a propósito: sin servicios, sin PrimeNG y prerenderizado, para que
 * la URL responda siempre — incluida la vez que la abra un revisor de Apple.
 */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  templateUrl: './privacy.html',
})
export class Privacy {
  /** Se muestra al pie. Actualízala al cambiar el contenido. */
  readonly lastUpdated = '8 de agosto de 2026';

  /**
   * Canal de atención para solicitudes ARCO.
   *
   * Ojo: NO es el mismo número que el `social-speed-dial` de la landing
   * (`528715817065`). Aquél es el WhatsApp comercial del estudio; éste es el
   * contacto del responsable del tratamiento de datos. Si algún día se
   * unifican, hay que cambiarlo en los dos sitios a conciencia.
   */
  readonly contactPhone = '+52 871 564 0952';
  readonly whatsapp = 'https://wa.me/528715640952';
  readonly contactEmail = 'j.eduardo.bc@icloud.com';
}
