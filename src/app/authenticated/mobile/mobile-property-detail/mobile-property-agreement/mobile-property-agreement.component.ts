import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MaterialModule } from '../../../../material.module';
import { SearchableSelectComponent } from '../../../shared/searchable-select/searchable-select.component';
import { PropertyAgreementComponent } from '../../../properties/property-agreement/property-agreement.component';

@Component({
  standalone: true,
  selector: 'app-mobile-property-agreement',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, SearchableSelectComponent],
  templateUrl: './mobile-property-agreement.component.html',
  styleUrl: './mobile-property-agreement.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobilePropertyAgreementComponent extends PropertyAgreementComponent {
  @Output() saveRequested = new EventEmitter<void>();
}
