import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DynamicFormCreateComponent } from '../../../owners/dynamic-form-create/dynamic-form-create.component';

@Component({
  standalone: true,
  selector: 'app-shared-form-create',
  imports: [CommonModule, DynamicFormCreateComponent],
  template: `
    <app-dynamic-form-create
      [formName]="formName"
      [ownerLeadId]="ownerLeadId"
      [officeId]="officeId"
      [propertyId]="propertyId"
      [editedHtml]="editedHtml"
      [sourceTemplateHtml]="sourceTemplateHtml"
      (editRequested)="editRequested.emit()">
    </app-dynamic-form-create>
  `
})
export class SharedFormCreateComponent {
  @Input() formName = '';
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() editedHtml = '';
  @Input() sourceTemplateHtml = '';
  @Output() editRequested = new EventEmitter<void>();
}
