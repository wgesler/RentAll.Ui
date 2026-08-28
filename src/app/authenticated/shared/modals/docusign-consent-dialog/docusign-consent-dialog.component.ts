import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';

export interface DocuSignConsentDialogData {
  consentUrl: string;
}

@Component({
  selector: 'app-docusign-consent-dialog',
  standalone: true,
  imports: [MaterialModule],
  templateUrl: './docusign-consent-dialog.component.html',
  styleUrl: './docusign-consent-dialog.component.scss'
})
export class DocuSignConsentDialogComponent {
  data = inject<DocuSignConsentDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<DocuSignConsentDialogComponent>);

  openConsentPage(): void {
    window.open(this.data.consentUrl, '_blank', 'noopener,noreferrer');
  }

  close(): void {
    this.dialogRef.close();
  }
}
