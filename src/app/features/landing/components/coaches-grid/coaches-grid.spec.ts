import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CoachesGrid } from './coaches-grid';

describe('CoachesGrid', () => {
  let component: CoachesGrid;
  let fixture: ComponentFixture<CoachesGrid>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CoachesGrid]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CoachesGrid);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
