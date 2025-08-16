import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionsGrid } from './sessions-grid';

describe('SessionsGrid', () => {
  let component: SessionsGrid;
  let fixture: ComponentFixture<SessionsGrid>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionsGrid]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SessionsGrid);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
