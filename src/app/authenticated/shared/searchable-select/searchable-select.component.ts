import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, FormGroupDirective, FormsModule, NgForm } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MaterialModule } from '../../../material.module';

export interface SearchableSelectOption<TValue = string | number | null> {
  value: TValue;
  label: string;
}

@Component({
  standalone: true,
  selector: 'app-searchable-select',
  imports: [CommonModule, FormsModule, MaterialModule],
  template: `
    @if (renderInFormField) {
      <mat-form-field
        class="searchable-select-field"
        [appearance]="formFieldAppearance"
        [ngClass]="formFieldClass"
        [class.mat-form-field-invalid]="showError"
        [class.mat-mdc-form-field-invalid]="showError"
        [class.searchable-invalid]="showError"
        [class.searchable-title-bar-select]="titleBarMode">
        @if (formFieldLabel) {
          <mat-label>
            {{ formFieldLabel }}
            @if (labelRequiredAsterisk) {
              <span
                class="titlebar-label-required-asterisk"
                [class.titlebar-label-required-asterisk--error]="showError"
                aria-hidden="true">*</span>
            }
          </mat-label>
        }
        <mat-select
          [value]="normalizedValue"
          [required]="required"
          [canSelectNullableOptions]="true"
          [compareWith]="compareValues"
          [errorStateMatcher]="showErrorStateMatcher"
          [attr.aria-invalid]="showError"
          [disabled]="disabled"
          class="searchable-select-control"
          [ngClass]="selectClass"
          (selectionChange)="valueChange.emit($event.value)"
          (keydown)="onSelectKeydown($event)"
          (openedChange)="onOpenedChange($event)">
          <mat-select-trigger>
            <span
              class="searchable-trigger-value"
              [class.searchable-trigger-value--placeholder]="!hasConcreteSelection"
              [class.searchable-trigger-value--clickable]="triggerValueClickable && hasConcreteSelection"
              (mousedown)="onTriggerValueMouseDown($event)"
              (click)="onTriggerValueClick($event)">
              {{ selectedOptionLabel || nullOptionLabel }}
            </span>
          </mat-select-trigger>
          @if (showSearchInput && !(hideSearchHint && hideSearchText)) {
            <mat-option>
              <input
                matInput
                [placeholder]="hideSearchHint ? '' : searchPlaceholder"
                [style.color]="hideSearchText ? 'transparent' : null"
                [style.caret-color]="hideSearchText ? 'transparent' : null"
                [(ngModel)]="searchText"
                [ngModelOptions]="{ standalone: true }"
                (click)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()" />
            </mat-option>
          }
          @if (showInstructionOption && nullOptionLabel) {
            <mat-option [value]="instructionOptionValue">{{ nullOptionLabel }}</mat-option>
          }
          @for (option of filteredOptions; track trackOption($index, option)) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
          @if (filteredOptions.length === 0) {
            <mat-option [disabled]="true">{{ noResultsText }}</mat-option>
          }
        </mat-select>
        @if (showError) {
          <mat-error>{{ errorText }}</mat-error>
        }
      </mat-form-field>
    } @else {
      <mat-select
        [value]="normalizedValue"
        [required]="required"
        [canSelectNullableOptions]="true"
        [compareWith]="compareValues"
        [errorStateMatcher]="showErrorStateMatcher"
        [attr.aria-invalid]="showError"
        [disabled]="disabled"
        class="searchable-select-control"
        [ngClass]="selectClass"
        (selectionChange)="valueChange.emit($event.value)"
        (keydown)="onSelectKeydown($event)"
        (openedChange)="onOpenedChange($event)">
        <mat-select-trigger>
          <span
            class="searchable-trigger-value"
            [class.searchable-trigger-value--placeholder]="!hasConcreteSelection"
            [class.searchable-trigger-value--clickable]="triggerValueClickable && hasConcreteSelection"
            (mousedown)="onTriggerValueMouseDown($event)"
            (click)="onTriggerValueClick($event)">
            {{ selectedOptionLabel || nullOptionLabel }}
          </span>
        </mat-select-trigger>
        @if (showSearchInput && !(hideSearchHint && hideSearchText)) {
          <mat-option>
            <input
              matInput
              [placeholder]="hideSearchHint ? '' : searchPlaceholder"
              [style.color]="hideSearchText ? 'transparent' : null"
              [style.caret-color]="hideSearchText ? 'transparent' : null"
              [(ngModel)]="searchText"
              [ngModelOptions]="{ standalone: true }"
              (click)="$event.stopPropagation()"
              (keydown)="$event.stopPropagation()" />
          </mat-option>
        }
        @if (showInstructionOption && nullOptionLabel) {
          <mat-option [value]="instructionOptionValue">{{ nullOptionLabel }}</mat-option>
        }
        @for (option of filteredOptions; track trackOption($index, option)) {
          <mat-option [value]="option.value">{{ option.label }}</mat-option>
        }
        @if (filteredOptions.length === 0) {
          <mat-option [disabled]="true">{{ noResultsText }}</mat-option>
        }
      </mat-select>
    }
  `
})
export class SearchableSelectComponent {
  @Input() options: SearchableSelectOption[] = [];
  @Input() value: string | number | null = null;
  @Input() disabled = false;
  @Input() required = false;
  @Input() showInstructionOption = true;
  @Input() instructionOptionValue: string | number | null = null;
  @Input() nullOptionLabel = 'Select';
  @Input() noResultsText = 'No matches found';
  @Input() showSearchInput = false;
  @Input() searchPlaceholder = 'Type to filter...';
  @Input() hideSearchHint = false;
  @Input() hideSearchText = false;
  @Input() resetSearchOnOpen = true;
  @Input() selectClass = '';
  @Input() renderInFormField = false;
  @Input() formFieldLabel = '';
  @Input() formFieldClass = '';
  @Input() titleBarMode = false;
  @Input() formFieldAppearance: 'fill' | 'outline' = 'outline';
  @Input() showError = false;
  @Input() errorText = 'Required';
  @Input() labelRequiredAsterisk = false;
  @Input() triggerValueClickable = false;
  @Output() valueChange = new EventEmitter<string | number | null>();
  @Output() triggerValueClick = new EventEmitter<Event>();

  showErrorStateMatcher: ErrorStateMatcher = {
    isErrorState: (_control: FormControl | null, _form: FormGroupDirective | NgForm | null): boolean => this.showError
  };

  searchText = '';
  isPanelOpen = false;
  get normalizedValue(): string | number | null {
    if (!this.showInstructionOption || !this.nullOptionLabel) {
      return this.value;
    }
    if (this.value === undefined || this.value === '' || this.value === null) {
      return this.instructionOptionValue;
    }
    return this.value;
  }

  get hasConcreteSelection(): boolean {
    if (this.normalizedValue === null || this.normalizedValue === undefined || this.normalizedValue === '') {
      return false;
    }
    if (this.showInstructionOption && this.compareValues(this.normalizedValue, this.instructionOptionValue)) {
      return false;
    }
    return true;
  }

  get selectedOptionLabel(): string {
    const selected = this.options.find(option => this.compareValues(option.value, this.normalizedValue));
    return selected?.label ?? '';
  }
  compareValues = (left: string | number | null, right: string | number | null): boolean => {
    if (left === right) {
      return true;
    }
    if (left === null || left === undefined || right === null || right === undefined) {
      return false;
    }
    return String(left) === String(right);
  };

  get filteredOptions(): SearchableSelectOption[] {
    const search = this.searchText.trim().toLowerCase();
    if (!search) {
      return this.options;
    }
    return this.options.filter(option => option.label.toLowerCase().includes(search));
  }

  onOpenedChange(opened: boolean): void {
    this.isPanelOpen = opened;
    if (opened && this.resetSearchOnOpen) {
      this.searchText = '';
    }
  }

  onSelectKeydown(event: KeyboardEvent): void {
    if (!this.isPanelOpen || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === 'Backspace') {
      this.searchText = this.searchText.slice(0, -1);
      event.preventDefault();
      return;
    }
    if (event.key.length === 1) {
      this.searchText += event.key;
      event.preventDefault();
      return;
    }
  }

  onTriggerValueMouseDown(event: MouseEvent): void {
    if (!this.triggerValueClickable || !this.hasConcreteSelection) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  onTriggerValueClick(event: MouseEvent): void {
    if (!this.triggerValueClickable || !this.hasConcreteSelection) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.triggerValueClick.emit(event);
  }

  trackOption(index: number, option: SearchableSelectOption): string {
    return `${option.value ?? 'null'}::${option.label ?? ''}::${index}`;
  }
}
