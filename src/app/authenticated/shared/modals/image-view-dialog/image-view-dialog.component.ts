import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MaterialModule } from '../../../../material.module';
import { ImageViewDialogData } from './image-view-dialog-data';

@Component({
  standalone: true,
  selector: 'app-image-view-dialog',
  imports: [CommonModule, MaterialModule, DragDropModule],
  templateUrl: './image-view-dialog.component.html',
  styleUrl: './image-view-dialog.component.scss'
})
export class ImageViewDialogComponent implements OnInit, OnDestroy {
  zoomScale = 1;
  readonly minZoom = 0.5;
  readonly maxZoom = 4;
  readonly zoomStep = 0.25;
  pdfViewerSrc: SafeResourceUrl | null = null;
  gallerySources: string[] = [];
  currentIndex = 0;
  private pdfObjectUrl: string | null = null;

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
    if (this.isPdf) {
      this.updatePdfViewerSource();
    }
  }

  zoomOut(): void {
    this.zoomScale = Math.max(this.minZoom, this.zoomScale - this.zoomStep);
    if (this.isPdf) {
      this.updatePdfViewerSource();
    }
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
      this.releasePdfObjectUrl();
      this.pdfViewerSrc = null;
      return;
    }

    const src = this.currentImageSrc || '';
    const pdfSource = this.getPdfRenderableSource(src);
    const zoomedPdfSrc = this.withPdfZoom(pdfSource, Math.round(this.zoomScale * 100));
    this.pdfViewerSrc = zoomedPdfSrc
      ? this.sanitizer.bypassSecurityTrustResourceUrl(zoomedPdfSrc)
      : null;
  }

  private getPdfRenderableSource(src: string): string {
    const base = String(src || '').trim();
    if (!base) {
      return '';
    }
    if (!base.startsWith('data:')) {
      return base;
    }
    this.releasePdfObjectUrl();
    const blob = this.dataUrlToBlob(base);
    this.pdfObjectUrl = URL.createObjectURL(blob);
    return this.pdfObjectUrl;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64 = ''] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/pdf';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  private releasePdfObjectUrl(): void {
    if (this.pdfObjectUrl) {
      URL.revokeObjectURL(this.pdfObjectUrl);
      this.pdfObjectUrl = null;
    }
  }

  private withPdfZoom(src: string, zoomPercent: number): string {
    const base = String(src || '').trim();
    if (!base) {
      return '';
    }
    const sanitizedZoom = Math.max(50, Math.min(400, Number(zoomPercent) || 100));
    const hashIndex = base.indexOf('#');
    const sourceWithoutHash = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
    return `${sourceWithoutHash}#zoom=${sanitizedZoom}`;
  }

  close(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.releasePdfObjectUrl();
  }
}
