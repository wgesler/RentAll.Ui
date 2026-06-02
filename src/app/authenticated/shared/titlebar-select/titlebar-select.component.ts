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
      [showSearchInput]="effectiveShowSearchInput"
      [hideSearchHint]="hideSearchHint"
      [hideSearchText]="hideSearchText"
      [nullOptionLabel]="nullOptionLabel"
      [noResultsText]="noResultsText"
      [showError]="showError"
      [errorText]="errorText"
      [labelRequiredAsterisk]="labelRequiredAsterisk"
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
  @Input() labelRequiredAsterisk = false;

  // Title-bar defaults: show filter row and visible typed text.
  @Input() showSearchInput = true;
  @Input() hideSearchHint = false;
  @Input() hideSearchText = false;

  get effectiveShowSearchInput(): boolean {
    if (this.formFieldClass.includes('titlebar-field-office') || this.label === 'Office') {
      return false;
    }
    return this.showSearchInput;
  }

  @Output() valueChange = new EventEmitter<string | number | null>();
}
