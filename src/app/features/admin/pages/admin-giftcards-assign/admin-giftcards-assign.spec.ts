import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminGiftcardsAssign } from './admin-giftcards-assign';

describe('AdminGiftcardsAssign', () => {
  let component: AdminGiftcardsAssign;
  let fixture: ComponentFixture<AdminGiftcardsAssign>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminGiftcardsAssign]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminGiftcardsAssign);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
