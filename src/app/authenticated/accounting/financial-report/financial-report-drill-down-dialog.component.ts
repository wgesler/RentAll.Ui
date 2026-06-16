import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { JournalEntryLineListDisplay } from '../models/journal-entry.model';

export interface FinancialReportDrillDownDialogData {
  title: string;
  subtitle: string;
  lines: JournalEntryLineListDisplay[];
}

@Component({
  standalone: true,
  selector: 'app-financial-report-drill-down-dialog',
  imports: [MaterialModule, DataTableComponent],
  templateUrl: './financial-report-drill-down-dialog.component.html',
  styleUrl: './financial-report-drill-down-dialog.component.scss'
})
export class FinancialReportDrillDownDialogComponent {
  displayedColumns: ColumnSet = {
    transactionDate: { displayAs: 'Date', maxWidth: '11ch', wrap: false },
    journalEntryCode: { displayAs: 'Entry No', maxWidth: '12ch', sortType: 'natural', wrap: false },
    source: { displayAs: 'Source', wrap: true },
    propertyCode: { displayAs: 'Property', wrap: true },
    reservationCode: { displayAs: 'Reservation', wrap: true },
    contactName: { displayAs: 'Contact', wrap: true },
    account: { displayAs: 'Account', wrap: true },
    description: { displayAs: 'Description', wrap: true },
    debit: { displayAs: 'Debit', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false, wrap: false },
    credit: { displayAs: 'Credit', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false, wrap: false },
    balance: { displayAs: 'Balance', maxWidth: '12ch', alignment: 'right', headerAlignment: 'right', sort: false, wrap: false }
  };

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: FinancialReportDrillDownDialogData,
    private dialogRef: MatDialogRef<FinancialReportDrillDownDialogComponent>
  ) {
  }

  close(): void {
    this.dialogRef.close();
  }
}
