import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminGiftcardsNavigation } from './admin-giftcards-navigation';

describe('AdminGiftcardsNavigation', () => {
  let component: AdminGiftcardsNavigation;
  let fixture: ComponentFixture<AdminGiftcardsNavigation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminGiftcardsNavigation]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminGiftcardsNavigation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
