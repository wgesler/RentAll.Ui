import { Component, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export function isWordDocumentFile(file: { name?: string | null; type?: string | null }): boolean {
  const name = (file.name || '').trim().toLowerCase();
  const type = (file.type || '').trim().toLowerCase();
  return name.endsWith('.doc') || name.endsWith('.docx') || type.includes('msword') || type.includes('wordprocessingml');
}

@Component({
  standalone: true,
  selector: 'app-receipt-word-file-dialog',
  imports: [MaterialModule],
  template: `
    <div class="flex flex-col">
      <div class="flex flex-1 justify-between items-center bg-slate-200 rounded-t-lg p-3">
        <span class="text-2xl items-center flex gap-2 ml-1">
          <mat-icon color="primary">description</mat-icon>
          Receipt
        </span>
      </div>
      <mat-dialog-content class="flex-shrink-0 w-full p-6">
        <p class="text-base">Please convert this to a PDF before uploading.</p>
      </mat-dialog-content>
      <mat-divider class="flex-shrink-0 w-full"></mat-divider>
      <div class="flex flex-1 justify-end gap-3 p-3">
        <button mat-raised-button color="primary" type="button" (click)="close()" cdkFocusInitial>OK</button>
      </div>
    </div>
  `
})
export class ReceiptWordFileDialogComponent {
  private dialogRef = inject(MatDialogRef<ReceiptWordFileDialogComponent>);

  close(): void {
    this.dialogRef.close();
  }
}
