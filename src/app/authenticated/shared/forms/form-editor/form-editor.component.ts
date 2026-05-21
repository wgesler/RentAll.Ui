import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DynamicFormEditorComponent } from '../../../owners/dynamic-form-editor/dynamic-form-editor.component';

@Component({
  standalone: true,
  selector: 'app-shared-form-editor',
  imports: [CommonModule, DynamicFormEditorComponent],
  template: `
    <app-dynamic-form-editor
      [formName]="formName"
      [formKey]="formKey"
      [ownerLeadId]="ownerLeadId"
      [officeId]="officeId"
      [propertyId]="propertyId"
      [templateHtml]="templateHtml"
      [templateAssetPath]="templateAssetPath"
      [tokenContextType]="tokenContextType"
      (viewRequested)="viewRequested.emit($event)">
    </app-dynamic-form-editor>
  `
})
export class SharedFormEditorComponent {
  @Input() formName = '';
  @Input() formKey = '';
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  @Input() templateHtml: string | null = null;
  @Input() templateAssetPath: string | null = null;
  @Input() tokenContextType = 'owner';
  @Output() viewRequested = new EventEmitter<string>();
}
