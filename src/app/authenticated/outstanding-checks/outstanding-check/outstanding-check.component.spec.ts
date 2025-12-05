import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutstandingCheckComponent } from './outstanding-check.component';

describe('OutstandingCheckComponent', () => {
  let component: OutstandingCheckComponent;
  let fixture: ComponentFixture<OutstandingCheckComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutstandingCheckComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OutstandingCheckComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
