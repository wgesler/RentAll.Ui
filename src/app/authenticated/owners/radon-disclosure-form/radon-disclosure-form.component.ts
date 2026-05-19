import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { OwnerAgreementFormComponent } from '../owner-agreement-form/owner-agreement-form.component';

@Component({
  standalone: true,
  selector: 'app-radon-disclosure-form',
  imports: [CommonModule, OwnerAgreementFormComponent],
  templateUrl: './radon-disclosure-form.component.html',
  styleUrl: './radon-disclosure-form.component.scss'
})
export class RadonDisclosureFormComponent {
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
}
