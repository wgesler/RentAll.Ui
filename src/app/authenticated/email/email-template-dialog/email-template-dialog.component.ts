import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export interface EmailTemplateDialogData {
  name: string;
  subject: string;
  body: string;
  hasSubject: boolean;
}

export interface EmailTemplateDialogResult {
  subject: string;
  body: string;
}

@Component({
  standalone: true,
  selector: 'app-email-template-dialog',
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './email-template-dialog.component.html',
  styleUrl: './email-template-dialog.component.scss'
})
export class EmailTemplateDialogComponent {
  data = inject<EmailTemplateDialogData>(MAT_DIALOG_DATA);
  private dialogRef = inject<MatDialogRef<EmailTemplateDialogComponent, EmailTemplateDialogResult | undefined>>(MatDialogRef);

  subject = this.data.subject || '';
  body = this.data.body || '';

  get canSave(): boolean {
    return !!this.body.trim() && (!this.data.hasSubject || !!this.subject.trim());
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onSave(): void {
    if (!this.canSave) {
      return;
    }
    this.dialogRef.close({
      subject: this.subject,
      body: this.body
    });
  }
}
