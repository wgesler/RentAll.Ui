import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { FormatterService } from '../../../../services/formatter-service';

export interface ApplyCreditToInvoiceDialogData {
  creditAmount: number;
}

@Component({
  selector: 'app-apply-credit-to-invoice-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './apply-credit-to-invoice-dialog.component.html',
  styleUrl: './apply-credit-to-invoice-dialog.component.scss'
})
export class ApplyCreditToInvoiceDialogComponent implements OnInit {
  creditAmount: number = 0;
  
  constructor(
    public dialogRef: MatDialogRef<ApplyCreditToInvoiceDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplyCreditToInvoiceDialogData,
    public formatter: FormatterService
  ) {}
  
  ngOnInit(): void {
    this.creditAmount = this.data.creditAmount || 0;
  }
  
  cancel(): void {
    this.dialogRef.close(false);
  }
  
  apply(): void {
    this.dialogRef.close(true);
  }
}
