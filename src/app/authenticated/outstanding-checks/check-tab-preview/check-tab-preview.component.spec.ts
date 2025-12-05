import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CheckTabPreviewComponent } from './check-tab-preview.component';

describe('CheckTabPreviewComponent', () => {
  let component: CheckTabPreviewComponent;
  let fixture: ComponentFixture<CheckTabPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CheckTabPreviewComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CheckTabPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
