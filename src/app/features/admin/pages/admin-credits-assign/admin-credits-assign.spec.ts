import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCreditsAssign } from './admin-credits-assign';

describe('AdminCreditsAssign', () => {
  let component: AdminCreditsAssign;
  let fixture: ComponentFixture<AdminCreditsAssign>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCreditsAssign]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminCreditsAssign);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
