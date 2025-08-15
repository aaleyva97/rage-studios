import { Component } from '@angular/core';
import { SpeedDial } from 'primeng/speeddial';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-social-speed-dial',
  imports: [SpeedDial],
  templateUrl: './social-speed-dial.html',
  styleUrl: './social-speed-dial.scss'
})
export class SocialSpeedDial {
  items: MenuItem[] = [
    {
      icon: 'pi pi-instagram',
      command: () => {
        window.open('https://instagram.com', '_blank');
      }
    },
    {
      icon: 'pi pi-whatsapp',
      command: () => {
        window.open('https://wa.me/', '_blank');
      }
    }
  ];
}
