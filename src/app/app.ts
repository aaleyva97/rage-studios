import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Topbar } from './shared/components/topbar/topbar';
import { Footer } from './shared/components/footer/footer';
import { SocialSpeedDial } from './shared/components/social-speed-dial/social-speed-dial';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ButtonModule, ToastModule, Topbar, SocialSpeedDial],
  providers: [MessageService],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'rage-studios';
}