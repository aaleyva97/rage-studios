import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminReservas } from './admin-reservas';

describe('AdminReservas', () => {
  let component: AdminReservas;
  let fixture: ComponentFixture<AdminReservas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminReservas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminReservas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});