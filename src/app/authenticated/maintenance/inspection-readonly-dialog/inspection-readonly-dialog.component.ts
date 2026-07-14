import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { InspectionComponent } from '../inspection/inspection.component';
import { InspectionReadonlyDialogData } from './inspection-readonly-dialog-data';

@Component({
  standalone: true,
  selector: 'app-inspection-readonly-dialog',
  imports: [CommonModule, MaterialModule, InspectionComponent],
  templateUrl: './inspection-readonly-dialog.component.html',
  styleUrl: './inspection-readonly-dialog.component.scss'
})
export class InspectionReadonlyDialogComponent {
  data = inject<InspectionReadonlyDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject(MatDialogRef<InspectionReadonlyDialogComponent>);

  close(): void {
    this.dialogRef.close();
  }
}
