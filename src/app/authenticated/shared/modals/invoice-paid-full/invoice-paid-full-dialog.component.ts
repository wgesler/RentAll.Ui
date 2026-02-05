import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';

export interface InvoicePaidFullDialogData {
  // No data needed for this simple informational dialog
}

@Component({
  selector: 'app-invoice-paid-full-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './invoice-paid-full-dialog.component.html',
  styleUrl: './invoice-paid-full-dialog.component.scss'
})
export class InvoicePaidFullDialogComponent implements OnInit {
  
  constructor(
    public dialogRef: MatDialogRef<InvoicePaidFullDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InvoicePaidFullDialogData
  ) {}
  
  ngOnInit(): void {
  }
  
  close(): void {
    this.dialogRef.close();
  }
}
