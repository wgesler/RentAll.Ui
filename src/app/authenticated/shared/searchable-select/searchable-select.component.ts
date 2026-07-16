import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormControl, FormGroupDirective, FormsModule, NgForm } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatSelect, MatSelectChange } from '@angular/material/select';
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
          #searchableSelectRef
          [value]="normalizedValue"
          [required]="required"
          [canSelectNullableOptions]="true"
          [compareWith]="compareValues"
          [errorStateMatcher]="showErrorStateMatcher"
          [attr.aria-invalid]="showError"
          [disabled]="disabled"
          class="searchable-select-control"
          [ngClass]="selectClass"
          (focusin)="onFocusIn(searchableSelectRef)"
          (selectionChange)="onSelectionChange($event)"
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
          @if (allowSearchInput && !(hideSearchHint && hideSearchText)) {
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
        #searchableSelectRef
        [value]="normalizedValue"
        [required]="required"
        [canSelectNullableOptions]="true"
        [compareWith]="compareValues"
        [errorStateMatcher]="showErrorStateMatcher"
        [attr.aria-invalid]="showError"
        [disabled]="disabled"
        class="searchable-select-control"
        [ngClass]="selectClass"
        (focusin)="onFocusIn(searchableSelectRef)"
        (selectionChange)="onSelectionChange($event)"
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
        @if (allowSearchInput && !(hideSearchHint && hideSearchText)) {
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
export class SearchableSelectComponent implements OnChanges, AfterViewInit {
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
  @Input() openOnFocus = false;
  @Input() openScrollLabelPrefix: string | null = null;
  @Input() openScrollWhenNoSelection = false;
  /** Option values that expand the list without committing a selection (panel stays open). */
  @Input() keepPanelOpenOnValues: Array<string | number | null> = [];
  @Output() valueChange = new EventEmitter<string | number | null>();
  @Output() triggerValueClick = new EventEmitter<Event>();

  @ViewChild('searchableSelectRef') private searchableSelectRef?: MatSelect;

  showErrorStateMatcher: ErrorStateMatcher = {
    isErrorState: (_control: FormControl | null, _form: FormGroupDirective | NgForm | null): boolean => this.showError
  };

  searchText = '';
  isPanelOpen = false;
  get allowSearchInput(): boolean {
    if (this.isTitleBarOfficeSelect) {
      return false;
    }
    return this.showSearchInput;
  }

  get isTitleBarOfficeSelect(): boolean {
    return this.titleBarMode && (
      this.formFieldClass.includes('titlebar-field-office')
      || this.formFieldLabel === 'Office'
    );
  }

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
    if (this.titleBarMode && this.showInstructionOption && this.nullOptionLabel) {
      if (this.value === null || this.value === undefined || this.value === '') {
        return true;
      }
    }

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
    if (!this.allowSearchInput) {
      return this.options;
    }
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
    if (opened) {
      this.scrollPanelToOpenAnchor();
    }
  }

  scrollPanelToOpenAnchor(): void {
    if (!this.openScrollWhenNoSelection || this.hasConcreteSelection) {
      return;
    }
    const anchorPrefix = String(this.openScrollLabelPrefix || '').trim().toLowerCase();
    if (!anchorPrefix) {
      return;
    }
    setTimeout(() => {
      const panelElement = this.searchableSelectRef?.panel?.nativeElement as HTMLElement | undefined;
      if (!panelElement) {
        return;
      }
      const optionElements = Array.from(panelElement.querySelectorAll('.mat-mdc-option')) as HTMLElement[];
      const matchingOption = optionElements.find(option => {
        const label = String(option.textContent || '').trim().toLowerCase();
        return label.startsWith(anchorPrefix);
      });
      matchingOption?.scrollIntoView({ block: 'center' });
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.syncSelectValueFromInput();
    }
  }

  ngAfterViewInit(): void {
    this.syncSelectValueFromInput();
  }

  onSelectionChange(event: MatSelectChange): void {
    const value = event.value as string | number | null;
    const keepOpen = this.keepPanelOpenOnValues.some(optionValue => this.compareValues(optionValue, value));

    if (keepOpen) {
      const boundValue = this.normalizedValue;
      event.source.value = boundValue;
      this.valueChange.emit(value);
      setTimeout(() => {
        if (!event.source.panelOpen) {
          event.source.open();
        }
      }, 0);
      return;
    }

    this.valueChange.emit(value);
  }

syncSelectValueFromInput(): void {
    setTimeout(() => {
      const select = this.searchableSelectRef;
      if (!select) {
        return;
      }
      const boundValue = this.normalizedValue;
      if (!this.compareValues(select.value, boundValue)) {
        select.value = boundValue;
      }
    });
  }

  onFocusIn(select: MatSelect): void {
    if (!this.openOnFocus || this.disabled || this.isPanelOpen) {
      return;
    }
    setTimeout(() => {
      if (!this.isPanelOpen) {
        select.open();
      }
    }, 0);
  }

  onSelectKeydown(event: KeyboardEvent): void {
    if (!this.allowSearchInput || !this.isPanelOpen || event.ctrlKey || event.metaKey || event.altKey) {
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
