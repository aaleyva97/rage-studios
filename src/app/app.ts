import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Topbar } from './shared/components/topbar/topbar';
import { SocialSpeedDial } from './shared/components/social-speed-dial/social-speed-dial';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, Topbar, SocialSpeedDial],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'rage-studios';
}
