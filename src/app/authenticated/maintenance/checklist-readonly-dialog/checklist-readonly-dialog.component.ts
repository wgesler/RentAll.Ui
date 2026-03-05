import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse } from '../../properties/models/property.model';
import { ChecklistComponent } from '../checklist/checklist.component';
import { ChecklistReadonlyDialogData } from './checklist-readonly-dialog-data';

@Component({
  standalone: true,
  selector: 'app-checklist-readonly-dialog',
  imports: [CommonModule, MaterialModule, ChecklistComponent],
  templateUrl: './checklist-readonly-dialog.component.html',
  styleUrl: './checklist-readonly-dialog.component.scss'
})
export class ChecklistReadonlyDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ChecklistReadonlyDialogData,
    private dialogRef: MatDialogRef<ChecklistReadonlyDialogComponent>
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
