import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreditHistory } from './credit-history';

describe('CreditHistory', () => {
  let component: CreditHistory;
  let fixture: ComponentFixture<CreditHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreditHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
