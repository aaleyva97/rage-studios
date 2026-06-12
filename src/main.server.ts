// Polyfill de WebSocket para el servidor (Node < 22 no lo trae nativo).
// @supabase/realtime-js lo requiere al construir el cliente durante el
// prerender/SSR. Solo afecta al bundle de servidor; el navegador usa su
// WebSocket nativo y nunca importa 'ws'.
import WebSocketImpl from 'ws';
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocketImpl as unknown as typeof WebSocket;
}

import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

export default function bootstrapApp(context: BootstrapContext) {
  return bootstrapApplication(App, config, context);
}
