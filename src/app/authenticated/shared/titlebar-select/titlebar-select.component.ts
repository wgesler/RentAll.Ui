import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SearchableSelectComponent, SearchableSelectOption } from '../searchable-select/searchable-select.component';

@Component({
  standalone: true,
  selector: 'app-title-bar-select',
  imports: [CommonModule, SearchableSelectComponent],
  template: `
    <app-searchable-select
      [titleBarMode]="true"
      [renderInFormField]="true"
      [formFieldLabel]="label"
      [formFieldClass]="formFieldClass"
      [required]="required"
      [value]="value"
      [options]="options"
      [disabled]="disabled"
      [showInstructionOption]="showInstructionOption"
      [instructionOptionValue]="instructionOptionValue"
      [showSearchInput]="showSearchInput"
      [hideSearchHint]="hideSearchHint"
      [hideSearchText]="hideSearchText"
      [nullOptionLabel]="nullOptionLabel"
      [noResultsText]="noResultsText"
      [showError]="showError"
      [errorText]="errorText"
      (valueChange)="valueChange.emit($event)">
    </app-searchable-select>
  `
})
export class TitleBarSelectComponent {
  @Input() label = '';
  @Input() formFieldClass = '';
  @Input() value: string | number | null = null;
  @Input() options: SearchableSelectOption[] = [];
  @Input() disabled = false;
  @Input() required = false;
  @Input() showInstructionOption = true;
  @Input() instructionOptionValue: string | number | null = null;
  @Input() nullOptionLabel = 'Select';
  @Input() noResultsText = 'No matches found';
  @Input() showError = false;
  @Input() errorText = 'Required';

  // Title-bar defaults (keeps current UX preference).
  @Input() showSearchInput = true;
  @Input() hideSearchHint = true;
  @Input() hideSearchText = true;

  @Output() valueChange = new EventEmitter<string | number | null>();
}
