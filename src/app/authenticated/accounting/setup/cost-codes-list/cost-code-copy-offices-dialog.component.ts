import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { OfficeResponse } from '../../../organizations/models/office.model';

export interface CostCodeCopyOfficesDialogData {
  offices: OfficeResponse[];
}

@Component({
  standalone: true,
  selector: 'app-cost-code-copy-offices-dialog',
  imports: [MaterialModule, FormsModule],
  templateUrl: './cost-code-copy-offices-dialog.component.html',
  styleUrl: './cost-code-copy-offices-dialog.component.scss'
})
export class CostCodeCopyOfficesDialogComponent {
  data = inject<CostCodeCopyOfficesDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<CostCodeCopyOfficesDialogComponent, number[] | undefined>>(MatDialogRef);

  selectedOfficeIds: number[] = [];

  get canConfirm(): boolean {
    return this.selectedOfficeIds.length > 0;
  }

  onConfirm(): void {
    if (!this.canConfirm) {
      return;
    }
    this.dialogRef.close([...this.selectedOfficeIds]);
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
