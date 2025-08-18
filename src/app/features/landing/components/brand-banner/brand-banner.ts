import { Component, signal, OnInit } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-brand-banner',
  imports: [SkeletonModule],
  templateUrl: './brand-banner.html',
  styleUrl: './brand-banner.scss'
})
export class BrandBanner implements OnInit {
  isLoading = signal(true);
  
  // Actualiza estas URLs después de subir las imágenes a Supabase
  brandImages = [
    {
      letter: 'R',
      url: 'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Branding/R.png',
      alt: 'RAGE - R'
    },
    {
      letter: 'A',
      url: 'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Branding/A.png',
      alt: 'RAGE - A'
    },
    {
      letter: 'G',
      url: 'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Branding/G.png',
      alt: 'RAGE - G'
    },
    {
      letter: 'E',
      url: 'https://qixgxmlpmploaataidnv.supabase.co/storage/v1/object/public/Branding/E.png',
      alt: 'RAGE - E'
    }
  ];
  
  ngOnInit() {
    setTimeout(() => {
      this.isLoading.set(false);
    }, 100);
  }
}
