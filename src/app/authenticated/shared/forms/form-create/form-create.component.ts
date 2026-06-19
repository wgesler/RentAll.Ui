import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { DynamicFormCreateComponent } from '../../../owners/dynamic-form-create/dynamic-form-create.component';
import { OwnerAuthorization } from '../../../owners/models/owner-authorization.model';
import { OwnerAgreementContext } from '../../../owners/services/owners.service';

@Component({
  standalone: true,
  selector: 'app-shared-form-create',
  imports: [CommonModule, DynamicFormCreateComponent],
  template: `
    <app-dynamic-form-create
      [formName]="formName"
      [formKey]="formKey"
      [token]="token"
      [ownerAuthorization]="ownerAuthorization"
      [ownerLeadId]="ownerLeadId"
      [officeId]="officeId"
      [propertyId]="propertyId"
      [sourceTemplateHtml]="sourceTemplateHtml"
      [sharedContext$]="sharedContext$"
      (editRequested)="editRequested.emit($event)"
      (displayStateUpdated)="displayStateUpdated.emit($event)">
    </app-dynamic-form-create>
  `
})
export class SharedFormCreateComponent {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() token: string | null = null;
  @Input() ownerAuthorization: OwnerAuthorization = OwnerAuthorization.UnauthorizedOwner;
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() sourceTemplateHtml = '';
  @Input() sharedContext$: Observable<OwnerAgreementContext | null> | null = null;
  @Output() editRequested = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
  @Output() displayStateUpdated = new EventEmitter<{ processedHtml: string; processedStyles: string }>();
}
