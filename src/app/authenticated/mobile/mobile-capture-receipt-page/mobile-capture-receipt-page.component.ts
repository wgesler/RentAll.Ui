import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { ImageOptimizationFailedError, UtilityService } from '../../../services/utility.service';
import { RECEIPT_COMPANY_PROPERTY_ID, ReceiptExtractResponse, isReceiptCompanyPropertyId } from '../../maintenance/models/receipt.model';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { MobileCaptureReceiptDraftService } from '../mobile-capture-receipt-draft.service';
import { MobileNavTab, getMobileNavItem } from '../mobile-nav';

type CaptureReceiptOfficeOption = {
  officeId: number;
  label: string;
};

type CaptureReceiptPropertyOption = {
  propertyId: string;
  label: string;
};

@Component({
  standalone: true,
  selector: 'app-mobile-capture-receipt-page',
  imports: [MaterialModule, ReactiveFormsModule],
  templateUrl: './mobile-capture-receipt-page.component.html',
  styleUrl: './mobile-capture-receipt-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileCaptureReceiptPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private propertyService = inject(PropertyService);
  private globalSelectionService = inject(GlobalSelectionService);
  private utilityService = inject(UtilityService);
  private captureReceiptDraftService = inject(MobileCaptureReceiptDraftService);
  private receiptService = inject(ReceiptService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  readonly comparePropertyIdOption = (left: string | null | undefined, right: string | null | undefined): boolean =>
    (left || '').trim().toLowerCase() === (right || '').trim().toLowerCase();

  titleTabs: MobileNavTab[] = getMobileNavItem('maintenance')?.tabs ?? [];
  tab: MobileNavTab | null = this.titleTabs.find(item => item.path === 'capture-receipt') ?? null;
  officeOptions: CaptureReceiptOfficeOption[] = [];
  propertyOptions: CaptureReceiptPropertyOption[] = [];
  isPageReady = false;
  isCapturing = false;
  captureStatus = '';
  isAdmin = false;
  organizationId = '';

  form = this.fb.group({
    officeId: this.fb.control<number | null>(null, [Validators.required]),
    propertyId: this.fb.control<string | null>(null, [Validators.required])
  });

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    this.loadProperties();

    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      const normalizedOfficeId = Number(officeId ?? 0);
      if (!Number.isFinite(normalizedOfficeId) || normalizedOfficeId <= 0) {
        return;
      }
      if (!this.form.get('officeId')?.value) {
        this.form.patchValue({ officeId: normalizedOfficeId }, { emitEvent: false });
        this.refreshPropertyOptions(normalizedOfficeId);
      }
      this.markViewForCheck();
    });

    this.form.get('officeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.form.patchValue({ propertyId: null }, { emitEvent: false });
      this.refreshPropertyOptions(Number(officeId ?? 0));
      this.markViewForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTitleTabSelect(menuTab: MobileNavTab): void {
    if (menuTab.path === 'capture-receipt') {
      return;
    }
    void this.router.navigate(['/mobile', 'maintenance', menuTab.path]);
  }

  isTitleTabSelected(menuTab: MobileNavTab): boolean {
    return menuTab.path === 'capture-receipt';
  }

  openCapturePicker(fileInput: HTMLInputElement): void {
    if (this.isCapturing) {
      return;
    }
    fileInput.click();
  }

  async onReceiptSelected(event: Event): Promise<void> {
    const file = this.utilityService.getFirstSelectedFile(event);
    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      inputElement.value = '';
    }
    if (!file) {
      return;
    }

    this.form.markAllAsTouched();
    const officeId = Number(this.form.get('officeId')?.value ?? 0);
    const propertyId = (this.form.get('propertyId')?.value || '').trim() || null;
    if (!Number.isFinite(officeId) || officeId <= 0) {
      this.toastr.warning('Select an office before capturing a receipt.', CommonMessage.Error);
      return;
    }
    if (!propertyId) {
      this.toastr.warning('Select a property before capturing a receipt.', CommonMessage.Error);
      return;
    }
    if (!this.organizationId) {
      this.toastr.error('Organization is not available.', CommonMessage.Error);
      return;
    }

    this.isCapturing = true;
    this.captureStatus = 'Preparing receipt...';
    this.markViewForCheck();
    try {
      const payload = await this.utilityService.buildOptimizedUploadPayload(file);
      this.captureStatus = 'Reading receipt...';
      this.markViewForCheck();

      let extraction: ReceiptExtractResponse | null = null;
      try {
        extraction = await this.receiptService.extractReceipt(this.organizationId, payload.fileDetails, officeId).pipe(take(1)).toPromise() ?? null;
        const warningCount = (extraction?.warnings || []).length;
        if (warningCount > 0) {
          this.toastr.warning('Receipt read with items to review.');
        }
      } catch {
        this.toastr.warning('Receipt captured, but automatic reading is unavailable. Enter details manually.');
      }

      this.captureReceiptDraftService.setDraft({
        officeId,
        propertyId: isReceiptCompanyPropertyId(propertyId) ? RECEIPT_COMPANY_PROPERTY_ID : propertyId,
        fileDetails: payload.fileDetails,
        extraction
      });
      void this.router.navigate(['/mobile', 'maintenance', 'receipts', 'new']);
    } catch (error) {
      if (error instanceof ImageOptimizationFailedError) {
        this.toastr.error(this.utilityService.getImageCompressionFailureMessage(file.name), CommonMessage.Error);
      } else {
        this.toastr.error(`Unable to prepare ${file.name}.`, CommonMessage.Error);
      }
    } finally {
      this.isCapturing = false;
      this.captureStatus = '';
      this.markViewForCheck();
    }
  }

  private loadOffices(): void {
    if (this.isAdmin) {
      this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)).subscribe({
        next: () => {
          this.accountingOfficeService.getAllAccountingOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
            this.officeOptions = (offices || [])
              .filter(office => office.isActive !== false)
              .map(office => ({
                officeId: Number(office.officeId ?? 0),
                label: (office.name || '').trim() || `Office ${office.officeId}`
              }))
              .filter(office => Number.isFinite(office.officeId) && office.officeId > 0)
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
            this.finishPageLoad();
          });
        },
        error: () => {
          this.officeOptions = [];
          this.finishPageLoad();
        }
      });
      return;
    }

    if (!this.organizationId) {
      this.officeOptions = [];
      this.finishPageLoad();
      return;
    }

    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.officeOptions = (offices || [])
            .filter(office => office.isActive !== false)
            .map(office => ({
              officeId: Number(office.officeId ?? 0),
              label: (office.name || office.officeCode || '').trim() || `Office ${office.officeId}`
            }))
            .filter(office => Number.isFinite(office.officeId) && office.officeId > 0)
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
          this.finishPageLoad();
        });
      },
      error: () => {
        this.officeOptions = [];
        this.finishPageLoad();
      }
    });
  }

  private loadProperties(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe(properties => {
          this.refreshPropertyOptions(Number(this.form.get('officeId')?.value ?? 0), properties || []);
        });
      },
      error: () => {
        this.propertyOptions = [{ propertyId: RECEIPT_COMPANY_PROPERTY_ID, label: 'Company' }];
        this.finishPageLoad();
      }
    });
  }

  private refreshPropertyOptions(officeId: number, properties?: PropertyCodeResponse[]): void {
    const source = properties ?? this.propertyService.getAllPropertyCodesValue();
    const filtered = (source || [])
      .filter(property => !officeId || Number(property.officeId ?? 0) === officeId)
      .map(property => ({
        propertyId: (property.propertyId || '').trim(),
        label: (property.propertyCode || '').trim() || (property.propertyId || '').trim()
      }))
      .filter(property => property.propertyId.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    this.propertyOptions = [
      { propertyId: RECEIPT_COMPANY_PROPERTY_ID, label: 'Company' },
      ...filtered
    ];
    this.markViewForCheck();
  }

  private finishPageLoad(): void {
    this.isPageReady = true;
    this.markViewForCheck();
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
