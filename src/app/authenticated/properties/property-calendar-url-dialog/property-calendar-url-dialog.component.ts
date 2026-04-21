import { Clipboard } from '@angular/cdk/clipboard';
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';

export interface PropertyCalendarUrlDialogData {
  propertyCode: string;
  subscriptionUrl: string | { subscriptionUrl?: string } | null | undefined;
}

@Component({
  standalone: true,
  selector: 'app-property-calendar-url-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './property-calendar-url-dialog.component.html',
  styleUrl: './property-calendar-url-dialog.component.scss'
})
export class PropertyCalendarUrlDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PropertyCalendarUrlDialogData,
    private dialogRef: MatDialogRef<PropertyCalendarUrlDialogComponent>,
    private clipboard: Clipboard,
    private toastr: ToastrService) {}

  get resolvedSubscriptionUrl(): string {
    return this.extractSubscriptionUrl(this.data.subscriptionUrl);
  }

  copyUrl(): void {
    const wasCopied = this.clipboard.copy(this.resolvedSubscriptionUrl);
    if (wasCopied) {
      this.toastr.success('Calendar URL copied to clipboard.', CommonMessage.Success);
    } else {
      this.toastr.error('Unable to copy the calendar URL.', CommonMessage.Error);
    }
  }

  extractSubscriptionUrl(value: PropertyCalendarUrlDialogData['subscriptionUrl']): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object' && typeof value.subscriptionUrl === 'string') {
      return value.subscriptionUrl;
    }

    return '';
  }

  closeDialog(): void {
    this.dialogRef.close();
  }
}

