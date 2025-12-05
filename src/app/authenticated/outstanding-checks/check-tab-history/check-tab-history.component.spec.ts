import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckTabHistoryComponent } from './check-tab-history.component';

describe('CheckTabHistoryComponent', () => {
  let component: CheckTabHistoryComponent;
  let fixture: ComponentFixture<CheckTabHistoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckTabHistoryComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CheckTabHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
