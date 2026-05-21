import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaterialModule } from '../../../material.module';
import { PropertyComponent } from '../../properties/property/property.component';
import { PublicOwnerFormResponse, PublicOwnerFormSubmitRequest } from '../../leads/models/owner-form-share.model';
import { OwnerInventoryInformationRequest } from '../../leads/models/owner-inventory-information.model';
import { LeadsService } from '../../leads/services/leads.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { UtilityService } from '../../../services/utility.service';
import { FormatterService } from '../../../services/formatter-service';
import { AuthService } from '../../../services/auth.service';

export function buildPropertyInformationPatchFromResponse(response: PublicOwnerFormResponse): Partial<PublicOwnerFormSubmitRequest> {
  return {
    onSiteComplexManagementPhone: response.form?.onSiteComplexManagementPhone ?? '',
    keyCount: response.form?.keyCount ?? '',
    garageRemoteModelCode: response.form?.garageRemoteModelCode ?? '',
    storageAccessDetails: response.form?.storageAccessDetails ?? '',
    cableSupplier: response.form?.cableSupplier ?? '',
    cablePhone: response.form?.cablePhone ?? '',
    cableAccountNumber: response.form?.cableAccountNumber ?? '',
    electricSupplier: response.form?.electricSupplier ?? '',
    electricPhone: response.form?.electricPhone ?? '',
    electricAccountNumber: response.form?.electricAccountNumber ?? '',
    internetSupplier: response.form?.internetSupplier ?? '',
    internetPhone: response.form?.internetPhone ?? '',
    internetAccountNumber: response.form?.internetAccountNumber ?? '',
    fuseBoxLocation: response.form?.fuseBoxLocation ?? '',
    schoolDistrict: response.form?.schoolDistrict ?? '',
    localEmergencyContact: response.form?.localEmergencyContact ?? '',
    accessInformation: response.form?.accessInformation ?? ''
  };
}

@Component({
  standalone: true,
  selector: 'app-property-information',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule, PropertyComponent],
  templateUrl: './property-information.component.html',
  styleUrl: '../owner-shell/owner-shell.component.scss'
})
export class PropertyInformationComponent implements OnChanges, OnDestroy {
  @Input() token = '';
  @Input() ownerLeadId: number | null = null;
  @Input() selectedOfficeId: number | null = null;
  @Input() shellPropertyId = 'new';
  @Input() shellPropertyCode: string | null = null;

  ownerForm: FormGroup = this.buildForm();
  isPageReady = false;
  isSaving = false;
  publicOwnerFormSnapshot: PublicOwnerFormResponse | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property-information']));
  hasLoadStateSubscription = false;
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private leadsService: LeadsService,
    private toastr: ToastrService,
    private utilityService: UtilityService,
    private formatterService: FormatterService,
    private authService: AuthService
  ) {}

  //#region Property-Information
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['token'] || changes['ownerLeadId']) {
      this.ensureLoadStateSubscription();
      this.itemsToLoad$.next(new Set(['property-information']));
      this.loadPropertyInformation();
    }
  }

  onSaveRequested(): void {
    if (this.isSaving || !this.isPageReady) {
      return;
    }
    this.savePropertyInformation();
  }
  //#endregion

  //#region Load Data Methods
  ensureLoadStateSubscription(): void {
    if (this.hasLoadStateSubscription) {
      return;
    }
    this.hasLoadStateSubscription = true;
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
  }

  loadPropertyInformation(): void {
    this.publicOwnerFormSnapshot = null;
    this.ownerForm.reset(this.getDefaultPropertyFormValue());
    const ownerLeadId = Number(this.ownerLeadId);
    if (this.token) {
      this.leadsService.getPublicOwnerFormByToken(this.token).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property-information');
      })).subscribe({
        next: (response) => {
          this.publicOwnerFormSnapshot = response;
          this.ownerForm.patchValue(buildPropertyInformationPatchFromResponse(response));
          this.formatInventoryPhoneFields();
        },
        error: () => {
          this.toastr.error('Unable to load property information.', CommonMessage.Error);
        }
      });
      return;
    }
    if (!Number.isFinite(ownerLeadId) || ownerLeadId <= 0) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property-information');
      return;
    }
    this.leadsService.getOwnerInventoryInformationByOwnerId(ownerLeadId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property-information');
    })).subscribe({
      next: response => {
        this.ownerForm.patchValue({
          onSiteComplexManagementPhone: response?.onSiteComplexManagementPhone ?? '',
          keyCount: response?.keyCount ?? '',
          garageRemoteModelCode: response?.garageRemoteModelCode ?? '',
          storageAccessDetails: response?.storageAccessDetails ?? '',
          cableSupplier: response?.cableSupplier ?? '',
          cablePhone: response?.cablePhone ?? '',
          cableAccountNumber: response?.cableAccountNumber ?? '',
          electricSupplier: response?.electricSupplier ?? '',
          electricPhone: response?.electricPhone ?? '',
          electricAccountNumber: response?.electricAccountNumber ?? '',
          internetSupplier: response?.internetSupplier ?? '',
          internetPhone: response?.internetPhone ?? '',
          internetAccountNumber: response?.internetAccountNumber ?? '',
          fuseBoxLocation: response?.fuseBoxLocation ?? '',
          schoolDistrict: response?.schoolDistrict ?? '',
          localEmergencyContact: response?.localEmergencyContact ?? '',
          accessInformation: response?.accessInformation ?? ''
        });
        this.formatInventoryPhoneFields();
      },
      error: () => {
        // Keep defaults when no existing inventory record is found.
      }
    });
  }

  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group(this.getDefaultPropertyFormValue());
  }

  getDefaultPropertyFormValue(): Record<string, unknown> {
    return {
      onSiteComplexManagementPhone: '',
      keyCount: '',
      garageRemoteModelCode: '',
      storageAccessDetails: '',
      cableSupplier: '',
      cablePhone: '',
      cableAccountNumber: '',
      electricSupplier: '',
      electricPhone: '',
      electricAccountNumber: '',
      internetSupplier: '',
      internetPhone: '',
      internetAccountNumber: '',
      fuseBoxLocation: '',
      schoolDistrict: '',
      localEmergencyContact: '',
      accessInformation: ''
    };
  }

  savePropertyInformation(): void {
    if (!this.token && (!Number.isFinite(Number(this.ownerLeadId)) || Number(this.ownerLeadId) <= 0)) {
      return;
    }
    this.isSaving = true;
    if (this.token && this.publicOwnerFormSnapshot) {
      const raw = this.ownerForm.getRawValue() as Partial<PublicOwnerFormSubmitRequest>;
      const body: PublicOwnerFormSubmitRequest = {
        ...this.publicOwnerFormSnapshot.form,
        ...raw
      } as PublicOwnerFormSubmitRequest;
      this.leadsService.submitPublicOwnerFormByToken(this.token, body).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
        this.isSaving = false;
      })).subscribe({
        next: (response) => {
          this.publicOwnerFormSnapshot = response;
          this.ownerForm.patchValue(buildPropertyInformationPatchFromResponse(response));
          this.formatInventoryPhoneFields();
          this.toastr.success('Property information saved.', CommonMessage.Success);
        },
        error: () => {
          this.toastr.error('Unable to save property information.', CommonMessage.Error);
        }
      });
      return;
    }

    const ownerId = Number(this.ownerLeadId);
    const organizationId = String(this.authService.getUser()?.organizationId ?? '').trim();
    if (!Number.isFinite(ownerId) || ownerId <= 0 || !organizationId) {
      this.isSaving = false;
      return;
    }

    const raw = this.ownerForm.getRawValue() as Record<string, string | null | undefined>;
    const body: OwnerInventoryInformationRequest = {
      ownerId,
      organizationId,
      onSiteComplexManagementPhone: this.formatterService.stripPhoneFormatting(String(raw['onSiteComplexManagementPhone'] ?? '')),
      keyCount: String(raw['keyCount'] ?? ''),
      garageRemoteModelCode: String(raw['garageRemoteModelCode'] ?? ''),
      storageAccessDetails: String(raw['storageAccessDetails'] ?? ''),
      cableSupplier: String(raw['cableSupplier'] ?? ''),
      cablePhone: this.formatterService.stripPhoneFormatting(String(raw['cablePhone'] ?? '')),
      cableAccountNumber: String(raw['cableAccountNumber'] ?? ''),
      electricSupplier: String(raw['electricSupplier'] ?? ''),
      electricPhone: this.formatterService.stripPhoneFormatting(String(raw['electricPhone'] ?? '')),
      electricAccountNumber: String(raw['electricAccountNumber'] ?? ''),
      internetSupplier: String(raw['internetSupplier'] ?? ''),
      internetPhone: this.formatterService.stripPhoneFormatting(String(raw['internetPhone'] ?? '')),
      internetAccountNumber: String(raw['internetAccountNumber'] ?? ''),
      fuseBoxLocation: String(raw['fuseBoxLocation'] ?? ''),
      schoolDistrict: String(raw['schoolDistrict'] ?? ''),
      localEmergencyContact: String(raw['localEmergencyContact'] ?? ''),
      accessInformation: String(raw['accessInformation'] ?? ''),
      isActive: true
    };

    this.leadsService.updateOwnerInventoryInformation(body).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (response) => {
        this.ownerForm.patchValue({
          onSiteComplexManagementPhone: response?.onSiteComplexManagementPhone ?? '',
          keyCount: response?.keyCount ?? '',
          garageRemoteModelCode: response?.garageRemoteModelCode ?? '',
          storageAccessDetails: response?.storageAccessDetails ?? '',
          cableSupplier: response?.cableSupplier ?? '',
          cablePhone: response?.cablePhone ?? '',
          cableAccountNumber: response?.cableAccountNumber ?? '',
          electricSupplier: response?.electricSupplier ?? '',
          electricPhone: response?.electricPhone ?? '',
          electricAccountNumber: response?.electricAccountNumber ?? '',
          internetSupplier: response?.internetSupplier ?? '',
          internetPhone: response?.internetPhone ?? '',
          internetAccountNumber: response?.internetAccountNumber ?? '',
          fuseBoxLocation: response?.fuseBoxLocation ?? '',
          schoolDistrict: response?.schoolDistrict ?? '',
          localEmergencyContact: response?.localEmergencyContact ?? '',
          accessInformation: response?.accessInformation ?? ''
        });
        this.formatInventoryPhoneFields();
        this.toastr.success('Property information saved.', CommonMessage.Success);
      },
      error: () => {
        this.toastr.error('Unable to save property information.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Utility Methods
  onInventoryPhoneInput(
    controlName: 'onSiteComplexManagementPhone' | 'cablePhone' | 'electricPhone' | 'internetPhone',
    event: Event
  ): void {
    this.formatterService.formatPhoneInput(event, this.ownerForm.get(controlName));
  }

  formatInventoryPhoneField(controlName: 'onSiteComplexManagementPhone' | 'cablePhone' | 'electricPhone' | 'internetPhone'): void {
    this.formatterService.formatPhoneControl(this.ownerForm.get(controlName));
  }

  formatInventoryPhoneFields(): void {
    this.formatInventoryPhoneField('onSiteComplexManagementPhone');
    this.formatInventoryPhoneField('cablePhone');
    this.formatInventoryPhoneField('electricPhone');
    this.formatInventoryPhoneField('internetPhone');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
