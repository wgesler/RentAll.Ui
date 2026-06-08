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
      [formKey]="formKey"
      [ownerLeadId]="ownerLeadId"
      [officeId]="officeId"
      [propertyId]="propertyId"
      [sourceTemplateHtml]="sourceTemplateHtml"
      (editRequested)="editRequested.emit($event)"
      (displayStateUpdated)="displayStateUpdated.emit($event)">
    </app-dynamic-form-create>
  `
})
export class SharedFormCreateComponent {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() sourceTemplateHtml = '';
  @Output() editRequested = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
  @Output() displayStateUpdated = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
}
