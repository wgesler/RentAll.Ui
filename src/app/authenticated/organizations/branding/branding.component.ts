import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { BrandingService } from '../../../services/branding.service';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { BrandingRequest, BrandingResponse } from '../models/branding.model';
import { OrganizationService } from '../services/organization.service';

@Component({
  standalone: true,
  selector: 'app-branding',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './branding.component.html',
  styleUrl: './branding.component.scss'
})
export class BrandingComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Input() organizationId: string | null = null;

  form: FormGroup;
  fileName: string | null = null;
  fileDetails: FileDetails | null = null;
  logoPath: string | null = null;
  hasNewFileUpload: boolean = false;
  collapsedFileName: string | null = null;
  collapsedFileDetails: FileDetails | null = null;
  collapsedLogoPath: string | null = null;
  hasNewCollapsedFileUpload: boolean = false;
  isSubmitting: boolean = false;
  isServiceError: boolean = false;
  isUploadingLogo: boolean = false;
  isUploadingCollapsedLogo: boolean = false;
  logoImageTargetMinBytes = 150 * 1024;
  logoImageTargetMaxBytes = 500 * 1024;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['branding']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  private readonly defaultBranding: BrandingResponse = {
    organizationId: '',
    primaryColor: '#3f51b5',
    accentColor: '#ae1f66',
    headerBackgroundColor: '#3f51b5',
    headerTextColor: '#ffffff',
      logoPath: null,
      collapsedLogoPath: null
  };

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private organizationService: OrganizationService,
    private brandingService: BrandingService,
    private utilityService: UtilityService
  ) {}

  //#region Branding
  ngOnInit(): void {
    this.buildForm();
    this.loadBranding();
  }

  loadBranding(): void {
    this.organizationService.getBranding().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'branding');
    })).subscribe({
      next: (response: BrandingResponse) => {
        this.applyResponse(response);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = err.status !== 404;
        this.applyResponse(this.defaultBranding);
      }
    });
  }

  saveBranding(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const userOrganizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    const requestOrganizationId = (this.organizationId || userOrganizationId || '').trim();
    if (!requestOrganizationId) {
      this.toastr.error('Organization context is required', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const brandingRequest: BrandingRequest = {
      organizationId: requestOrganizationId,
      primaryColor: this.normalizeHexColor(formValue.primaryColor),
      accentColor: this.normalizeHexColor(formValue.accentColor),
      headerBackgroundColor: this.normalizeHexColor(formValue.headerBackgroundColor),
      headerTextColor: this.normalizeHexColor(formValue.headerTextColor),
      fileDetails: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? this.fileDetails : undefined,
      logoPath: (this.hasNewFileUpload || (this.fileDetails && this.fileDetails.file)) ? undefined : this.logoPath,
      collapsedFileDetails: (this.hasNewCollapsedFileUpload || (this.collapsedFileDetails && this.collapsedFileDetails.file)) ? this.collapsedFileDetails : undefined,
      collapsedLogoPath: (this.hasNewCollapsedFileUpload || (this.collapsedFileDetails && this.collapsedFileDetails.file)) ? undefined : this.collapsedLogoPath
    };

    this.organizationService.updateBranding(brandingRequest).pipe(take(1), finalize(() => {
      this.isSubmitting = false;
    })).subscribe({
      next: (response: BrandingResponse) => {
        this.applyResponse(response);
        this.brandingService.loadBrandingForCurrentOrganization().pipe(take(1)).subscribe();
        this.toastr.success('Branding updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      primaryColor: new FormControl(this.defaultBranding.primaryColor, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      accentColor: new FormControl(this.defaultBranding.accentColor, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      headerBackgroundColor: new FormControl(this.defaultBranding.headerBackgroundColor, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      headerTextColor: new FormControl(this.defaultBranding.headerTextColor, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]),
      fileUpload: new FormControl('', {
        validators: [],
        asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif'], ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'], 2000000, true)]
      }),
      collapsedFileUpload: new FormControl('', {
        validators: [],
        asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif'], ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif'], 2000000, true)]
      })
    });
  }

  onColorPickerChange(event: Event, controlName: string): void {
    const input = event.target as HTMLInputElement;
    this.form.patchValue({ [controlName]: this.normalizeHexColor(input.value) }, { emitEvent: true });
  }

  onHexInputBlur(controlName: string): void {
    const value = this.form.get(controlName)?.value;
    this.form.patchValue({ [controlName]: this.normalizeHexColor(value) }, { emitEvent: true });
  }
  //#endregion

  //#region Logo Methods
  async upload(event: Event): Promise<void> {
    this.isUploadingLogo = true;
    await this.uploadLogoFile(event, false);
  }

  async uploadCollapsed(event: Event): Promise<void> {
    this.isUploadingCollapsedLogo = true;
    await this.uploadLogoFile(event, true);
  }

  private async uploadLogoFile(event: Event, isCollapsed: boolean): Promise<void> {
    const uploadControlName = isCollapsed ? 'collapsedFileUpload' : 'fileUpload';
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      if (isCollapsed) {
        this.isUploadingCollapsedLogo = false;
      } else {
        this.isUploadingLogo = false;
      }
      return;
    }

    try {
      const file = input.files[0];
      let uploadFile: File = file;
      let uploadDataUrl = '';
      let uploadContentType = file.type;

      try {
        const optimizedBlob = await this.optimizeUploadedLogoImage(file);
        uploadDataUrl = await this.blobToDataUrl(optimizedBlob);
        uploadContentType = optimizedBlob.type || file.type || 'image/jpeg';
        const optimizedName = uploadContentType === 'image/jpeg'
          ? file.name.replace(/\.[^/.]+$/, '.jpg')
          : file.name;
        uploadFile = new File([optimizedBlob], optimizedName, { type: uploadContentType || file.type || 'image/jpeg' });
      } catch {
        uploadDataUrl = await this.fileToDataUrl(file);
      }

      const base64String = uploadDataUrl.includes(',') ? uploadDataUrl.split(',')[1] : uploadDataUrl;
      if (isCollapsed) {
        this.collapsedFileName = uploadFile.name;
        this.form.patchValue({ collapsedFileUpload: uploadFile });
        this.form.get(uploadControlName)?.updateValueAndValidity();
        this.collapsedLogoPath = null;
        this.hasNewCollapsedFileUpload = true;
        this.collapsedFileDetails = { contentType: uploadContentType, fileName: uploadFile.name, file: base64String, dataUrl: uploadDataUrl } as FileDetails;
      } else {
        this.fileName = uploadFile.name;
        this.form.patchValue({ fileUpload: uploadFile });
        this.form.get(uploadControlName)?.updateValueAndValidity();
        this.logoPath = null;
        this.hasNewFileUpload = true;
        this.fileDetails = { contentType: uploadContentType, fileName: uploadFile.name, file: base64String, dataUrl: uploadDataUrl } as FileDetails;
      }
    } finally {
      if (isCollapsed) {
        this.isUploadingCollapsedLogo = false;
      } else {
        this.isUploadingLogo = false;
      }
    }
  }

  removeLogo(): void {
    this.logoPath = null;
    this.fileDetails = null;
    this.fileName = null;
    this.hasNewFileUpload = false;
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload')?.updateValueAndValidity();
  }

  removeCollapsedLogo(): void {
    this.collapsedLogoPath = null;
    this.collapsedFileDetails = null;
    this.collapsedFileName = null;
    this.hasNewCollapsedFileUpload = false;
    this.form.patchValue({ collapsedFileUpload: null });
    this.form.get('collapsedFileUpload')?.updateValueAndValidity();
  }
  //#endregion

  //#region Utility Methods
  applyResponse(response: BrandingResponse): void {
    const normalized = {
      primaryColor: this.normalizeHexColor(response.primaryColor || this.defaultBranding.primaryColor),
      accentColor: this.normalizeHexColor(response.accentColor || this.defaultBranding.accentColor),
      headerBackgroundColor: this.normalizeHexColor(response.headerBackgroundColor || this.defaultBranding.headerBackgroundColor),
      headerTextColor: this.normalizeHexColor(response.headerTextColor || this.defaultBranding.headerTextColor)
    };

    this.form.patchValue(normalized, { emitEvent: false });
    this.logoPath = response.logoPath?.trim() || null;
    this.fileDetails = response.fileDetails && response.fileDetails.file ? response.fileDetails : null;
    if (this.fileDetails && !this.fileDetails.dataUrl) {
      const contentType = this.fileDetails.contentType || 'image/png';
      this.fileDetails.dataUrl = `data:${contentType};base64,${this.fileDetails.file}`;
    }
    this.fileName = this.fileDetails?.fileName || null;
    this.hasNewFileUpload = false;

    this.collapsedLogoPath = response.collapsedLogoPath?.trim() || null;
    this.collapsedFileDetails = response.collapsedFileDetails && response.collapsedFileDetails.file ? response.collapsedFileDetails : null;
    if (this.collapsedFileDetails && !this.collapsedFileDetails.dataUrl) {
      const contentType = this.collapsedFileDetails.contentType || 'image/png';
      this.collapsedFileDetails.dataUrl = `data:${contentType};base64,${this.collapsedFileDetails.file}`;
    }
    this.collapsedFileName = this.collapsedFileDetails?.fileName || null;
    this.hasNewCollapsedFileUpload = false;
  }

  normalizeHexColor(value: string): string {
    if (!value) {
      return '#000000';
    }
    const trimmed = value.trim();
    const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    return withHash.length === 7 ? withHash.toLowerCase() : '#000000';
  }

  private async optimizeUploadedLogoImage(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/') && !this.isHeicLikeFile(file)) {
      return file;
    }

    const normalizedFile = await this.convertHeicToJpegIfNeeded(file);
    if (normalizedFile.size <= this.logoImageTargetMaxBytes) {
      return normalizedFile;
    }

    const image = await this.loadImageFromFile(normalizedFile);
    const largestSide = Math.max(image.width, image.height);
    const initialScale = largestSide > 1800 ? 1800 / largestSide : 1;

    let scale = initialScale;
    let quality = 0.82;
    let bestBlob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const nextBlob = await this.renderCompressedJpegBlob(image, scale, quality);
      if (!nextBlob) {
        break;
      }
      bestBlob = nextBlob;

      if (nextBlob.size <= this.logoImageTargetMaxBytes && nextBlob.size >= this.logoImageTargetMinBytes) {
        break;
      }

      if (nextBlob.size > this.logoImageTargetMaxBytes) {
        if (quality > 0.5) {
          quality = Math.max(0.5, quality - 0.1);
        } else {
          scale *= 0.85;
          quality = 0.78;
        }
        continue;
      }

      break;
    }

    if (!bestBlob || bestBlob.size >= normalizedFile.size) {
      return normalizedFile;
    }

    return bestBlob;
  }

  private isHeicLikeFile(file: File): boolean {
    const fileType = (file.type || '').toLowerCase();
    const fileName = (file.name || '').toLowerCase();
    return fileType.includes('heic') || fileType.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif');
  }

  private async convertHeicToJpegIfNeeded(file: File): Promise<File> {
    if (!this.isHeicLikeFile(file)) {
      return file;
    }

    const heic2anyModule = await import('heic2any');
    const heic2any = heic2anyModule.default;
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });

    const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
    if (!(convertedBlob instanceof Blob)) {
      throw new Error('Unsupported HEIC conversion result.');
    }

    const convertedName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([convertedBlob], convertedName, { type: 'image/jpeg' });
  }

  private loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unable to decode image'));
      };
      image.src = objectUrl;
    });
  }

  private renderCompressedJpegBlob(image: HTMLImageElement, scale: number, quality: number): Promise<Blob | null> {
    return new Promise(resolve => {
      const targetWidth = Math.max(1, Math.floor(image.width * scale));
      const targetHeight = Math.max(1, Math.floor(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    });
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read blob as data URL'));
      reader.readAsDataURL(blob);
    });
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('Unable to read file'));
      reader.readAsDataURL(file);
    });
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
