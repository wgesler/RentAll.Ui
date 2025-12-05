import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LetterListComponent } from './letter-list.component';

describe('LetterListComponent', () => {
  let component: LetterListComponent;
  let fixture: ComponentFixture<LetterListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LetterListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(LetterListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
