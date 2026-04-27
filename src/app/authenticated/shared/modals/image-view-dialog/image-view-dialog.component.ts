import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { ImageViewDialogData } from './image-view-dialog-data';
import { PdfThumbnailService } from '../../../../services/pdf-thumbnail.service';

@Component({
  standalone: true,
  selector: 'app-image-view-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './image-view-dialog.component.html',
  styleUrl: './image-view-dialog.component.scss'
})
export class ImageViewDialogComponent implements OnInit {
  zoomScale = 1;
  readonly minZoom = 0.5;
  readonly maxZoom = 4;
  readonly zoomStep = 0.25;
  pdfThumbnailSrc: string | null = null;
  isLoadingPdfThumbnail = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImageViewDialogData,
    private pdfThumbnailService: PdfThumbnailService,
    private dialogRef: MatDialogRef<ImageViewDialogComponent>
  ) {}

  async ngOnInit(): Promise<void> {
    if (!this.isPdf) {
      return;
    }
    this.isLoadingPdfThumbnail = true;
    this.pdfThumbnailSrc = await this.pdfThumbnailService.getFirstPageDataUrl(this.data?.imageSrc || null, 1200);
    this.isLoadingPdfThumbnail = false;
  }

  zoomIn(): void {
    this.zoomScale = Math.min(this.maxZoom, this.zoomScale + this.zoomStep);
  }

  zoomOut(): void {
    this.zoomScale = Math.max(this.minZoom, this.zoomScale - this.zoomStep);
  }

  get isPdf(): boolean {
    const source = (this.data?.imageSrc || '').trim().toLowerCase();
    return source.startsWith('data:application/pdf;') || source.endsWith('.pdf');
  }

  close(): void {
    this.dialogRef.close();
  }
}
