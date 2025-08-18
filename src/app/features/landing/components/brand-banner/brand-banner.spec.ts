import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BrandBanner } from './brand-banner';

describe('BrandBanner', () => {
  let component: BrandBanner;
  let fixture: ComponentFixture<BrandBanner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandBanner]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BrandBanner);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
