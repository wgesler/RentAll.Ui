
import { Component, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';

export interface InvoicePaidFullDialogData {
  // No data needed for this simple informational dialog
}

@Component({
    standalone: true,
    selector: 'app-invoice-paid-full-dialog',
    imports: [MaterialModule],
    templateUrl: './invoice-paid-full-dialog.component.html',
    styleUrl: './invoice-paid-full-dialog.component.scss'
})
export class InvoicePaidFullDialogComponent implements OnInit {
  dialogRef = inject(MatDialogRef<InvoicePaidFullDialogComponent>);
  data = inject<InvoicePaidFullDialogData>(MAT_DIALOG_DATA);

  ngOnInit(): void {
  }

  close(): void {
    this.dialogRef.close();
  }
}
