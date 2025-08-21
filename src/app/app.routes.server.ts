import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Dynamic checkout routes should use SSR, not prerendering
  {
    path: 'checkout/:packageId',
    renderMode: RenderMode.Server
  },
  // Static checkout routes can be prerendered
  {
    path: 'checkout/success',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'checkout/cancel', 
    renderMode: RenderMode.Prerender
  },
  // Account routes with auth should use SSR for security
  {
    path: 'mi-cuenta/**',
    renderMode: RenderMode.Server
  },
  // Static routes can be prerendered (landing page, etc.)
  {
    path: '',
    renderMode: RenderMode.Prerender
  },
  // Default fallback - any other route uses SSR
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
