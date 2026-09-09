import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, map, of, switchMap, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { MappingService } from '../../../services/mapping.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { OrganizationType } from '../../organizations/models/organization-enum';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { UserGroups } from '../../users/models/user-enums';
import { MobileListField, MobileListFieldOption } from '../mobile-list-table/mobile-list.model';
import { MobilePropertyAgreementComponent } from './mobile-property-agreement/mobile-property-agreement.component';
import { MobilePropertyContactListComponent } from './mobile-property-contact-list/mobile-property-contact-list.component';

@Component({
  standalone: true,
  selector: 'app-mobile-property-detail',
  imports: [MaterialModule, FormsModule, NgTemplateOutlet, MobilePropertyContactListComponent, MobilePropertyAgreementComponent],
  templateUrl: './mobile-property-detail.component.html',
  styleUrl: './mobile-property-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobilePropertyDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() propertyId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() propertyCodeChange = new EventEmitter<string>();
  @ViewChild('descriptionTextarea') descriptionTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('notesTextarea') notesTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild(MobilePropertyAgreementComponent) propertyAgreementSection?: MobilePropertyAgreementComponent;
  private propertyService = inject(PropertyService);
  private mixedMappingService = inject(MixedMappingService);
  private mappingService = inject(MappingService);
  private commonService = inject(CommonService);
  private contactService = inject(ContactService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  isPartnerAdmin = false;
  isPartnerOrganization = false;
  property: PropertyResponse | null = null;
  fields: MobileListField[] = [];
  states: string[] = [];
  ownerOptions: MobileListFieldOption[] = [];
  vendorOptions: MobileListFieldOption[] = [];
  isPageReady = false;
  isSaving = false;
  isDirty = false;
  destroy$ = new Subject<void>();
  readonly basicPanelFieldKeys = [
    'propertyCode',
    'officeName',
    'propertyLeaseTypeId',
    'isActive',
    'availableFrom',
    'availableUntil',
    'checkInTimeId',
    'checkOutTimeId',
    'minStay',
    'maxStay',
    'propertyStyleId',
    'propertyTypeId',
    'propertyStatusId',
    'address1',
    'address2',
    'suite',
    'city',
    'state',
    'zip',
    'communityAddress',
    'unitLevel',
    'bldgNo',
    'mailbox',
    'confirmationNo',
    'neighborhood',
    'crossStreet',
    'view',
    'noticeStatusId',
    'phone',
    'latitude',
    'longitude',
    'bedrooms',
    'bathrooms',
    'accommodates',
    'squareFeet',
    'bedroomId1',
    'bedroomId2',
    'bedroomId3',
    'bedroomId4',
    'sofabed',
    'petsAllowed',
    'dogsOkay',
    'catsOkay',
    'poundLimit',
    'parking',
    'parkingNotes',
    'trashPickupId',
    'trashRemoval',
    'monthlyRate',
    'dailyRate',
    'departureFee',
    'maidServiceFee',
    'petFee',
    'externalCalendar',
    'owner1Id',
    'owner2Id',
    'owner3Id',
    'vendorId'
  ] as const;
  readonly featuresPanelFieldKeys = [
    'unfurnished',
    'heating',
    'ac',
    'elevator',
    'security',
    'gated',
    'alarmCode',
    'mailRoomCode',
    'bldgMstrCode',
    'unitMstrCode',
    'gateCode',
    'trashCode',
    'storageCode',
    'kitchen',
    'oven',
    'refrigerator',
    'microwave',
    'dishwasher',
    'washerDryerInUnit',
    'washerDryerInBldg',
    'bathtub',
    'tv',
    'cable',
    'streaming',
    'fastInternet',
    'internetNetwork',
    'internetPassword',
    'deck',
    'patio',
    'yard',
    'garden',
    'commonPool',
    'privatePool',
    'sauna',
    'jacuzzi',
    'gym',
    'amenities',
    'smoking',
    'dvd',
    'bldgTenantCode'
  ] as const;

  //#region Mobile-Property-Detail
  get isPartnerLimitedPropertyForm(): boolean {
    return this.isPartnerAdmin || this.isPartnerOrganization;
  }

  get canShowPropertyContacts(): boolean {
    return !this.isPartnerLimitedPropertyForm;
  }

  get canShowPropertyAgreement(): boolean {
    return !this.isPartnerLimitedPropertyForm && !!this.propertyId.trim();
  }

  get canManagePropertyAgreement(): boolean {
    return true;
  }

  get canViewManagementAgreement(): boolean {
    return this.authService.isInAccounting();
  }

  get sharedPropertyOfficeId(): number | null {
    const officeId = this.property?.officeId;
    return officeId == null || officeId === 0 ? null : Number(officeId);
  }

  get sharedPropertyCode(): string | null {
    const fieldValue = this.getFieldValue('propertyCode');
    if (fieldValue) {
      return fieldValue;
    }
    const code = String(this.property?.propertyCode ?? '').trim();
    return code || null;
  }

  ngOnInit(): void {
    this.isPartnerAdmin = this.authService.hasRole(UserGroups.PartnerAdmin);
    this.isPartnerOrganization = this.commonService.getOrganizationTypeId() === OrganizationType.Partner;
    this.loadContacts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId']) {
      this.getProperty();
    }
  }

  getProperty(): void {
    this.loadProperty();
  }

  updateProperty(): void {
    const propertyId = this.propertyId.trim();
    if (!propertyId || this.isSaving) {
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    this.propertyService.getPropertyByGuid(propertyId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(property => {
        const overrides = this.mappingService.mapMobilePropertyDetailOverrides(property, this.fields);
        const request = this.mixedMappingService.mapPropertyResponseToRequest(property, overrides);
        return this.propertyService.updateProperty(request).pipe(
          switchMap(response => {
            const persist$ = this.propertyAgreementSection?.persistAgreementIfDirty() ?? of(true);
            return persist$.pipe(map(ok => ({ response, ok })));
          })
        );
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: ({ response, ok }) => {
        this.property = response;
        this.propertyCodeChange.emit(response.propertyCode || '');
        this.fields = this.mapFields(response);
        this.setDirty(false);
        this.queueMultilineTextareaHeightSync();
        this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        if (!ok) {
          this.toastr.warning('Property saved, but agreement changes were not saved.', 'Agreement Not Saved', { timeOut: CommonTimeouts.Extended });
        }
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Property could not be saved.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  saveProperty(): void {
    this.updateProperty();
  }

  onFieldChange(): void {
    this.setDirty(true);
  }

  onSelectChange(field: MobileListField, value: string | string[]): void {
    if (field.multiple) {
      field.value = (Array.isArray(value) ? value : []).join(', ');
    } else {
      field.value = String(value ?? '');
    }
    this.onFieldChange();
  }

  getSelectedValues(field: MobileListField): string[] {
    return field.value ? field.value.split(',').map(value => value.trim()).filter(value => !!value) : [];
  }

  getBasicPanelFields(): MobileListField[] {
    return this.getPanelFields(this.basicPanelFieldKeys);
  }

  getFeaturesPanelFields(): MobileListField[] {
    return this.getPanelFields(this.featuresPanelFieldKeys);
  }

  getDescriptionField(): MobileListField | null {
    return this.fields.find(field => field.key === 'description') ?? null;
  }

  getNotesField(): MobileListField | null {
    return this.fields.find(field => field.key === 'notes') ?? null;
  }

  onMultilineInput(event: Event, textarea?: HTMLTextAreaElement | null): void {
    this.onFieldChange();
    this.syncTextareaHeight(textarea ?? (event.target as HTMLTextAreaElement));
  }

  onMultilineResize(event: Event, textarea?: HTMLTextAreaElement | null): void {
    this.syncTextareaHeight(textarea ?? (event.target as HTMLTextAreaElement));
  }

  syncTextareaHeight(textarea?: HTMLTextAreaElement | null): void {
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    const minHeight = Number.parseFloat(getComputedStyle(textarea).minHeight) || 0;
    textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
  }

  queueMultilineTextareaHeightSync(): void {
    queueMicrotask(() => {
      this.syncTextareaHeight(this.descriptionTextarea?.nativeElement);
      this.syncTextareaHeight(this.notesTextarea?.nativeElement);
    });
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  getAgreementIsFurnished(): boolean {
    const unfurnishedValue = this.getFieldValue('unfurnished');
    if (unfurnishedValue) {
      return unfurnishedValue !== 'true';
    }
    return !this.property?.unfurnished;
  }

  getAgreementBedrooms(): number | null {
    return this.getFieldNumericValue('bedrooms', this.property?.bedrooms ?? null);
  }

  getAgreementPropertyLeaseTypeId(): number | null {
    return this.getFieldNumericValue('propertyLeaseTypeId', this.property?.propertyLeaseTypeId ?? null);
  }

  getAgreementVendorContactId(): string | null {
    const value = this.getFieldValue('vendorId');
    return value || this.property?.vendorId || null;
  }
  //#endregion

  //#region Data Loading Methods
  loadProperty(): void {
    const propertyId = this.propertyId.trim();
    this.isPageReady = false;
    this.property = null;
    this.fields = [];
    this.setDirty(false);
    this.markViewForCheck();
    if (!propertyId) {
      this.isPageReady = true;
      this.markViewForCheck();
      return;
    }
    this.propertyService.getPropertyByGuid(propertyId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(property => {
        this.property = property;
        return this.loadStates(property);
      }),
      finalize(() => {
        this.isPageReady = true;
        this.queueMultilineTextareaHeightSync();
        this.markViewForCheck();
      })
    ).subscribe({
      next: property => {
        this.property = property;
        this.propertyCodeChange.emit(property.propertyCode || '');
        this.applyFields();
      },
      error: () => {
        this.property = null;
        this.fields = [];
        this.markViewForCheck();
      }
    });
  }

  loadStates(property: PropertyResponse) {
    const cachedStates = this.commonService.getStatesValue();
    const states$ = cachedStates.length > 0 ? of(cachedStates) : this.commonService.getStates().pipe(take(1));
    return states$.pipe(switchMap(states => {
      this.states = states || [];
      return of(property);
    }));
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          const rows = contacts || [];
          this.ownerOptions = this.mappingService.mapMobilePropertyContactOptions(rows.filter(contact => contact.entityTypeId === EntityType.Owner && contact.isActive !== false));
          this.vendorOptions = this.mappingService.mapMobilePropertyContactOptions(rows.filter(contact => contact.entityTypeId === EntityType.Vendor && contact.isActive !== false));
          this.applyFields();
        });
      },
      error: () => {
        this.ownerOptions = [];
        this.vendorOptions = [];
        this.applyFields();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  applyFields(): void {
    if (!this.property || this.isDirty) {
      return;
    }
    this.fields = this.mapFields(this.property);
    this.queueMultilineTextareaHeightSync();
    this.markViewForCheck();
  }

  mapFields(property: PropertyResponse): MobileListField[] {
    return this.mappingService.mapMobilePropertyDetailFields(property, {
      states: this.states,
      owners: this.ownerOptions,
      vendors: this.vendorOptions
    });
  }

  getPanelFields(keys: readonly string[]): MobileListField[] {
    const keyOrder = new Map(keys.map((key, index) => [key, index]));
    return this.fields
      .filter(field => keyOrder.has(field.key))
      .sort((left, right) => (keyOrder.get(left.key) ?? 0) - (keyOrder.get(right.key) ?? 0));
  }

  setDirty(isDirty: boolean): void {
    if (this.isDirty === isDirty) {
      return;
    }
    this.isDirty = isDirty;
    this.dirtyChange.emit(isDirty);
  }

  getFieldValue(key: string): string | null {
    const value = String(this.fields.find(field => field.key === key)?.value ?? '').trim();
    return value || null;
  }

  getFieldNumericValue(key: string, fallback: number | null = null): number | null {
    const value = this.getFieldValue(key);
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
