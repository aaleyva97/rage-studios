import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCreditsDeduct } from './admin-credits-deduct';

describe('AdminCreditsDeduct', () => {
  let component: AdminCreditsDeduct;
  let fixture: ComponentFixture<AdminCreditsDeduct>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCreditsDeduct]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminCreditsDeduct);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
