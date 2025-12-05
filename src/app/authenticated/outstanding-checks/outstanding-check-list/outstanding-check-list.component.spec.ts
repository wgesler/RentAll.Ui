import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OutstandingCheckListComponent } from './outstanding-check-list.component';

describe('OutstandingCheckListComponent', () => {
  let component: OutstandingCheckListComponent;
  let fixture: ComponentFixture<OutstandingCheckListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OutstandingCheckListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OutstandingCheckListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
