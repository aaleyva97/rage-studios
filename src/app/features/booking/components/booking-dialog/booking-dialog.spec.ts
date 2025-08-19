import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BookingDialog } from './booking-dialog';

describe('BookingDialog', () => {
  let component: BookingDialog;
  let fixture: ComponentFixture<BookingDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BookingDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
