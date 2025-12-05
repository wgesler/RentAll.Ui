import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckTabDetailsComponent } from './check-tab-details.component';

describe('CheckTabDetailsComponent', () => {
  let component: CheckTabDetailsComponent;
  let fixture: ComponentFixture<CheckTabDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckTabDetailsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CheckTabDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
