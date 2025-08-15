import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SocialSpeedDial } from './social-speed-dial';

describe('SocialSpeedDial', () => {
  let component: SocialSpeedDial;
  let fixture: ComponentFixture<SocialSpeedDial>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialSpeedDial]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SocialSpeedDial);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
