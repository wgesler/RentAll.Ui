import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export interface PropertyCodeDialogResult {
  code: string;
}

@Component({
  standalone: true,
  selector: 'app-property-code-dialog',
  imports: [MaterialModule, FormsModule],
  templateUrl: './property-code-dialog.component.html',
  styleUrl: './property-code-dialog.component.scss'
})
export class PropertyCodeDialogComponent {
  code = '';

  constructor(private dialogRef: MatDialogRef<PropertyCodeDialogComponent, PropertyCodeDialogResult | undefined>) {}

  get canConfirm(): boolean {
    return this.code.trim().length > 0;
  }

  onConfirm(): void {
    if (!this.canConfirm) {
      return;
    }
    this.dialogRef.close({ code: this.code.trim().toUpperCase() });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onEnterKey(event: Event): void {
    if (!this.canConfirm) {
      return;
    }
    event.preventDefault();
    this.onConfirm();
  }
}
