import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';

export interface NumberLogViewDialogData {
  title: string;
  text: string;
}

/** Shows exactly the text the log's Copy action puts on the clipboard for a Number row, with its own Copy button. */
@Component({
  standalone: true,
  selector: 'app-number-log-view-dialog',
  templateUrl: './number-log-view-dialog.component.html',
  styleUrl: './number-log-view-dialog.component.scss',
  imports: [MaterialModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NumberLogViewDialogComponent {
  protected dialogRef = inject<MatDialogRef<NumberLogViewDialogComponent>>(MatDialogRef);
  protected data = inject<NumberLogViewDialogData>(MAT_DIALOG_DATA);
  private toastr = inject(ToastrService);

  //#region Number-Log-View-Dialog
  copy(): void {
    navigator.clipboard.writeText(this.data.text).then(
      () => this.toastr.success('EasyPay request / response copied.'),
      () => this.toastr.error('Could not copy to the clipboard.')
    );
  }

  close(): void {
    this.dialogRef.close();
  }
  //#endregion
}
