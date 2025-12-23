import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';
import { SafeHTMLPipe } from '../../shared/pipes/safe-html';

export interface WelcomeLetterPreviewData {
  html: string;
}

@Component({
  selector: 'app-welcome-letter-preview-dialog',
  standalone: true,
  imports: [CommonModule, MaterialModule, MatDialogModule, SafeHTMLPipe],
  templateUrl: './welcome-letter-preview-dialog.component.html',
  styleUrls: ['./welcome-letter-preview-dialog.component.scss']
})
export class WelcomeLetterPreviewDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<WelcomeLetterPreviewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: WelcomeLetterPreviewData
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }
}

