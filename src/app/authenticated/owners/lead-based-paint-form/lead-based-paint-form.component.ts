import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { OwnerAgreementFormComponent } from '../owner-agreement-form/owner-agreement-form.component';

@Component({
  standalone: true,
  selector: 'app-lead-based-paint-form',
  imports: [CommonModule, OwnerAgreementFormComponent],
  templateUrl: './lead-based-paint-form.component.html',
  styleUrl: './lead-based-paint-form.component.scss'
})
export class LeadBasedPaintFormComponent {
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
}
