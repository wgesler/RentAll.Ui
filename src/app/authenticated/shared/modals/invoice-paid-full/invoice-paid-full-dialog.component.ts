
import { Component, OnInit, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { InvoicePaidFullDialogData } from '../../models/dialog.model';

@Component({
    standalone: true,
    selector: 'app-invoice-paid-full-dialog',
    imports: [MaterialModule],
    templateUrl: './invoice-paid-full-dialog.component.html',
    styleUrl: './invoice-paid-full-dialog.component.scss'
})
export class InvoicePaidFullDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<InvoicePaidFullDialogComponent>);
  private data = inject<InvoicePaidFullDialogData>(MAT_DIALOG_DATA);

  ngOnInit(): void {
  }

  close(): void {
    this.dialogRef.close();
  }
}
