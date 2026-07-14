import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { DEFAULT_RECONCILE_VISIBLE_COLUMNS, RECONCILE_COLUMN_HEADERS, RECONCILE_CONFIGURABLE_COLUMN_ORDER, RECONCILE_DIALOG_COLUMN_ORDER, ReconcileColumnKey, ReconcileColumnsDialogData, ReconcileColumnsDialogResult } from '../../models/reconcile.model';

@Component({
  standalone: true,
  selector: 'app-reconcile-columns-dialog',
  imports: [MaterialModule, FormsModule],
  templateUrl: './reconcile-columns-dialog.component.html',
  styleUrl: './reconcile-columns-dialog.component.scss'
})
export class ReconcileColumnsDialogComponent {
  private dialogRef = inject<MatDialogRef<ReconcileColumnsDialogComponent, ReconcileColumnsDialogResult | undefined>>(MatDialogRef);

  readonly columnOptions = RECONCILE_DIALOG_COLUMN_ORDER.map(key => ({
    key,
    label: RECONCILE_COLUMN_HEADERS[key]
  }));

  paymentsSelected = new Set<ReconcileColumnKey>(DEFAULT_RECONCILE_VISIBLE_COLUMNS);
  depositsSelected = new Set<ReconcileColumnKey>(DEFAULT_RECONCILE_VISIBLE_COLUMNS);

  constructor() {
    const data = inject<ReconcileColumnsDialogData>(MAT_DIALOG_DATA);

    this.paymentsSelected = new Set(this.normalizeSelectedColumns(data.paymentsVisibleColumns));
    this.depositsSelected = new Set(this.normalizeSelectedColumns(data.depositsVisibleColumns));
  }

  //#region Reconcile Columns Dialog
  onConfirm(): void {
    this.dialogRef.close({
      paymentsVisibleColumns: RECONCILE_CONFIGURABLE_COLUMN_ORDER.filter(key => this.paymentsSelected.has(key)),
      depositsVisibleColumns: RECONCILE_CONFIGURABLE_COLUMN_ORDER.filter(key => this.depositsSelected.has(key))
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
  //#endregion

  //#region Utility Methods
  isPaymentsColumnSelected(key: ReconcileColumnKey): boolean {
    return this.paymentsSelected.has(key);
  }

  isDepositsColumnSelected(key: ReconcileColumnKey): boolean {
    return this.depositsSelected.has(key);
  }

  onPaymentsColumnChange(key: ReconcileColumnKey, checked: boolean): void {
    if (checked) {
      this.paymentsSelected.add(key);
    } else {
      this.paymentsSelected.delete(key);
    }
  }

  onDepositsColumnChange(key: ReconcileColumnKey, checked: boolean): void {
    if (checked) {
      this.depositsSelected.add(key);
    } else {
      this.depositsSelected.delete(key);
    }
  }

  private normalizeSelectedColumns(columns: ReconcileColumnKey[]): ReconcileColumnKey[] {
    const validColumns = RECONCILE_CONFIGURABLE_COLUMN_ORDER.filter(key => columns.includes(key));
    return validColumns.length > 0 ? validColumns : [...DEFAULT_RECONCILE_VISIBLE_COLUMNS];
  }
  //#endregion
}
