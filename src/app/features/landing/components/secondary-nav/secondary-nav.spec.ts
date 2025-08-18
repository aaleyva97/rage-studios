import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecondaryNav } from './secondary-nav';

describe('SecondaryNav', () => {
  let component: SecondaryNav;
  let fixture: ComponentFixture<SecondaryNav>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecondaryNav]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecondaryNav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
