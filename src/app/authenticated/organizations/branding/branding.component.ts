import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
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

  @Input() organizationId: string | null = null;
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private brandingService = inject(BrandingService);
  private utilityService = inject(UtilityService);

  form!: FormGroup;
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

  async uploadLogoFile(event: Event, isCollapsed: boolean): Promise<void> {
    const uploadControlName = isCollapsed ? 'collapsedFileUpload' : 'fileUpload';
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      if (isCollapsed) {
        this.isUploadingCollapsedLogo = false;
      } else {
        this.isUploadingLogo = false;
      }
      return;
    }

    try {
      const payload = await this.utilityService.buildOptimizedUploadPayload(file);
      if (isCollapsed) {
        this.collapsedFileName = payload.fileDetails.fileName;
        this.form.patchValue({ collapsedFileUpload: payload.uploadFile });
        this.form.get(uploadControlName)?.updateValueAndValidity();
        this.collapsedLogoPath = null;
        this.hasNewCollapsedFileUpload = true;
        this.collapsedFileDetails = payload.fileDetails;
      } else {
        this.fileName = payload.fileDetails.fileName;
        this.form.patchValue({ fileUpload: payload.uploadFile });
        this.form.get(uploadControlName)?.updateValueAndValidity();
        this.logoPath = null;
        this.hasNewFileUpload = true;
        this.fileDetails = payload.fileDetails;
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

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}
