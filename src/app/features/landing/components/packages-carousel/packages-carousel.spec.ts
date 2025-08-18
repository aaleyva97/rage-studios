import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackagesCarousel } from './packages-carousel';

describe('PackagesCarousel', () => {
  let component: PackagesCarousel;
  let fixture: ComponentFixture<PackagesCarousel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackagesCarousel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PackagesCarousel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
