import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountDashboard } from './account-dashboard';

describe('AccountDashboard', () => {
  let component: AccountDashboard;
  let fixture: ComponentFixture<AccountDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
