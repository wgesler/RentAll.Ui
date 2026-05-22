import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MaterialModule } from '../../../../material.module';
import { ImageViewDialogData } from './image-view-dialog-data';

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
  pdfViewerSrc: SafeResourceUrl | null = null;
  gallerySources: string[] = [];
  currentIndex = 0;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImageViewDialogData,
    private sanitizer: DomSanitizer,
    private dialogRef: MatDialogRef<ImageViewDialogComponent>
  ) {}

  ngOnInit(): void {
    this.gallerySources = (this.data?.imageSources || []).filter(source => !!source);
    if (this.gallerySources.length === 0 && this.data?.imageSrc) {
      this.gallerySources = [this.data.imageSrc];
    }

    const requestedIndex = Number(this.data?.initialIndex ?? 0);
    this.currentIndex = Number.isFinite(requestedIndex)
      ? Math.max(0, Math.min(requestedIndex, Math.max(0, this.gallerySources.length - 1)))
      : 0;

    this.updatePdfViewerSource();
  }

  zoomIn(): void {
    this.zoomScale = Math.min(this.maxZoom, this.zoomScale + this.zoomStep);
  }

  zoomOut(): void {
    this.zoomScale = Math.max(this.minZoom, this.zoomScale - this.zoomStep);
  }

  get isPdf(): boolean {
    const source = (this.currentImageSrc || '').trim().toLowerCase();
    return source.startsWith('data:application/pdf;') || source.endsWith('.pdf');
  }

  get currentImageSrc(): string {
    if (this.gallerySources.length === 0) {
      return this.data?.imageSrc || '';
    }

    return this.gallerySources[this.currentIndex] || '';
  }

  get canNavigate(): boolean {
    return this.gallerySources.length > 1;
  }

  goPrevious(): void {
    if (!this.canNavigate) {
      return;
    }

    this.currentIndex = this.currentIndex === 0
      ? this.gallerySources.length - 1
      : this.currentIndex - 1;
    this.zoomScale = 1;
    this.updatePdfViewerSource();
  }

  goNext(): void {
    if (!this.canNavigate) {
      return;
    }

    this.currentIndex = this.currentIndex === this.gallerySources.length - 1
      ? 0
      : this.currentIndex + 1;
    this.zoomScale = 1;
    this.updatePdfViewerSource();
  }

  updatePdfViewerSource(): void {
    if (!this.isPdf) {
      this.pdfViewerSrc = null;
      return;
    }

    const src = this.currentImageSrc || '';
    this.pdfViewerSrc = src
      ? this.sanitizer.bypassSecurityTrustResourceUrl(src)
      : null;
  }

  close(): void {
    this.dialogRef.close();
  }
}
