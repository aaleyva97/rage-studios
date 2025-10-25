import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCreditsNavigation } from './admin-credits-navigation';

describe('AdminCreditsNavigation', () => {
  let component: AdminCreditsNavigation;
  let fixture: ComponentFixture<AdminCreditsNavigation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCreditsNavigation]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminCreditsNavigation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
