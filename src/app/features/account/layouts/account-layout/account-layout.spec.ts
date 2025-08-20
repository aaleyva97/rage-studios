import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountLayout } from './account-layout';

describe('AccountLayout', () => {
  let component: AccountLayout;
  let fixture: ComponentFixture<AccountLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountLayout]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountLayout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
