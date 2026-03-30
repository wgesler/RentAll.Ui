import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

@Component({
  standalone: true,
  selector: 'app-missing-count-dialog',
  imports: [MaterialModule, ReactiveFormsModule],
  template: `
    <div class="flex flex-row flex-wrap">
      <div class="flex flex-1 justify-between items-center bg-slate-200 rounded-t-lg p-3 w-full">
        <span class="text-2xl items-center flex gap-2 ml-1">
          <mat-icon color="warn">warning</mat-icon>
          Count Required
        </span>
      </div>
      <mat-dialog-content class="flex-shrink-0 w-full pt-4">
        <p>Please enter the number identified.</p>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Count</mat-label>
          <input matInput cdkFocusInitial type="number" min="1" step="1" [formControl]="countControl" />
          @if (countControl.invalid && countControl.touched) {
            <mat-error>Enter a whole number greater than 0.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-divider class="flex-shrink-0 w-full" />
      <div class="flex flex-1 justify-end gap-3 p-3 w-full">
        <button mat-raised-button color="accent" (click)="dialogRef.close(null)">
          Cancel
        </button>
        <button mat-raised-button color="primary" [disabled]="countControl.invalid" (click)="confirm()">
          OK
        </button>
      </div>
    </div>
  `
})
export class MissingCountDialogComponent {
  countControl = new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]);

  constructor(public dialogRef: MatDialogRef<MissingCountDialogComponent>) {}

  confirm(): void {
    if (this.countControl.invalid) {
      this.countControl.markAsTouched();
      return;
    }
    this.dialogRef.close(this.countControl.value);
  }
}
