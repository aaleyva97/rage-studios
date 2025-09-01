import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreditManagement } from './credit-management';

describe('CreditManagement', () => {
  let component: CreditManagement;
  let fixture: ComponentFixture<CreditManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreditManagement]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreditManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});