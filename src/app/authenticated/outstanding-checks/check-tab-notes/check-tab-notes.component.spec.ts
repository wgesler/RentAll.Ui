import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckTabNotesComponent } from './check-tab-notes.component';

describe('CheckTabNotesComponent', () => {
  let component: CheckTabNotesComponent;
  let fixture: ComponentFixture<CheckTabNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckTabNotesComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CheckTabNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
