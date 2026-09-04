import { Location } from '@angular/common';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';

/**
 * El alias /mi-cuenta debe arrastrar sus hijos hasta /dashboard.
 *
 * Con pathMatch: 'full' solo casaba la URL exacta, así que
 * /mi-cuenta/cambiar-contrasena —la ruta a la que aterrizaba el enlace del
 * correo de recuperación— caía en el wildcard y acababa en la home. Este
 * spec fija el contrato del redirect por prefijo con las rutas de verdad,
 * recortadas a componentes vacíos para no arrastrar guards ni lazy chunks.
 */
describe('alias /mi-cuenta', () => {
  const cases = [
    ['/mi-cuenta/cambiar-contrasena', '/dashboard/cambiar-contrasena'],
    ['/mi-cuenta/reservas', '/dashboard/reservas'],
    ['/mi-cuenta/lista-espera', '/dashboard/lista-espera'],
    ['/mi-cuenta', '/dashboard'],
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: '', children: [] },
          // La línea bajo prueba, copiada verbatim de app.routes.ts.
          { path: 'mi-cuenta', redirectTo: 'dashboard' },
          {
            path: 'dashboard',
            children: [
              { path: '', children: [] },
              { path: 'cambiar-contrasena', children: [] },
              { path: 'reservas', children: [] },
              { path: 'lista-espera', children: [] },
            ],
          },
          { path: '**', redirectTo: '' },
        ]),
      ],
    });
  });

  // El bloque de arriba prueba una copia, así que este ancla la copia al
  // original: si alguien devuelve el pathMatch o la barra de '/dashboard',
  // el spec falla aquí aunque los casos de navegación sigan en verde.
  it('está declarado como redirect relativo por prefijo en app.routes.ts', () => {
    const alias = routes.find(r => r.path === 'mi-cuenta');

    expect(alias).toBeDefined();
    expect(alias!.redirectTo).toBe('dashboard');
    expect(alias!.pathMatch).toBeUndefined();
  });

  for (const [from, to] of cases) {
    it(`lleva ${from} a ${to}`, async () => {
      const router = TestBed.inject(Router);
      const location = TestBed.inject(Location);

      await router.navigateByUrl(from);

      expect(location.path()).toBe(to);
    });
  }
});
