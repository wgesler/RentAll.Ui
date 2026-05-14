import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export interface RentalQuotePropertyOption {
  propertyId: string;
  propertyCode: string;
}

export interface RentalQuotePropertySelectDialogData {
  options: RentalQuotePropertyOption[];
  selectedPropertyIds: string[];
}

@Component({
  standalone: true,
  selector: 'app-rental-quote-property-select-dialog',
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="flex flex-col rental-quote-dialog-wrap">
      <div class="flex flex-1 justify-between items-center bg-slate-200 rounded-t-lg p-3">
        <span class="text-2xl items-center flex gap-2 ml-1">
          <mat-icon color="primary">request_quote</mat-icon>
          Select Property Codes
        </span>
      </div>

      <mat-dialog-content class="flex-shrink-0 w-full rental-quote-dialog-content p-4">
        <div class="flex flex-col gap-2 max-h-80 overflow-auto">
          @for (item of data.options; track item.propertyId) {
            <mat-checkbox
              [checked]="isSelected(item.propertyId)"
              (change)="onToggle(item.propertyId, $event.checked)">
              {{ item.propertyCode }}
            </mat-checkbox>
          }
        </div>
      </mat-dialog-content>

      <mat-divider class="flex-shrink-0 w-full"></mat-divider>

      <div class="flex flex-1 justify-end gap-3 p-3">
        <button mat-raised-button type="button" color="accent" (click)="cancel()">
          Cancel
        </button>
        <button mat-raised-button color="primary" type="button" [disabled]="selectedPropertyIds.size === 0" (click)="confirm()">
          OK
        </button>
      </div>
    </div>
  `,
  styles: [`
    .rental-quote-dialog-wrap {
      min-width: min(100%, 24rem);
      box-sizing: border-box;
    }

    .rental-quote-dialog-content {
      min-height: 12rem;
    }
  `]
})
export class RentalQuotePropertySelectDialogComponent {
  selectedPropertyIds = new Set<string>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: RentalQuotePropertySelectDialogData,
    private dialogRef: MatDialogRef<RentalQuotePropertySelectDialogComponent, string[]>
  ) {
    this.selectedPropertyIds = new Set((data.selectedPropertyIds || []).map(propertyId => String(propertyId || '').trim()).filter(propertyId => propertyId !== ''));
  }

  isSelected(propertyId: string): boolean {
    return this.selectedPropertyIds.has(String(propertyId || '').trim());
  }

  onToggle(propertyId: string, checked: boolean): void {
    const normalizedPropertyId = String(propertyId || '').trim();
    if (!normalizedPropertyId) {
      return;
    }
    if (checked) {
      this.selectedPropertyIds.add(normalizedPropertyId);
      return;
    }
    this.selectedPropertyIds.delete(normalizedPropertyId);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    this.dialogRef.close(Array.from(this.selectedPropertyIds));
  }
}
