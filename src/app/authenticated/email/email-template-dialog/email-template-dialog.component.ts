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
  canSaveForOffice: boolean;
}

export interface EmailTemplateDialogResult {
  subject: string;
  body: string;
  scope: 'organization' | 'office';
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

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onSave(scope: 'organization' | 'office'): void {
    if (scope === 'office' && !this.data.canSaveForOffice) {
      return;
    }
    if ((this.data.hasSubject && !this.subject.trim()) || !this.body.trim()) {
      return;
    }
    this.dialogRef.close({
      subject: this.subject,
      body: this.body,
      scope
    });
  }
}
