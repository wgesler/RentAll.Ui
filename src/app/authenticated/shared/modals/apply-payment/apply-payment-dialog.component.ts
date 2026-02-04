import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { FormsModule } from '@angular/forms';
import { CostCodesResponse } from '../../../accounting/models/cost-codes.model';
import { TransactionType } from '../../../accounting/models/accounting-enum';

export interface ApplyPaymentDialogData {
  costCodes: CostCodesResponse[];
  transactionTypes: { value: number, label: string }[];
  officeId: number;
}

@Component({
  selector: 'app-apply-payment-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule],
  templateUrl: './apply-payment-dialog.component.html',
  styleUrl: './apply-payment-dialog.component.scss'
})
export class ApplyPaymentDialogComponent implements OnInit {
  selectedCostCodeId: number | null = null;
  selectedCostCode: CostCodesResponse | null = null;
  transactionType: string = '';
  description: string = '';
  amount: number = 0;
  amountDisplay: string = '0.00';
  
  creditCostCodes: { value: number, label: string }[] = [];
  
  constructor(
    public dialogRef: MatDialogRef<ApplyPaymentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplyPaymentDialogData
  ) {}
  
  ngOnInit(): void {
    // Filter to only credit cost codes (transactionTypeId >= StartOfCredits)
    this.creditCostCodes = this.data.costCodes
      .filter(c => c.isActive && c.transactionTypeId === TransactionType.Payment)
      .map(c => ({
        value: parseInt(c.costCodeId, 10),
        label: `${c.costCode}: ${c.description}`
      }));
  }
  
  onCostCodeChange(costCodeId: number | null): void {
    this.selectedCostCodeId = costCodeId;
    if (costCodeId !== null) {
      this.selectedCostCode = this.data.costCodes.find(c => parseInt(c.costCodeId, 10) === costCodeId) || null;
      if (this.selectedCostCode) {
        const transactionType = this.data.transactionTypes.find(t => t.value === this.selectedCostCode!.transactionTypeId);
        this.transactionType = transactionType?.label || '';
        // For credit types, make amount negative
        if (this.amount > 0) {
          this.amount = -Math.abs(this.amount);
          this.amountDisplay = this.amount.toFixed(2);
        }
      }
    } else {
      this.selectedCostCode = null;
      this.transactionType = '';
    }
  }
  
  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.value;
    
    const isNegative = value.startsWith('-');
    value = value.replace(/[^0-9.]/g, '');
    
    // For credit types, automatically add negative sign
    if (this.selectedCostCode && this.selectedCostCode.transactionTypeId === TransactionType.Payment && !isNegative && value !== '') {
      value = '-' + value;
    } else if (isNegative) {
      value = '-' + value;
    }
    
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
    
    this.amountDisplay = input.value;
  }
  
  onAmountBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const isNegative = input.value.startsWith('-');
    const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
    
    if (rawValue !== '' && rawValue !== null) {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        // For credit types, always make it negative
        const finalValue = (this.selectedCostCode && this.selectedCostCode.transactionTypeId === TransactionType.Payment) 
          ? -Math.abs(parsed) 
          : (isNegative ? -parsed : parsed);
        this.amount = finalValue;
        this.amountDisplay = finalValue.toFixed(2);
        input.value = this.amountDisplay;
      } else {
        this.amount = 0;
        this.amountDisplay = '0.00';
        input.value = this.amountDisplay;
      }
    } else {
      this.amount = 0;
      this.amountDisplay = '0.00';
      input.value = this.amountDisplay;
    }
  }
  
  onAmountFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.value = this.amount.toString();
    input.select();
  }
  
  cancel(): void {
    this.dialogRef.close();
  }
  
  apply(): void {
    if (!this.selectedCostCodeId || !this.selectedCostCode) {
      return; // Should show validation error
    }
    
    // Return the payment data for the network call
    this.dialogRef.close({
      costCodeId: this.selectedCostCodeId,
      description: this.description || '',
      amount: this.amount
    });
  }
  
  get isFormValid(): boolean {
    return !!this.selectedCostCodeId && this.amount !== 0;
  }
}
