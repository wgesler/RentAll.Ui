import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../../material.module';
import { ImageViewDialogData } from './image-view-dialog-data';

@Component({
  standalone: true,
  selector: 'app-image-view-dialog',
  imports: [CommonModule, MaterialModule],
  templateUrl: './image-view-dialog.component.html',
  styleUrl: './image-view-dialog.component.scss'
})
export class ImageViewDialogComponent {
  zoomScale = 1;
  readonly minZoom = 0.5;
  readonly maxZoom = 4;
  readonly zoomStep = 0.25;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImageViewDialogData,
    private dialogRef: MatDialogRef<ImageViewDialogComponent>
  ) {}

  zoomIn(): void {
    this.zoomScale = Math.min(this.maxZoom, this.zoomScale + this.zoomStep);
  }

  zoomOut(): void {
    this.zoomScale = Math.max(this.minZoom, this.zoomScale - this.zoomStep);
  }

  close(): void {
    this.dialogRef.close();
  }
}
