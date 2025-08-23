import { Component, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SpeedDial } from 'primeng/speeddial';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-social-speed-dial',
  imports: [SpeedDial],
  templateUrl: './social-speed-dial.html',
  styleUrl: './social-speed-dial.scss'
})
export class SocialSpeedDial {
  private platformId = inject(PLATFORM_ID);

  items: MenuItem[] = [
    {
      icon: 'pi pi-instagram',
      command: () => {
        if (isPlatformBrowser(this.platformId)) {
          window.open('https://www.instagram.com/ragestudiosmx/', '_blank');
        }
      }
    },
    {
      icon: 'pi pi-whatsapp',
      command: () => {
        if (isPlatformBrowser(this.platformId)) {
          window.open('https://wa.me/528715817065', '_blank');
        }
      }
    }
  ];
}
