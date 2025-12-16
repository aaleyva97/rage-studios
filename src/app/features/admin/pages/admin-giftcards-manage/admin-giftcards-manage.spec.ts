import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminGiftcardsManage } from './admin-giftcards-manage';

describe('AdminGiftcardsManage', () => {
  let component: AdminGiftcardsManage;
  let fixture: ComponentFixture<AdminGiftcardsManage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminGiftcardsManage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminGiftcardsManage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
