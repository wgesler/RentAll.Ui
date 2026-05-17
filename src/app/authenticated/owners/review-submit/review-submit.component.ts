import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MaterialModule } from '../../../material.module';

@Component({
  standalone: true,
  selector: 'app-review-submit',
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="owner-shell-placeholder dbg-band-main">
      <p>Review & Submit will be added next.</p>
    </div>
  `,
  styleUrl: '../owner-shell/owner-shell.component.scss'
})
export class ReviewSubmitComponent {}
