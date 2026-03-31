import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { MaterialModule } from '../../../material.module';

export type DialogIssueItemResult = {
  issueText: string;
  photoFile: File | null;
};

@Component({
  standalone: true,
  selector: 'app-dialog-issue-item',
  imports: [MaterialModule, ReactiveFormsModule],
  template: `
    <div class="flex flex-row flex-wrap">
      <div class="flex flex-1 justify-between items-center bg-slate-200 rounded-t-lg p-3 w-full">
        <span class="text-2xl items-center flex gap-2 ml-1">
          <mat-icon color="warn">report_problem</mat-icon>
          Report Issue
        </span>
      </div>
      <mat-dialog-content class="flex-shrink-0 w-full pt-4">
        <p>Issue details are required. Photo is optional.</p>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Issue</mat-label>
          <input matInput cdkFocusInitial [formControl]="issueControl" placeholder="Describe issue" />
          @if (issueControl.invalid && issueControl.touched) {
            <mat-error>Issue text is required.</mat-error>
          }
        </mat-form-field>

        <div class="flex justify-start image-input items-center mb-4">
          @if (photoPreviewUrl) {
            <img class="object-contain max-w-xs max-h-44" alt="Issue Photo" title="Issue Photo" [src]="photoPreviewUrl" />
            <div class="flex flex-col gap-2 ml-4">
              @if (selectedPhotoName) {
                <span class="text-sm font-semibold">{{ selectedPhotoName }}</span>
              }
              <div class="flex flex-col gap-2">
                <button class="myfilebrowser" type="button" color="primary" mat-raised-button (click)="openPhotoPicker()">
                  Add Photo
                </button>
                <button type="button" color="accent" mat-raised-button (click)="deletePhoto()" class="w-full">
                  Delete Photo
                </button>
              </div>
            </div>
          } @else {
            <button class="myfilebrowser mb-3 mr-2" type="button" color="primary" mat-raised-button (click)="openPhotoPicker()">
              Add Photo
            </button>
          }
        </div>
        <p class="mb-2">Allowed File Types (jpg, png, or gif image types)</p>
        <input
          #photoInput
          class="hidden"
          type="file"
          accept="image/*"
          capture="environment"
          (change)="onPhotoSelected($event)" />
      </mat-dialog-content>
      <mat-divider class="flex-shrink-0 w-full" />
      <div class="flex flex-1 justify-end gap-3 p-3 w-full">
        <button mat-raised-button color="accent" (click)="cancel()">
          Cancel
        </button>
        <button mat-raised-button color="primary" [disabled]="!canConfirm" (click)="confirm()">
          OK
        </button>
      </div>
    </div>
  `
})
export class DialogIssueItemComponent {
  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;
  issueControl = new FormControl<string>('', [Validators.required]);
  photoFile: File | null = null;
  selectedPhotoName = '';
  photoPreviewUrl = '';
  photoTouched = false;

  constructor(public dialogRef: MatDialogRef<DialogIssueItemComponent, DialogIssueItemResult | null>) {}

  get canConfirm(): boolean {
    const issueText = (this.issueControl.value || '').trim();
    return issueText.length > 0;
  }

  openPhotoPicker(): void {
    this.photoInput?.nativeElement.click();
    this.photoTouched = true;
  }

  onPhotoSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files && target.files.length > 0 ? target.files[0] : null;
    this.photoFile = file;
    this.selectedPhotoName = file?.name ?? '';
    this.photoTouched = true;
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.photoPreviewUrl = typeof reader.result === 'string' ? reader.result : '';
      };
      reader.readAsDataURL(file);
    } else {
      this.photoPreviewUrl = '';
    }
    target.value = '';
  }

  deletePhoto(): void {
    this.photoFile = null;
    this.selectedPhotoName = '';
    this.photoPreviewUrl = '';
    this.photoTouched = true;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  confirm(): void {
    const issueText = (this.issueControl.value || '').trim();
    if (!issueText) {
      this.issueControl.markAsTouched();
      return;
    }
    this.dialogRef.close({ issueText, photoFile: this.photoFile });
  }
}
