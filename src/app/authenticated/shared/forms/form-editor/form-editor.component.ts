import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { DynamicFormEditorComponent } from '../../../owners/dynamic-form-editor/dynamic-form-editor.component';
import { OwnerAuthorization } from '../../../owners/models/owner-authorization.model';
import { OwnerAgreementContext } from '../../../owners/services/owners.service';

@Component({
  standalone: true,
  selector: 'app-shared-form-editor',
  imports: [CommonModule, DynamicFormEditorComponent],
  template: `
    <app-dynamic-form-editor
      [formName]="formName"
      [formKey]="formKey"
      [token]="token"
      [ownerAuthorization]="ownerAuthorization"
      [ownerLeadId]="ownerLeadId"
      [officeId]="officeId"
      [propertyId]="propertyId"
      [templateHtml]="templateHtml"
      [templateAssetPath]="templateAssetPath"
      [restoreProcessedHtml]="restoreProcessedHtml"
      [restoreProcessedStyles]="restoreProcessedStyles"
      [tokenContextType]="tokenContextType"
      [reloadVersion]="reloadVersion"
      [sharedContext$]="sharedContext$"
      (viewRequested)="viewRequested.emit($event)">
    </app-dynamic-form-editor>
  `
})
export class SharedFormEditorComponent {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() token: string | null = null;
  @Input() ownerAuthorization: OwnerAuthorization = OwnerAuthorization.UnauthorizedOwner;
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() templateHtml: string | null = null;
  @Input() templateAssetPath: string | null = null;
  @Input() restoreProcessedHtml: string | null = null;
  @Input() restoreProcessedStyles: string | null = null;
  @Input() tokenContextType = 'owner';
  @Input() reloadVersion = 0;
  @Input() sharedContext$: Observable<OwnerAgreementContext | null> | null = null;
  @Output() viewRequested = new EventEmitter<string>();
}
