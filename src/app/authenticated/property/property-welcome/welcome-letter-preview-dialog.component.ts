import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { SafeHTMLPipe } from '../../shared/pipes/safe-html';
import { DocumentExportService } from '../../../services/document-export.service';

export interface WelcomeLetterPreviewData {
  html: string;
  email?: string;
  organizationName?: string;
  tenantName?: string;
}

@Component({
  selector: 'app-welcome-letter-preview-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, MatDialogModule, SafeHTMLPipe],
  templateUrl: './welcome-letter-preview-dialog.component.html',
  styleUrls: ['./welcome-letter-preview-dialog.component.scss']
})
export class WelcomeLetterPreviewDialogComponent {
  isDownloading: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<WelcomeLetterPreviewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WelcomeLetterPreviewData,
    private documentExportService: DocumentExportService
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }

  async onDownload(): Promise<void> {
    this.isDownloading = true;
    
    try {
      // Generate filename
      const companyName = (this.data.organizationName || 'WelcomeLetter').replace(/[^a-z0-9]/gi, '_');
      const fileName = `${companyName}_WelcomeLetter_${new Date().toISOString().split('T')[0]}.pdf`;

      // Use the service to download PDF (don't pass element to use iframe like print)
      await this.documentExportService.downloadPDF(
        this.data.html,
        fileName
      );
      
      this.isDownloading = false;
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.isDownloading = false;
      alert('Error generating PDF. Please try again.');
    }
  }

  onPrint(): void {
    this.documentExportService.printHTML(this.data.html);
  }

  async onEmail(): Promise<void> {
    if (!this.data.email) {
      return;
    }

    try {
      const companyName = this.data.organizationName || 'Company';
      await this.documentExportService.emailWithPDF({
        recipientEmail: this.data.email,
        subject: 'Your Upcoming Visit',
        organizationName: this.data.organizationName,
        tenantName: this.data.tenantName,
        htmlContent: this.data.html
      });
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error generating PDF for email. Please try the Download button first, then attach it manually to your email.');
    }
  }

}

