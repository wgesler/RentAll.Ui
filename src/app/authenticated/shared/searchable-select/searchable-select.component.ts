import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
      <mat-form-field [appearance]="formFieldAppearance" [class]="formFieldClass">
        @if (formFieldLabel) {
          <mat-label>{{ formFieldLabel }}</mat-label>
        }
        <mat-select
          [value]="value"
          [required]="required"
          [compareWith]="compareValues"
          [disabled]="disabled"
          [class]="selectClass"
          (selectionChange)="valueChange.emit($event.value)"
          (keydown)="onSelectKeydown($event)"
          (openedChange)="onOpenedChange($event)">
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
          @if (nullOptionLabel) {
            <mat-option [value]="null">{{ nullOptionLabel }}</mat-option>
          }
          @for (option of filteredOptions; track option.value) {
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
        [value]="value"
        [required]="required"
        [compareWith]="compareValues"
        [disabled]="disabled"
        [class]="selectClass"
        (selectionChange)="valueChange.emit($event.value)"
        (keydown)="onSelectKeydown($event)"
        (openedChange)="onOpenedChange($event)">
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
        @if (nullOptionLabel) {
          <mat-option [value]="null">{{ nullOptionLabel }}</mat-option>
        }
        @for (option of filteredOptions; track option.value) {
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
  @Input() formFieldAppearance: 'fill' | 'outline' = 'outline';
  @Input() showError = false;
  @Input() errorText = 'Required';
  @Output() valueChange = new EventEmitter<string | number | null>();

  searchText = '';
  isPanelOpen = false;
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
}
