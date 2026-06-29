import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, distinctUntilChanged, filter, finalize, forkJoin, map, of, skip, switchMap, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { NavigationContextService } from '../../../services/navigation-context.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { AreaResponse } from '../../organizations/models/area.model';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { RegionResponse } from '../../organizations/models/region.model';
import { AreaService } from '../../organizations/services/area.service';
import { BuildingService } from '../../organizations/services/building.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { RegionService } from '../../organizations/services/region.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { getReservationNotices } from '../../reservations/models/reservation-enum';
import { ReservationService } from '../../reservations/services/reservation.service';
import { CheckinTimes, CheckoutTimes, PropertyLeaseType, PropertyStatus, PropertyStyle, PropertyType, TrashDays, getBedSizeTypes, getCheckInTimes, getCheckOutTimes, getPropertyLeaseTypes, getPropertyStatuses, getPropertyStyles, getPropertyTypes } from '../models/property-enums';
import { PropertyInformationRequest, PropertyInformationResponse } from '../models/property-information.model';
import { PropertyTitleBarContext } from '../models/property-title-bar-context.model';
import { PropertyRequest, PropertyResponse } from '../models/property.model';
import { PropertyCodeDialogComponent, PropertyCodeDialogResult } from '../property-code-dialog/property-code-dialog.component';
import { PropertyAgreementComponent } from '../property-agreement/property-agreement.component';
import { PropertyInformationService } from '../services/property-information.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';
import { NewContactDialogOptions, NewContactDialogService } from '../../shared/contacts/new-contact-dialog.service';
import { OwnersService } from '../../owners/services/owners.service';
import { UserGroups } from '../../users/models/user-enums';
import {
  OwnerAuthorization,
  isOwnerAuthorizedAdmin,
  isOwnerUnauthorized
} from '../../owners/models/owner-authorization.model';

@Component({
    selector: 'app-property',
    standalone: true,
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule,
        ReactiveFormsModule,
        SearchableSelectComponent,
        PropertyAgreementComponent
    ],
    templateUrl: './property.component.html',
    styleUrls: ['./property.component.scss']
})

export class PropertyComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy, CanComponentDeactivate {
  readonly propertyCodeDefaultPrompt = 'Enter Code';
  readonly propertyLeaseTypeOptions = getPropertyLeaseTypes();

  isAdmin = false;
  isInAccounting = false;
  isAgentAdmin = false;
  isServiceError: boolean = false;
  organizationId = '';
  form: FormGroup;
  @ViewChild(PropertyAgreementComponent) propertyAgreementSection?: PropertyAgreementComponent;
  @ViewChild('descriptionEditor') set descriptionEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.descriptionEditor = value;
    this.syncDescriptionEditorFromForm();
  }
  descriptionEditor?: ElementRef<HTMLDivElement>;
  @ViewChild('amenitiesEditor') set amenitiesEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.amenitiesEditor = value;
    this.syncAmenitiesEditorFromForm();
  }
  amenitiesEditor?: ElementRef<HTMLDivElement>;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  isInOwnerMode: boolean = false;
  @Input() disableOwnerModeLayout = false;
  @Input() shellPropertyId: string | null = null;
  @Input() shellPropertyCode: string | null = null;
  @Input() shellPropertyAddress1: string | null = null;
  @Input() shellPropertyCity: string | null = null;
  @Input() shellPropertyState: string | null = null;
  @Input() shellPropertyZip: string | null = null;
  @Input() ownerPrimaryContactId: string | null = null;
  @Input() shellMode = false;
  @Input() shellOfficeId: number | null = null;
  @Input() shellOrganizationId: string | null = null;
  @Input() publicOwnerToken: string | null = null;
  @Input() ownerAuthorization: OwnerAuthorization = OwnerAuthorization.UnauthorizedOwner;
  @Output() titleBarContextChange = new EventEmitter<PropertyTitleBarContext>();
  @Output() titleBarPropertyCodeInvalid = new EventEmitter<void>();
  @Output() ownerShellContextChanged = new EventEmitter<void>();

  propertyId: string;
  property: PropertyResponse;
  selectedReservationId: string | null = null;
  copiedPropertyInformation: PropertyInformationResponse | null = null;
  pendingCopyFromPropertyId: string | null = null;
  appliedCopyFromPropertyId: string | null = null;
  codePaletteTargetControl: string | null = null;
 
  expandedSections = { basic: true, features: true, description: true, agreement: false };
  savedFormState: Record<string, unknown> | null = null;
 
  states: string[] = [];
  contacts: ContactResponse[] = [];
  trashDays: { value: number, label: string }[] = [];
  propertyStyles: { value: number, label: string }[] = [];
  propertyStatuses: { value: number, label: string }[] = [];
  propertyTypes: { value: number, label: string }[] = [];
  bedSizeTypes: { value: number, label: string }[] = [];
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  reservationNoticeOptions: { value: number, label: string }[] = [];

  officesInitialized = false;
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
 
  regions: RegionResponse[] = [];
  areas: AreaResponse[] = [];
  buildings: BuildingResponse[] = [];
  allRegionsByOrg: RegionResponse[] = [];
  allAreasByOrg: AreaResponse[] = [];
  allBuildingsByOrg: BuildingResponse[] = [];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'regions', 'areas', 'buildings', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  
  constructor(
    public propertyService: PropertyService,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private commonService: CommonService,
    private formatterService: FormatterService,
    private mappingService: MappingService,
    private navigationContextService: NavigationContextService,
    private contactService: ContactService,
    private authService: AuthService,
    private officeService: OfficeService,
    private regionService: RegionService,
    private areaService: AreaService,
    private buildingService: BuildingService,
    private welcomeLetterReloadService: WelcomeLetterReloadService,
    private documentReloadService: DocumentReloadService,
    private utilityService: UtilityService,
    private propertyInformationService: PropertyInformationService,
    private reservationService: ReservationService,
    private globalSelectionService: GlobalSelectionService,
    private dialog: MatDialog,
    private newContactDialogService: NewContactDialogService,
    private unsavedChangesDialogService: UnsavedChangesDialogService,
    private ownersService: OwnersService
  ) {
  }

  get isOwnerMode(): boolean {
    return this.isInOwnerMode && !this.disableOwnerModeLayout;
  }

  get canShowPropertyAgreement(): boolean {
    if (!this.propertyId || this.isAddMode) {
      return false;
    }
    if (String(this.publicOwnerToken || '').trim().length > 0) {
      return false;
    }
    if (this.isInOwnerMode) {
      if (isOwnerUnauthorized(this.ownerAuthorization)) {
        return false;
      }
      return isOwnerAuthorizedAdmin(this.ownerAuthorization);
    }
    return this.isInAccounting || this.isAgentAdmin;
  }

  get canManagePropertyAgreement(): boolean {
    if (String(this.publicOwnerToken || '').trim().length > 0) {
      return false;
    }
    if (this.isInOwnerMode) {
      if (isOwnerUnauthorized(this.ownerAuthorization)) {
        return false;
      }
      return isOwnerAuthorizedAdmin(this.ownerAuthorization);
    }
    return this.isInAccounting || this.isAgentAdmin;
  }

  //#region Property
  ngOnInit(): void {
    this.navigationContextService.getIsInOwnerMode().pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.isInOwnerMode = value;
      this.applyOwnerModeDefaults();
    });
    
    this.isAdmin = this.authService.isAdmin();
    this.isInAccounting = this.authService.isInAccounting();
    this.isAgentAdmin = this.authService.hasRole(UserGroups.AgentAdmin);
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    const initialRouteId = this.route.snapshot.paramMap.get('id');
    if (initialRouteId) {
      this.expandedSections.agreement = this.canShowPropertyAgreement;
    }

    this.loadStates();
    this.loadContacts();
    this.loadOffices();
    this.loadRegions();
    this.loadAreas();
    this.loadBuildings();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.shellMode || !this.isAddMode || this.offices.length === 0) {
        return;
      }
      this.resolveOfficeScope(officeId);
      this.emitTitleBarContextToShell();
    });

    // Initialize dropdown menus
    this.initializeTrashDays();
    this.initializePropertyStyles();
    this.initializePropertyStatuses();
    this.initializePropertyTypes();
    this.initializeBedSizeTypes();
    this.initializeTimeTypes();
    this.initializeReservationNotices();
    
    this.buildForm();
    this.applyOwnerModeDefaults();
    this.applyOfficeControlState();

    const inputId = String(this.shellPropertyId ?? '').trim();
    if (inputId) {
      this.applyPropertyIdContext(inputId);
      this.applyShellPropertyCodeContext();
      if (!this.shellMode) {
        this.applyShellOfficeContext();
      }
      this.applyShellPropertyAddressContext();
    } else {
      this.route.paramMap.pipe(takeUntil(this.destroy$), map(pm => pm.get('id')), filter((id): id is string => id != null && id !== ''), distinctUntilChanged()).subscribe(id => {
        this.applyPropertyIdContext(id);
      });
    }

    this.route.queryParamMap.pipe(
      takeUntil(this.destroy$),
      map(queryParams => String(queryParams.get('copyFrom') || '').trim()),
      map(copyFrom => copyFrom.length > 0 ? copyFrom : null),
      distinctUntilChanged()
    ).subscribe(copyFromPropertyId => {
      this.pendingCopyFromPropertyId = copyFromPropertyId;
      this.tryApplyCopyFromProperty();
    });
    
    // Check query params for tab selection
    this.setupConditionalFields();
    this.setupPropertyAgreementSyncHandlers();
    this.setupBuildingAmenitySyncFromSelection();
    this.setupOwnerSelectionHandlers();
    this.setupVendorSelectionHandlers();
    this.setupLeaseTypeOwnerVendorValidators();
  }

  ngAfterViewInit(): void {
    this.syncDescriptionEditorFromForm();
    this.syncAmenitiesEditorFromForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['shellPropertyId'] && !changes['shellPropertyId'].firstChange) {
      const nextId = String(this.shellPropertyId ?? '').trim() || 'new';
      this.applyPropertyIdContext(nextId);
      if (nextId === 'new') {
        this.applyShellPropertyCodeContext();
        this.applyShellPropertyAddressContext();
      }
    }
    if (changes['shellPropertyCode'] && !changes['shellPropertyCode'].firstChange) {
      this.applyShellPropertyCodeContext();
    }
    if ((changes['shellPropertyAddress1'] || changes['shellPropertyCity'] || changes['shellPropertyState'] || changes['shellPropertyZip']) && !changes['shellPropertyId']?.firstChange) {
      this.applyShellPropertyAddressContext();
    }
    if (changes['ownerPrimaryContactId']) {
      this.syncOwnerPrimaryContactSelection();
    }
    if (changes['shellOfficeId'] && !this.shellMode) {
      this.applyShellOfficeContext();
    }
  }

  getProperty(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    this.ownersService.getPropertyByContext(this.publicOwnerToken, this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response) => {
        if (!response) {
          if (!this.isEmbeddedInOwnerShell()) {
            this.isServiceError = true;
          }
          return;
        }
        this.isServiceError = false;
        this.property = response;
        this.populateForm();
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        if (!this.isEmbeddedInOwnerShell()) {
          this.isServiceError = true;
        }
      }
    });
  }

  copyFromProperty(sourcePropertyId: string): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'property');
    const contactsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('contacts')), filter(loaded => loaded === true), take(1));
    const officesLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('offices')), filter(loaded => loaded === true), take(1));
    const regionsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('regions')), filter(loaded => loaded === true), take(1));
    const areasLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('areas')), filter(loaded => loaded === true), take(1));
    const buildingsLoaded$ = this.itemsToLoad$.pipe(map(items => !items.has('buildings')), filter(loaded => loaded === true), take(1));
    
    // Wait for lookups to complete, then load the property and property letter to copy
    forkJoin({
      contacts: contactsLoaded$,
      offices: officesLoaded$,
      regions: regionsLoaded$,
      areas: areasLoaded$,
      buildings: buildingsLoaded$
    }).pipe(take(1),
      switchMap(() => forkJoin({
        property: this.propertyService.getPropertyByGuid(sourcePropertyId).pipe(take(1)),
        propertyInformation: this.propertyInformationService.getPropertyInformationByGuid(sourcePropertyId).pipe(take(1), catchError(() => of(null)))
      })),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })
    ).subscribe({
      next: (result: { property: PropertyResponse; propertyInformation: PropertyInformationResponse | null }) => {
         this.property = result.property;
         this.copiedPropertyInformation = result.propertyInformation;
        
        // Populate form with all copied values
        if (this.property && this.form) {
          // Enable all conditional fields temporarily so patchValue can update them
          this.form.get('parkingNotes')?.enable({ emitEvent: false });
          this.form.get('dogsOkay')?.enable({ emitEvent: false });
          this.form.get('catsOkay')?.enable({ emitEvent: false });
          this.form.get('poundLimit')?.enable({ emitEvent: false });

          this.populateForm();
          this.form.get('propertyCode')?.setValue(this.propertyCodeDefaultPrompt);

          // Now set conditional fields based on copied values
          const parkingValue = this.form.get('parking')?.value;
          const petsAllowedValue = this.form.get('petsAllowed')?.value;

          if (parkingValue) {
            this.form.get('parkingNotes')?.enable({ emitEvent: false });
          } else {
            this.form.get('parkingNotes')?.disable({ emitEvent: false });
            this.form.get('parkingNotes')?.setValue('', { emitEvent: false });
          }
          
          if (petsAllowedValue) {
            this.form.get('dogsOkay')?.enable({ emitEvent: false });
            this.form.get('catsOkay')?.enable({ emitEvent: false });
            this.form.get('poundLimit')?.enable({ emitEvent: false });
          } else {
            this.form.get('dogsOkay')?.disable({ emitEvent: false });
            this.form.get('dogsOkay')?.setValue(false, { emitEvent: false });
            this.form.get('catsOkay')?.disable({ emitEvent: false });
            this.form.get('catsOkay')?.setValue(false, { emitEvent: false });
            this.form.get('poundLimit')?.disable({ emitEvent: false });
            this.form.get('poundLimit')?.setValue('', { emitEvent: false });
          }
          this.emitTitleBarContextToShell();
        }
      },
      error: () => {
        this.isServiceError = true;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  saveProperty(onComplete?: (saved: boolean) => void): void {
    this.touchAllFormControls(this.form);
    this.form.markAsTouched();
    this.form.updateValueAndValidity({ emitEvent: false });

    if (!this.form.valid) {
      if (this.form.get('propertyCode')?.invalid) {
        this.titleBarPropertyCodeInvalid.emit();
      }
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      onComplete?.(false);
      return;
    }

    const publicOwnerToken = String(this.publicOwnerToken || '').trim();
    const isPublicOwnerUpsertMode = publicOwnerToken.length > 0;
    const hasAccessToken = !!String(this.authService.getAuthData()?.accessToken || '').trim();
    if (!isPublicOwnerUpsertMode && !hasAccessToken) {
      this.toastr.error('Unable to save property. This endpoint requires an authenticated session.', CommonMessage.Error);
      onComplete?.(false);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const formOverrides = this.buildPropertyFormOverrides(formValue, {
      isPublicOwnerUpsertMode,
      shellOrganizationId: this.shellOrganizationId,
      userOrganizationId: user?.organizationId || '',
      isOwnerMode: this.isOwnerMode,
      ownerPrimaryContactId: this.ownerPrimaryContactId,
      existingOfficeId: this.property?.officeId ?? null,
      isAddMode: this.isAddMode
    });
    const isPropertyUpdate = this.isExistingPropertyUpdate();

    if (isPropertyUpdate) {
      if (!this.property) {
        this.isSubmitting = false;
        this.toastr.error('Property is not loaded. Refresh and try again.', CommonMessage.Error);
        onComplete?.(false);
        return;
      }

      const propertyRequest = this.propertyService.mergePropertyUpdateRequest(this.property, formOverrides);

      if (isPublicOwnerUpsertMode) {
        this.ownersService.upsertPropertyByContext(publicOwnerToken, propertyRequest).pipe(
          take(1),
          finalize(() => { this.isSubmitting = false; })
        ).subscribe({
          next: (response) => {
            if (!response) {
              this.toastr.error('Unable to save property.', CommonMessage.Error);
              onComplete?.(false);
              return;
            }
            this.toastr.success('Property saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
            this.property = response;
            this.propertyId = response.propertyId;
            this.isAddMode = false;
            this.populateForm();
            this.captureSavedStateSignature();
            this.welcomeLetterReloadService.triggerReload();
            this.documentReloadService.triggerReload();
            this.notifyOwnerShellContextChangedIfEmbedded();
            this.loadReservations();
            onComplete?.(true);
          },
          error: (error: unknown) => {
            const apiMessage = this.getApiErrorMessage(error);
            this.toastr.error((apiMessage || 'Unable to save property.').toString(), CommonMessage.Error);
            onComplete?.(false);
          }
        });
        return;
      }

      this.propertyService.updateProperty(propertyRequest).pipe(
        switchMap((response: PropertyResponse) => {
          const persist$ = this.propertyAgreementSection?.persistAgreementIfDirty() ?? of(true);
          return persist$.pipe(map(ok => ({ response, ok })));
        }),
        take(1),
        finalize(() => { this.isSubmitting = false; })
      ).subscribe({
        next: ({ response, ok }) => {
          this.toastr.success('Property updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.populateForm();
          this.captureSavedStateSignature();
          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
          this.notifyOwnerShellContextChangedIfEmbedded();
          onComplete?.(ok);
        },
        error: () => {
          onComplete?.(false);
        }
      });
      return;
    }

    const { ...restFormValue } = formValue;
    const propertyRequest: PropertyRequest = {
      ...restFormValue,
      ...formOverrides,
      organizationId: formOverrides.organizationId ?? user?.organizationId ?? ''
    } as PropertyRequest;

    if (isPublicOwnerUpsertMode) {
      this.ownersService.upsertPropertyByContext(publicOwnerToken, propertyRequest).pipe(take(1),finalize(() => { this.isSubmitting = false; })).subscribe({
        next: (response) => {
          if (!response) {
            this.toastr.error('Unable to save property.', CommonMessage.Error);
            onComplete?.(false);
            return;
          }
          this.toastr.success('Property saved successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.propertyId = response.propertyId;
          this.isAddMode = false;
          this.populateForm();
          this.captureSavedStateSignature();
          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
          this.notifyOwnerShellContextChangedIfEmbedded();
          this.loadReservations();
          onComplete?.(true);
        },
        error: (error: unknown) => {
          const apiMessage = this.getApiErrorMessage(error);
          this.toastr.error((apiMessage || 'Unable to save property.').toString(), CommonMessage.Error);
          onComplete?.(false);
        }
      });
      return;
    }

    if (this.isAddMode) {
      this.propertyService.createProperty(propertyRequest).pipe(
        switchMap((response: PropertyResponse) => {
          const persist$ = this.propertyAgreementSection?.persistAgreementForNewProperty(response.propertyId) ?? of(true);
          return persist$.pipe(map(() => response));
        }),
        switchMap((response: PropertyResponse) =>
          this.persistCopiedPropertyInformationAfterPropertyCreate(response).pipe(
            map(() => response)
          )
        ),
        take(1),finalize(() => { this.isSubmitting = false; })).subscribe({
        next: (response) => {
          this.toastr.success('Property created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.property = response;
          this.propertyId = response.propertyId;
          this.isAddMode = false;
          this.populateForm();
          this.captureSavedStateSignature();

          this.welcomeLetterReloadService.triggerReload();
          this.documentReloadService.triggerReload();
          this.notifyOwnerShellContextChangedIfEmbedded();
          this.loadReservations();
          onComplete?.(true);
        },
        error: () => {
          onComplete?.(false);
        }
      });
    }
  }

  private isEmbeddedInOwnerShell(): boolean {
    return String(this.shellPropertyId ?? '').trim().length > 0 ||
      String(this.publicOwnerToken ?? '').trim().length > 0;
  }

  private notifyOwnerShellContextChangedIfEmbedded(): void {
    if (!this.isEmbeddedInOwnerShell()) {
      return;
    }
    this.ownerShellContextChanged.emit();
  }
  //#endregion

  isExistingPropertyUpdate(): boolean {
    const propertyId = String(this.propertyId ?? '').trim();
    return !this.isAddMode && propertyId.length > 0 && propertyId !== 'new';
  }

  buildPropertyFormOverrides(
    formValue: Record<string, unknown>,
    context: {
      isPublicOwnerUpsertMode: boolean;
      shellOrganizationId: string | null;
      userOrganizationId: string;
      isOwnerMode: boolean;
      ownerPrimaryContactId: string | null;
      existingOfficeId: number | null;
      isAddMode: boolean;
    }
  ): Partial<PropertyRequest> {
    const overrides: Partial<PropertyRequest> = {
      propertyCode: String(formValue['propertyCode'] ?? ''),
      isActive: (formValue['isActive'] as boolean) ?? true,
      dailyRate: formValue['dailyRate'] ? parseFloat(String(formValue['dailyRate'])) : 0,
      monthlyRate: formValue['monthlyRate'] ? parseFloat(String(formValue['monthlyRate'])) : 0,
      departureFee: formValue['departureFee'] ? parseFloat(String(formValue['departureFee'])) : 0,
      maidServiceFee: formValue['maidServiceFee'] ? parseFloat(String(formValue['maidServiceFee'])) : 0,
      petFee: formValue['petFee'] ? parseFloat(String(formValue['petFee'])) : 0,
      externalCalendar: formValue['externalCalendar'] == null ? null : String(formValue['externalCalendar']),
      checkInTimeId: this.parseIdValue(formValue['checkInTimeId'], 0),
      checkOutTimeId: this.parseIdValue(formValue['checkOutTimeId'], 0),
      propertyLeaseTypeId: this.parseIdValue(formValue['propertyLeaseTypeId'], 0),
      accomodates: formValue['accomodates'] ? Number(formValue['accomodates']) : 0,
      bedrooms: formValue['bedrooms'] ? Number(formValue['bedrooms']) : 0,
      bathrooms: formValue['bathrooms'] ? Number(formValue['bathrooms']) : 0,
      squareFeet: formValue['squareFeet'] ? Number(formValue['squareFeet']) : 0,
      unitLevel: formValue['unitLevel'] != null && formValue['unitLevel'] !== '' ? Number(formValue['unitLevel']) : 1,
      bedroomId1: formValue['bedroomId1'] ? Number(formValue['bedroomId1']) : 0,
      bedroomId2: formValue['bedroomId2'] ? Number(formValue['bedroomId2']) : 0,
      bedroomId3: formValue['bedroomId3'] ? Number(formValue['bedroomId3']) : 0,
      bedroomId4: formValue['bedroomId4'] ? Number(formValue['bedroomId4']) : 0,
      availableFrom: this.utilityService.formatDateOnlyForApi(formValue['availableFrom'] as Date | null | undefined) ?? undefined,
      availableUntil: this.utilityService.formatDateOnlyForApi(formValue['availableUntil'] as Date | null | undefined) ?? undefined,
      propertyStyleId: (formValue['propertyStyle'] as number | undefined) ?? PropertyStyle.Standard,
      propertyTypeId: (formValue['propertyType'] as number | undefined) ?? PropertyType.Unspecified,
      propertyStatusId: (formValue['propertyStatus'] as number | undefined) ?? PropertyStatus.Vacant,
      noticeToVacateId: this.parseIdValue(formValue['noticeToVacateId'], 0),
      officeId: Number(formValue['officeId'] ?? context.existingOfficeId ?? 0),
      regionId: (formValue['regionId'] as number | null) || null,
      areaId: (formValue['areaId'] as number | null) || null,
      buildingId: (formValue['buildingId'] as number | null) || null,
      latitude: this.parseCoordinateValue(formValue['latitude'] as string | number | null | undefined, 0),
      longitude: this.parseCoordinateValue(formValue['longitude'] as string | number | null | undefined, 0),
      sofabed: formValue['sofabed'] ? Number(formValue['sofabed']) : 0,
      parkingNotes: String(formValue['parkingNotes'] ?? ''),
      notes: String(formValue['notes'] ?? ''),
      minStay: formValue['minStay'] != null ? Number(formValue['minStay']) : 0,
      maxStay: formValue['maxStay'] != null ? Number(formValue['maxStay']) : 0,
      trashPickupId: formValue['trashPickupId'] != null ? Number(formValue['trashPickupId']) : 0,
      address1: String(formValue['address1'] ?? ''),
      city: String(formValue['city'] ?? ''),
      state: String(formValue['state'] ?? ''),
      zip: String(formValue['zip'] ?? ''),
      unfurnished: (formValue['unfurnished'] as boolean) ?? false,
      heating: (formValue['heating'] as boolean) ?? false,
      ac: (formValue['ac'] as boolean) ?? false,
      elevator: (formValue['elevator'] as boolean) ?? false,
      security: (formValue['security'] as boolean) ?? false,
      gated: (formValue['gated'] as boolean) ?? false,
      petsAllowed: (formValue['petsAllowed'] as boolean) ?? false,
      dogsOkay: (formValue['dogsOkay'] as boolean) ?? false,
      catsOkay: (formValue['catsOkay'] as boolean) ?? false,
      poundLimit: String(formValue['poundLimit'] ?? ''),
      smoking: (formValue['smoking'] as boolean) ?? false,
      parking: (formValue['parking'] as boolean) ?? false,
      kitchen: (formValue['kitchen'] as boolean) ?? false,
      oven: (formValue['oven'] as boolean) ?? false,
      refrigerator: (formValue['refrigerator'] as boolean) ?? false,
      microwave: (formValue['microwave'] as boolean) ?? false,
      dishwasher: (formValue['dishwasher'] as boolean) ?? false,
      bathtub: (formValue['bathtub'] as boolean) ?? false,
      washerDryerInUnit: (formValue['washerDryerInUnit'] as boolean) ?? false,
      washerDryerInBldg: (formValue['washerDryerInBldg'] as boolean) ?? false,
      tv: (formValue['tv'] as boolean) ?? false,
      cable: (formValue['cable'] as boolean) ?? false,
      dvd: (formValue['dvd'] as boolean) ?? false,
      streaming: (formValue['streaming'] as boolean) ?? false,
      fastInternet: (formValue['fastInternet'] as boolean) ?? false,
      deck: (formValue['deck'] as boolean) ?? false,
      patio: (formValue['patio'] as boolean) ?? false,
      yard: (formValue['yard'] as boolean) ?? false,
      garden: (formValue['garden'] as boolean) ?? false,
      commonPool: (formValue['commonPool'] as boolean) ?? false,
      privatePool: (formValue['privatePool'] as boolean) ?? false,
      jacuzzi: (formValue['jacuzzi'] as boolean) ?? false,
      sauna: (formValue['sauna'] as boolean) ?? false,
      gym: (formValue['gym'] as boolean) ?? false
    };

    if (context.isPublicOwnerUpsertMode) {
      const tokenOrganizationId = String(context.shellOrganizationId || '').trim();
      if (tokenOrganizationId) {
        overrides.organizationId = tokenOrganizationId;
      }
    } else {
      overrides.organizationId = context.userOrganizationId;
    }

    const propertyLeaseTypeId = overrides.propertyLeaseTypeId ?? 0;
    if (propertyLeaseTypeId === PropertyLeaseType.PropertyManagement) {
      overrides.vendorId = null;
      const owner1Raw = String(formValue['owner1Id'] ?? '').trim();
      overrides.owner1Id = owner1Raw.length > 0 ? owner1Raw : null;
      const owner2Raw = String(formValue['owner2Id'] ?? '').trim();
      overrides.owner2Id = owner2Raw.length > 0 ? owner2Raw : null;
      const owner3Raw = String(formValue['owner3Id'] ?? '').trim();
      overrides.owner3Id = owner3Raw.length > 0 ? owner3Raw : null;
    } else {
      overrides.owner1Id = null;
      overrides.owner2Id = null;
      overrides.owner3Id = null;
      const vid = formValue['vendorId'];
      overrides.vendorId = vid != null && String(vid).trim() !== '' ? String(vid).trim() : null;
    }

    if (context.isOwnerMode) {
      const ownerContactId = String(context.ownerPrimaryContactId || '').trim();
      overrides.owner1Id = ownerContactId.length > 0 ? ownerContactId : null;
      overrides.owner2Id = null;
      overrides.owner3Id = null;
    }

    if (!overrides.owner2Id) {
      overrides.owner2Id = undefined;
    }

    const trimOrNull = (v: unknown): string | null => {
      if (v == null) {
        return null;
      }
      const s = String(v).trim();
      return s.length > 0 ? s : null;
    };

    const optionalStringFields: Array<keyof PropertyRequest> = [
      'address2', 'suite', 'communityAddress', 'neighborhood', 'crossStreet',
      'view', 'mailbox', 'amenities', 'alarmCode',
      'unitMstrCode', 'bldgMstrCode', 'bldgTenantCode',
      'mailRoomCode', 'trashRemoval', 'description', 'internetNetwork', 'internetPassword'
    ];
    optionalStringFields.forEach(field => {
      const raw = formValue[field as string];
      overrides[field] = (raw === '' || raw == null ? undefined : String(raw)) as never;
    });

    const bldgNoTrim = String(formValue['bldgNo'] ?? '').trim();
    overrides.bldgNo = bldgNoTrim.length > 0 ? bldgNoTrim : undefined;

    if (context.isAddMode) {
      overrides.phone = undefined;
    }

    overrides.communityAddress = trimOrNull(formValue['communityAddress']) ?? undefined;
    overrides.gateCode = trimOrNull(formValue['gateCode']);
    overrides.trashCode = trimOrNull(formValue['trashCode']);
    overrides.storageCode = trimOrNull(formValue['storageCode']);

    return overrides;
  }

  //#region Form Methods
  buildForm(): void {
    const codeValidators = this.isAddMode ? [Validators.required] : [];
    
    this.form = this.fb.group({
      propertyCode: new FormControl('', codeValidators),
      owner1Id: new FormControl(''),
      owner2Id: new FormControl(null),
      owner3Id: new FormControl(null),
      vendorId: new FormControl<string | null>(null),
      propertyStyle: new FormControl<number>(PropertyStyle.Standard, [Validators.required]),
      propertyStatus: new FormControl<number>(PropertyStatus.Vacant, [Validators.required]),
      propertyType: new FormControl<number>(PropertyType.Unspecified, [Validators.required]),
      noticeToVacateId: new FormControl<number>(0),
      unitLevel: new FormControl<number>(1, [Validators.required, Validators.min(0)]),
      bldgNo: new FormControl(''),
      accomodates: new FormControl(0, [Validators.required, Validators.min(1)]),
      dailyRate: new FormControl<string>('0.00', [Validators.required]),
      monthlyRate: new FormControl<string>('0.00', [Validators.required]),
      externalCalendar: new FormControl<string | null>(null, [Validators.maxLength(4000)]),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00', [Validators.required]),
      petFee: new FormControl<string>('0.00', [Validators.required]),
      unfurnished: new FormControl(false),
      
      // Details tab
      address1: new FormControl('', [Validators.required]),
      communityAddress: new FormControl(''),
      address2: new FormControl(''),
      suite: new FormControl(''),
      city: new FormControl('', [Validators.required]),
      state: new FormControl('', [Validators.required]),
      zip: new FormControl('', [Validators.required]),
      neighborhood: new FormControl(''),
      crossStreet: new FormControl(''),
      bedrooms: new FormControl(0, [Validators.required, Validators.min(0)]),
      bathrooms: new FormControl(0, [Validators.required, Validators.min(1)]),
      squareFeet: new FormControl(0, [Validators.required, Validators.min(1)]),
      bedroomId1: new FormControl(0),
      bedroomId2: new FormControl(0),
      bedroomId3: new FormControl(0),
      bedroomId4: new FormControl(0),
      
      // Kitchen & Electronics tab
      kitchen: new FormControl(false),
      washerDryerInUnit: new FormControl(false),
      washerDryerInBldg: new FormControl(false),
      trashRemoval: new FormControl(''),
      trashPickupId: new FormControl(null, [Validators.required]),
      oven: new FormControl(false),
      refrigerator: new FormControl(false),
      microwave: new FormControl(false),
      dishwasher: new FormControl(false),
      tv: new FormControl(false),
      cable: new FormControl(false),
      streaming: new FormControl(false),
      fastInternet: new FormControl(false),
      internetNetwork: new FormControl(''),
      internetPassword: new FormControl(''),
      minStay: new FormControl<number>(0),
      maxStay: new FormControl<number>(0),
      availableFrom: new FormControl<Date | null>(null),
      availableUntil: new FormControl<Date | null>(null),
      checkInTimeId: new FormControl<number | null>(null, [Validators.required]),
      checkOutTimeId: new FormControl<number | null>(null, [Validators.required]),
      
      // Living tab
      view: new FormControl(''),
      deck: new FormControl(false),
      garden: new FormControl(false),
      patio: new FormControl(false),
      yard: new FormControl(false),
      commonPool: new FormControl(false),
      privatePool: new FormControl(false),
      jacuzzi: new FormControl(false),
      sauna: new FormControl(false),
      bathtub: new FormControl(false),
      gym: new FormControl(false),
      security: new FormControl(false),
      elevator: new FormControl(false),
      parking: new FormControl(false),
      parkingNotes: new FormControl({ value: '', disabled: true }),
      
      // Amenities tab – code fields (send/receive with API)
      amenities: new FormControl(''),
      description: new FormControl(''),
      notes: new FormControl(''),
      alarmCode: new FormControl(''),
      unitMstrCode: new FormControl(''),
      unitTenantCode: new FormControl(''),
      bldgMstrCode: new FormControl(''),
      bldgTenantCode: new FormControl(''),
      mailRoomCode: new FormControl(''),
      gateCode: new FormControl(''),
      trashCode: new FormControl(''),
      storageCode: new FormControl(''),
      mailbox: new FormControl(''),
      gated: new FormControl(false),
      heating: new FormControl(false),
      ac: new FormControl(false),
      sofabed: new FormControl(0),
      smoking: new FormControl(false),
      petsAllowed: new FormControl(false),
      dogsOkay: new FormControl({ value: false, disabled: true }),
      catsOkay: new FormControl({ value: false, disabled: true }),
      poundLimit: new FormControl({ value: '', disabled: true }),

      // Location section (officeId also used in title bar)
      officeId: new FormControl<number | null>(null, [Validators.required]),
      reservationId: new FormControl<string | null>(null), // title bar + tabs; synced with selectedReservationId
      regionId: new FormControl<number | null>(null),
      areaId: new FormControl<number | null>(null),
      buildingId: new FormControl<number | null>(null),
      latitude: new FormControl('0.00', [Validators.pattern(/^-?\d+(\.\d{1,8})?$/)]),
      longitude: new FormControl('-0.00', [Validators.pattern(/^-?\d+(\.\d{1,8})?$/)]),
      
      isActive: new FormControl(true),
      propertyLeaseTypeId: new FormControl<number>(PropertyLeaseType.PropertyManagement, [Validators.required])
    }, { validators: [this.bedSelectionValidator] });
  }

  populateForm(): void {
    if (this.property && this.form) {
      // Start with property object, converting to form-friendly format
      const formData: any = { ...this.property };
      const propertyRaw = this.property as unknown as Record<string, unknown>;
      
      // Transform fields that need special handling
      const code = this.property.propertyCode?.toUpperCase() || '';
      formData.propertyCode = code;
      formData.owner1Id = this.property.owner1Id || '';
      formData.owner2Id = this.property.owner2Id || null;
      formData.owner3Id = this.property.owner3Id || null;
      formData.dailyRate = this.property.dailyRate !== null && this.property.dailyRate !== undefined ? this.property.dailyRate.toFixed(2) : '0.00';
      formData.monthlyRate = this.property.monthlyRate !== null && this.property.monthlyRate !== undefined ? this.property.monthlyRate.toFixed(2) : '0.00';
      formData.externalCalendar = this.property.externalCalendar ?? null;
      formData.departureFee = this.property.departureFee !== null && this.property.departureFee !== undefined ? this.property.departureFee.toFixed(2) : '0.00';
      formData.maidServiceFee = this.property.maidServiceFee !== null && this.property.maidServiceFee !== undefined ? this.property.maidServiceFee.toFixed(2) : '0.00';
      formData.petFee = this.property.petFee !== null && this.property.petFee !== undefined ? this.property.petFee.toFixed(2) : '0.00';
      formData.minStay = this.property.minStay ?? 0;
      formData.maxStay = this.property.maxStay ?? 0;
      
      formData.availableFrom = this.utilityService.parseCalendarDateInput(this.property.availableFrom ?? null);
      formData.availableUntil = this.utilityService.parseCalendarDateInput(this.property.availableUntil ?? null);
      // Normalize values
      formData.checkInTimeId = this.parseIdValue(this.property.checkInTimeId, 0);
      formData.checkOutTimeId = this.parseIdValue(this.property.checkOutTimeId, 0);
      
      // Handle enum Id fields as numbers (map from Id fields)
      const propertyStyleValue = this.parseIdValue(this.property.propertyStyleId, 0);
      const propertyStatusValue = this.parseIdValue(this.property.propertyStatusId, 0);
      const propertyTypeValue = this.parseIdValue(this.property.propertyTypeId, 0);
      
      formData.propertyStyle = propertyStyleValue;
      formData.propertyStatus = propertyStatusValue;
      formData.propertyType = propertyTypeValue;
      formData.noticeToVacateId = this.parseIdValue(this.property.noticeToVacateId, 0);
      formData.propertyLeaseTypeId = this.parseIdValue(this.property.propertyLeaseTypeId, 0);

      const leaseNorm = this.parseIdValue(formData.propertyLeaseTypeId, 0);
      if (leaseNorm === PropertyLeaseType.PropertyManagement) {
        formData.vendorId = null;
      } else {
        formData.owner1Id = '';
        formData.owner2Id = null;
        formData.owner3Id = null;
        formData.vendorId = this.property.vendorId ?? null;
      }
      
      // Handle bedroom IDs
      formData.bedroomId1 = this.property.bedroomId1 ?? 0;
      formData.bedroomId2 = this.property.bedroomId2 ?? 0;
      formData.bedroomId3 = this.property.bedroomId3 ?? 0;
      formData.bedroomId4 = this.property.bedroomId4 ?? 0;
      formData.washerDryerInUnit = this.property.washerDryerInUnit ?? false;
      formData.washerDryerInBldg = this.property.washerDryerInBldg ?? false;
      formData.sofabed = Number(this.property.sofabed ?? 0);
     
      // Handle string fields that might be null/undefined - convert to empty strings
      const stringFields = ['address2', 'suite', 'communityAddress', 'bldgNo', 'neighborhood', 'crossStreet', 'view',
                           'trashRemoval', 'amenities', 'alarmCode', 'unitMstrCode', 'unitTenantCode',
                           'bldgMstrCode', 'bldgTenantCode', 'mailRoomCode',
                           'gateCode', 'trashCode', 'storageCode',
                           'mailbox', 'description', 'notes', 'poundLimit'];
      stringFields.forEach(field => {
        formData[field] = this.property[field] || '';
      });
      const descriptionCandidates = [
        propertyRaw['description'],
        propertyRaw['Description'],
        propertyRaw['propertyDescription'],
        propertyRaw['PropertyDescription']
      ];
      const resolvedDescription = descriptionCandidates.find(value => value != null && String(value).trim() !== '');
      formData.description = resolvedDescription == null ? '' : String(resolvedDescription);
      
      // Handle parkingNotes field (map from parkingNotes in response)
      formData.parkingNotes = this.property.parkingNotes || '';
      
      // Handle boolean fields that might be null/undefined
      formData.dogsOkay = this.property.dogsOkay ?? false;
      formData.catsOkay = this.property.catsOkay ?? false;
      
      formData.unitLevel =
        this.property.unitLevel != null && this.property.unitLevel !== undefined
          ? Number(this.property.unitLevel)
          : 1;

      formData.bldgNo =
        this.property.bldgNo != null && String(this.property.bldgNo).trim() !== ''
          ? String(this.property.bldgNo).trim()
          : '';

      // Assign location IDs directly from API (now GUIDs)
      formData.officeId = this.property.officeId || null;
      formData.regionId = this.property.regionId || null;
      formData.areaId = this.property.areaId || null;
      formData.buildingId = this.property.buildingId || null;
      formData.latitude = this.formatCoordinateValue(this.property.latitude, '0.00');
      formData.longitude = this.formatCoordinateValue(this.property.longitude, '-0.00');

      // Default required fields when API omits them so validation does not run as if user had left them empty
      if (this.property.trashPickupId == null || this.property.trashPickupId === undefined) {
        formData.trashPickupId = TrashDays.None;
      }
      
      if (this.reservations.length > 0) {
        this.filterReservations();
      }
      
      // Remove reservationId from formData (it's not a property field, only used in title bar)
      delete formData.reservationId;
      delete formData.phone;
      
      // Reset reservationId to null BEFORE patching to ensure clean state
      this.form.get('reservationId')?.setValue(null, { emitEvent: false });
      this.selectedReservationId = null;
      
      // Set all values at once without emitting (avoid validation/toast on load)
      this.form.patchValue(formData, { emitEvent: false });
      this.syncDescriptionEditorFromForm();
      this.syncAmenitiesEditorFromForm();
      setTimeout(() => this.syncDescriptionEditorFromForm());
      setTimeout(() => this.syncAmenitiesEditorFromForm());
      this.syncConditionalFieldState();
      this.applyOwnerVendorLeaseValidators();
      this.form.markAsUntouched();
      this.form.markAsPristine();
      this.captureSavedStateSignature();
      this.emitTitleBarContextToShell();
    }
  }

  persistCopiedPropertyInformationAfterPropertyCreate(response: PropertyResponse): Observable<void> {
    if (!this.copiedPropertyInformation) {
      return of(void 0);
    }

    const request = this.buildCopiedPropertyInformationRequest(response.propertyId, response.organizationId);
    return this.propertyInformationService.createPropertyInformation(request).pipe(
      take(1),
      map(() => {
        this.copiedPropertyInformation = null;
        return void 0;
      }),
      catchError(() => {
        this.toastr.error('Property created, but failed to copy Property Information.', CommonMessage.Error);
        return of(void 0);
      })
    );
  }

  buildCopiedPropertyInformationRequest(propertyId: string, organizationId: string): PropertyInformationRequest {
    const copied = this.copiedPropertyInformation;
    return {
      propertyId,
      organizationId,
      arrivalInstructions: copied?.arrivalInstructions || undefined,
      access: copied?.access || undefined,
      mailboxInstructions: copied?.mailboxInstructions || undefined,
      packageInstructions: copied?.packageInstructions || undefined,
      parkingInformation: copied?.parkingInformation || undefined,
      laundry: copied?.laundry || undefined,
      providedFurnishings: copied?.providedFurnishings || undefined,
      housekeeping: copied?.housekeeping || undefined,
      televisionSource: copied?.televisionSource || undefined,
      internetService: copied?.internetService || undefined,
      keyReturn: copied?.keyReturn || undefined,
      concierge: copied?.concierge || undefined,
      maintenanceEmail: copied?.maintenanceEmail || undefined,
      emergencyPhone: copied?.emergencyPhone || undefined,
      additionalNotes: copied?.additionalNotes || undefined,
      welcomeLetter: copied?.welcomeLetter || undefined
    };
  }
  
  applyOfficeControlState(): void {
    const officeControl = this.form?.get('officeId');
    if (!officeControl) {
      return;
    }

    // Only Admins can change a property's office
    if (this.isAdmin) {
      officeControl.enable({ emitEvent: false });
    } else {
      officeControl.disable({ emitEvent: false });
    }
  }

  applyAddModeOfficeValidators(): void {
    const officeControl = this.form?.get('officeId');
    if (!officeControl) {
      return;
    }
    if (this.isAddMode) {
      officeControl.setValidators([Validators.required]);
    } else {
      officeControl.clearValidators();
    }
    officeControl.updateValueAndValidity({ emitEvent: false });
  }

  setAddModeDefaults(): void {
    if (!this.form) return;
    this.form.patchValue({
      propertyCode: this.propertyCodeDefaultPrompt,
      propertyLeaseTypeId: PropertyLeaseType.PropertyManagement,
      vendorId: null,
      unitLevel: 1,
      bldgNo: '',
      checkInTimeId: CheckinTimes.FourPM,
      checkOutTimeId: CheckoutTimes.ElevenAM,
      heating: true,
      ac: true,
      kitchen: true,
      oven: true,
      refrigerator: true,
      microwave: true,
      dishwasher: true,
      tv: true,
      fastInternet: true
    }, { emitEvent: false });
    this.applyOwnerVendorLeaseValidators();
    this.captureSavedStateSignature();
    this.emitTitleBarContextToShell();
  }
  //#endregion

  //#region Validators
  setupPropertyAgreementSyncHandlers(): void {
    if (!this.form) {
      return;
    }
    const syncAgreementFromProperty = () => {
      this.propertyAgreementSection?.syncFromPropertyContext(true);
    };
    this.form.get('unfurnished')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => syncAgreementFromProperty());
    this.form.get('bedrooms')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => syncAgreementFromProperty());
  }

  setupLeaseTypeOwnerVendorValidators(): void {
    this.form.get('propertyLeaseTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyOwnerVendorLeaseValidators();
    });
  }

  applyOwnerVendorLeaseValidators(): void {
    const owner1 = this.form?.get('owner1Id');
    const vendor = this.form?.get('vendorId');
    const leaseCtl = this.form?.get('propertyLeaseTypeId');
    if (!this.form || !owner1 || !vendor || !leaseCtl) {
      return;
    }
    if (this.isOwnerMode) {
      owner1.clearValidators();
      vendor.clearValidators();
      owner1.updateValueAndValidity({ emitEvent: false });
      vendor.updateValueAndValidity({ emitEvent: false });
      return;
    }
    const pm = this.parseIdValue(leaseCtl.value, 0) === PropertyLeaseType.PropertyManagement;
    if (pm) {
      owner1.setValidators([Validators.required]);
      vendor.clearValidators();
    } else {
      owner1.clearValidators();
      vendor.setValidators([Validators.required]);
    }
    owner1.updateValueAndValidity({ emitEvent: false });
    vendor.updateValueAndValidity({ emitEvent: false });
  }

  applyOwnerModeDefaults(): void {
    if (!this.isOwnerMode || !this.form) {
      return;
    }

    this.form.patchValue({ propertyLeaseTypeId: PropertyLeaseType.PropertyManagement }, { emitEvent: false });
    this.syncOwnerPrimaryContactSelection();
    this.applyOwnerVendorLeaseValidators();
  }

  syncOwnerPrimaryContactSelection(): void {
    if (!this.form || !this.isOwnerMode) {
      return;
    }
    const ownerContactId = String(this.ownerPrimaryContactId || '').trim();
    const owner1Control = this.form.get('owner1Id');
    if (!owner1Control) {
      return;
    }
    if (ownerContactId) {
      owner1Control.setValue(ownerContactId, { emitEvent: false });
      return;
    }
    if (this.isAddMode) {
      owner1Control.setValue('', { emitEvent: false });
    }
  }

  bedSelectionValidator(control: AbstractControl): ValidationErrors | null {
    const formGroup = control as FormGroup;
    const bedroomsRaw = formGroup.get('bedrooms')?.value;
    const bedrooms = Number(bedroomsRaw);
    if (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 4) {
      return null;
    }

    const bedValues = [
      Number(formGroup.get('bedroomId1')?.value ?? 0),
      Number(formGroup.get('bedroomId2')?.value ?? 0),
      Number(formGroup.get('bedroomId3')?.value ?? 0),
      Number(formGroup.get('bedroomId4')?.value ?? 0)
    ];

    const requiredBedIndexes: number[] = [];
    const noneRequiredBedIndexes: number[] = [];

    for (let index = 0; index < bedValues.length; index++) {
      const bedNumber = index + 1;
      const bedValue = bedValues[index];
      if (bedNumber <= bedrooms) {
        if (!Number.isFinite(bedValue) || bedValue <= 0) {
          requiredBedIndexes.push(bedNumber);
        }
      } else if (Number.isFinite(bedValue) && bedValue > 0) {
        noneRequiredBedIndexes.push(bedNumber);
      }
    }

    if (requiredBedIndexes.length === 0 && noneRequiredBedIndexes.length === 0) {
      return null;
    }

    return {
      bedSelection: {
        requiredBedIndexes,
        noneRequiredBedIndexes
      }
    };
  }

  propertyCodeEntryValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    return value.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()
      ? { defaultCode: true }
      : null;
  };

  showBedDropdownError(bedNumber: number): boolean {
    if (!this.form) {
      return false;
    }
    const bedSelectionErrors = this.form.errors?.['bedSelection'] as {
      requiredBedIndexes?: number[];
      noneRequiredBedIndexes?: number[];
    } | undefined;
    if (!bedSelectionErrors) {
      return false;
    }

    const isAffected =
      (bedSelectionErrors.requiredBedIndexes || []).includes(bedNumber) ||
      (bedSelectionErrors.noneRequiredBedIndexes || []).includes(bedNumber);
    if (!isAffected) {
      return false;
    }

    return !!(this.form.get('bedrooms')?.touched || this.form.get(`bedroomId${bedNumber}`)?.touched);
  }
  //#endregion

  //#region Owner/Vendor Dialog
  isPropertyCodeMissingForAdd(): boolean {
    if (!this.isAddMode || !this.form) {
      return false;
    }
    const raw = String(this.form.get('propertyCode')?.value ?? '').trim();
    if (!raw) {
      return true;
    }
    return raw.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase();
  }

  openPropertyCodeDialog(): Observable<string | null> {
    const ref = this.dialog.open(PropertyCodeDialogComponent, {
      width: '28rem',
      maxWidth: '95vw'
    });
    return ref.afterClosed().pipe(
      map((r: PropertyCodeDialogResult | undefined) => {
        const c = r?.code?.trim();
        return c ? c.toUpperCase() : null;
      })
    );
  }

  getNewContactPreselectOptions(): Pick<NewContactDialogOptions, 'preselectPropertyOfficeId' | 'preselectPropertyCodes'> {
    if (!this.isAddMode || !this.form) {
      return {};
    }
    const rawCode = String(this.form.get('propertyCode')?.value ?? '').trim();
    if (!rawCode || rawCode.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()) {
      return {};
    }
    const officeId =
      this.form.getRawValue().officeId ??
      this.property?.officeId ??
      this.offices[0]?.officeId ??
      null;
    if (officeId == null || officeId === '') {
      return {};
    }
    return {
      preselectPropertyCodes: [rawCode.toUpperCase()],
      preselectPropertyOfficeId: Number(officeId)
    };
  }

  withPropertyCodeForNewContact(openContact: () => void): void {
    if (!this.isPropertyCodeMissingForAdd()) {
      openContact();
      return;
    }
    this.openPropertyCodeDialog().pipe(take(1)).subscribe(code => {
      if (code == null) {
        return;
      }
      this.applyTitleBarPropertyCode(code);
      openContact();
    });
  }

  openNewContactForProperty(entityTypeId: number, applySavedContact: (contactId: string) => void): void {
    this.newContactDialogService.openNewContactDialog({
      entityTypeId,
      ...this.getNewContactPreselectOptions()
    }).pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }
      applySavedContact(result.contactId);
    });
  }

  openNewOwnerDialog(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    this.withPropertyCodeForNewContact(() =>
      this.openNewContactForProperty(EntityType.Owner, contactId =>
        this.form.patchValue({ [ownerField]: contactId }, { emitEvent: false })
      )
    );
  }

  openNewVendorDialog(): void {
    this.withPropertyCodeForNewContact(() =>
      this.openNewContactForProperty(EntityType.Vendor, contactId =>
        this.form.patchValue({ vendorId: contactId }, { emitEvent: false })
      )
    );
  }

  openEditOwnerDialog(contactId: string): void {
    if (!contactId || this.newContactDialogService.isNewContactOptionValue(contactId, EntityType.Owner)) return;

    this.contactService.getContactByGuid(contactId).pipe(take(1)).subscribe({
      next: (contact) => {
        this.newContactDialogService.openEditContactDialog({
          contact,
          entityTypeId: EntityType.Owner
        }).pipe(take(1)).subscribe();
      },
      error: () => {
        this.toastr.error('Failed to load contact.');
      }
    });
  }

  onPropertyTypeDropdownChange(value: string | number | null): void {
    const control = this.form.get('propertyType');
    control?.setValue(value == null ? null : Number(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onOwnerDropdownChange(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id', value: string | number | null): void {
    const normalizedValue = value === null || value === undefined ? (ownerField === 'owner1Id' ? '' : null) : String(value);
    const control = this.form.get(ownerField);
    control?.setValue(normalizedValue);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onVendorDropdownChange(value: string | number | null): void {
    const control = this.form.get('vendorId');
    const normalized = value == null || value === '' ? null : String(value);
    control?.setValue(normalized);
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onNumericDropdownChange(controlName: string, value: string | number | null): void {
    const control = this.form.get(controlName);
    control?.setValue(value == null || value === '' ? null : Number(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onOwnerNameClick(event: Event, ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): void {
    event.preventDefault();
    event.stopPropagation();
    const value = this.form?.get(ownerField)?.value;
    if (value && !this.newContactDialogService.isNewContactOptionValue(value, EntityType.Owner)) {
      this.openEditOwnerDialog(value);
    }
  }

  hasOwnerSelected(ownerField: 'owner1Id' | 'owner2Id' | 'owner3Id'): boolean {
    const value = this.form?.get(ownerField)?.value;
    return !!value && !this.newContactDialogService.isNewContactOptionValue(value, EntityType.Owner);
  }
  //#endregion

  //#region Title Bar context 
  emitTitleBarContextToShell(): void {
    if (!this.form) {
      return;
    }
    const officeRaw = this.form.get('officeId')?.value;
    const resRaw = this.form.get('reservationId')?.value ?? this.selectedReservationId;
    const codeRaw = this.form.get('propertyCode')?.value;
    this.titleBarContextChange.emit({
      globalOfficeId: this.selectedOffice?.officeId ?? this.globalSelectionService.getSelectedOfficeIdValue() ?? null,
      officeId: officeRaw == null || officeRaw === '' ? null : Number(officeRaw),
      reservationId: resRaw == null || resRaw === '' ? null : String(resRaw),
      propertyCode: codeRaw == null || codeRaw === undefined ? null : (String(codeRaw).trim() === '' ? null : String(codeRaw).trim())
    });
  }

  initializeOfficeFromShell(officeId: number | null): void {
    if (!this.isAddMode) {
      return;
    }
    this.applyTitleBarPropertyOfficeSelection(officeId);
  }

  applyTitleBarPropertyOfficeSelection(value: string | number | null): void {
    const nextId = value == null || value === '' ? null : Number(value);
    const cur = this.form.get('officeId')?.value;
    const curNum = cur == null || cur === '' ? null : Number(cur);
    if (nextId === curNum) {
      return;
    }
    const control = this.form.get('officeId');
    control?.setValue(nextId, { emitEvent: false });
    control?.updateValueAndValidity({ emitEvent: false });
    this.resolveOfficeScope(nextId);
    this.onOfficeChange();
    this.emitTitleBarContextToShell();
  }

  touchAllFormControls(control: AbstractControl): void {
    if (control instanceof FormGroup) {
      Object.keys(control.controls).forEach(key => this.touchAllFormControls(control.controls[key]));
      return;
    }

    control.markAsTouched();
    control.markAsDirty();
  }

  applyTitleBarReservationSelection(value: string | number | null): void {
    const normalizedId = value == null || value === '' ? null : String(value);
    this.selectedReservationId = normalizedId;
    this.form.get('reservationId')?.setValue(normalizedId, { emitEvent: false });
    this.emitTitleBarContextToShell();
  }

  applyTitleBarPropertyCode(upperValue: string): void {
    this.form.patchValue({ propertyCode: upperValue }, { emitEvent: false });
    this.form.get('propertyCode')?.markAsDirty();
    this.form.get('propertyCode')?.markAsTouched();
    this.emitTitleBarContextToShell();
  }

  applyShellPropertyCodeContext(): void {
    if (!this.isAddMode || !this.form) {
      return;
    }
    const rawCode = String(this.shellPropertyCode ?? '').trim();
    if (!rawCode) {
      return;
    }
    this.applyTitleBarPropertyCode(rawCode.toUpperCase());
  }

  applyShellOfficeContext(): void {
    if (this.shellMode || !this.form || !this.isAddMode) {
      return;
    }
    const officeId = Number(this.shellOfficeId);
    if (!Number.isFinite(officeId) || officeId <= 0) {
      return;
    }
    this.applyTitleBarPropertyOfficeSelection(officeId);
  }

  applyShellPropertyAddressContext(): void {
    if (!this.form || !this.isAddMode) {
      return;
    }
    const address1 = String(this.shellPropertyAddress1 ?? '').trim();
    const city = String(this.shellPropertyCity ?? '').trim();
    const state = String(this.shellPropertyState ?? '').trim().toUpperCase();
    const zip = String(this.shellPropertyZip ?? '').trim();
    if (!address1 && !city && !state && !zip) {
      this.form.patchValue({ address1: '', city: '', state: '', zip: '' }, { emitEvent: false });
      return;
    }
    const patch: Record<string, string> = {};
    const currentAddress1 = String(this.form.get('address1')?.value ?? '').trim();
    const currentCity = String(this.form.get('city')?.value ?? '').trim();
    const currentState = String(this.form.get('state')?.value ?? '').trim();
    const currentZip = String(this.form.get('zip')?.value ?? '').trim();
    if (address1 && !currentAddress1) {
      patch['address1'] = address1;
    }
    if (city && !currentCity) {
      patch['city'] = city;
    }
    if (state && !currentState) {
      patch['state'] = state;
    }
    if (zip && !currentZip) {
      patch['zip'] = zip;
    }
    if (Object.keys(patch).length === 0) {
      return;
    }
    this.form.patchValue(patch, { emitEvent: false });
    this.form.get('address1')?.markAsTouched();
    this.form.get('city')?.markAsTouched();
    this.form.get('state')?.markAsTouched();
    this.form.get('zip')?.markAsTouched();
  }
  //#endregion

  //#region Getter Methods
  get isPropertyManagementLease(): boolean {
    if (!this.form) {
      return true;
    }
    return this.parseIdValue(this.form.get('propertyLeaseTypeId')?.value, 0) === PropertyLeaseType.PropertyManagement;
  }

  get showNoticeToVacateField(): boolean {
    if (!this.form) {
      return false;
    }
    const leaseTypeId = this.parseIdValue(this.form.get('propertyLeaseTypeId')?.value, 0);
    return leaseTypeId === PropertyLeaseType.Direct || leaseTypeId === PropertyLeaseType.ThirdParty;
  }

  get ownerContacts(): ContactResponse[] {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) return [];
    return this.contacts.filter(c => Number(c.officeId) === Number(officeId));
  }

  get vendorContactsForOffice(): ContactResponse[] {
    const officeId = this.form?.get('officeId')?.value;
    if (!officeId) return [];
    return this.contactService
      .getAllContactsValue()
      .filter(c =>
        c.entityTypeId === EntityType.Vendor
        && this.utilityService.contactHasOfficeAccess(c, Number(officeId)));
  }

  get ownerOptions(): SearchableSelectOption[] {
    return [
      this.newContactDialogService.buildSearchableSelectOption(EntityType.Owner),
      ...this.ownerContacts.map(contact => ({ value: contact.contactId, label: contact.fullName ?? '' }))
    ];
  }

  get vendorOptions(): SearchableSelectOption[] {
    return [
      this.newContactDialogService.buildSearchableSelectOption(EntityType.Vendor),
      ...this.vendorContactsForOffice.map(contact => ({
        value: contact.contactId,
        label: this.utilityService.getVendorDropdownLabel(contact)
      }))
    ];
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({ value: office.officeId, label: office.name }));
  }

  get bedSizeOptionsWithNone(): SearchableSelectOption[] {
    return [{ value: 0, label: 'None' }, ...this.bedSizeTypes];
  }

  get regionOptions(): { value: number, label: string }[] {
    return this.regions.map(region => ({ value: region.regionId, label: `${region.regionCode} - ${region.name}` }));
  }

  get areaOptions(): { value: number, label: string }[] {
    return this.areas.map(area => ({ value: area.areaId, label: `${area.areaCode} - ${area.name}` }));
  }

  get buildingOptions(): { value: number, label: string }[] {
    return this.buildings.map(building => ({ value: building.buildingId, label: `${building.buildingCode} - ${building.name}` }));
  }

  get sharedPropertyOfficeId(): number | null {
    return this.form?.get('officeId')?.value ?? this.property?.officeId ?? null;
  }

  get sharedPropertyCode(): string | null {
    const formCode = this.form?.get('propertyCode')?.value;
    if (typeof formCode === 'string') {
      const normalized = formCode.trim();
      return normalized === '' ? null : normalized;
    }
    return this.property?.propertyCode ?? null;
  }

  get showTitleBarOfficeError(): boolean {
    const control = this.form?.get('officeId');
    return this.isAddMode && !!(control?.invalid && control?.touched);
  }

  get showTitleBarPropertyCodeError(): boolean {
    if (!this.isAddMode || !this.form) {
      return false;
    }
    const c = this.form.get('propertyCode');
    return !!(c?.invalid && c.touched);
  }

  //#endregion

  //#region Formatting Handlers
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    const input = event.target as HTMLInputElement;
    input.select();
  }
  //#endregion

  //#region Setup and Initialize
  setupOwnerSelectionHandlers(): void {
    const ownerFields: ('owner1Id' | 'owner2Id' | 'owner3Id')[] = ['owner1Id', 'owner2Id', 'owner3Id'];
    ownerFields.forEach(ownerField => {
      this.form.get(ownerField)?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
        if (this.newContactDialogService.isNewContactOptionValue(value, EntityType.Owner)) {
          const emptyValue = ownerField === 'owner1Id' ? '' : null;
          this.form.patchValue({ [ownerField]: emptyValue }, { emitEvent: false });
          this.openNewOwnerDialog(ownerField);
        }
      });
    });
  }

  setupVendorSelectionHandlers(): void {
    this.form.get('vendorId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.newContactDialogService.isNewContactOptionValue(value, EntityType.Vendor)) {
        this.form.patchValue({ vendorId: null }, { emitEvent: false });
        this.openNewVendorDialog();
      }
    });
  }

  setupConditionalFields(): void {
    // Subscribe to parking checkbox changes to enable/disable parkingNotes field
    this.form.get('parking')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const parkingNotesControl = this.form.get('parkingNotes');
      if (parkingNotesControl) {
        if (value) {
          parkingNotesControl.enable();
        } else {
          parkingNotesControl.disable();
          parkingNotesControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Subscribe to petsAllowed checkbox changes to enable/disable pet-related fields
    this.form.get('petsAllowed')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const dogsOkayControl = this.form.get('dogsOkay');
      const catsOkayControl = this.form.get('catsOkay');
      const poundLimitControl = this.form.get('poundLimit');
      
      if (dogsOkayControl) {
        if (value) {
          dogsOkayControl.enable();
        } else {
          dogsOkayControl.disable();
          dogsOkayControl.setValue(false, { emitEvent: false });
        }
      }
      
      if (catsOkayControl) {
        if (value) {
          catsOkayControl.enable();
        } else {
          catsOkayControl.disable();
          catsOkayControl.setValue(false, { emitEvent: false });
        }
      }
      
      if (poundLimitControl) {
        if (value) {
          poundLimitControl.enable();
        } else {
          poundLimitControl.disable();
          poundLimitControl.setValue('', { emitEvent: false });
        }
      }
    });

    // Set initial state based on current values
    this.syncConditionalFieldState();
  }

  syncConditionalFieldState(): void {
    const parkingValue = this.form.get('parking')?.value;
    const petsAllowedValue = this.form.get('petsAllowed')?.value;

    if (parkingValue) {
      this.form.get('parkingNotes')?.enable({ emitEvent: false });
    } else {
      this.form.get('parkingNotes')?.disable({ emitEvent: false });
      this.form.get('parkingNotes')?.setValue('', { emitEvent: false });
    }

    if (petsAllowedValue) {
      this.form.get('dogsOkay')?.enable({ emitEvent: false });
      this.form.get('catsOkay')?.enable({ emitEvent: false });
      this.form.get('poundLimit')?.enable({ emitEvent: false });
    } else {
      this.form.get('dogsOkay')?.disable({ emitEvent: false });
      this.form.get('dogsOkay')?.setValue(false, { emitEvent: false });
      this.form.get('catsOkay')?.disable({ emitEvent: false });
      this.form.get('catsOkay')?.setValue(false, { emitEvent: false });
      this.form.get('poundLimit')?.disable({ emitEvent: false });
      this.form.get('poundLimit')?.setValue('', { emitEvent: false });
    }
  }

  initializeTrashDays(): void {
    this.trashDays = Object.keys(TrashDays)
      .filter(key => !isNaN(Number(TrashDays[key])))
      .map(key => ({ value: Number(TrashDays[key]), label: key })); 
  }

  initializePropertyStyles(): void {
    this.propertyStyles = getPropertyStyles();
  }

  initializePropertyStatuses(): void {
    this.propertyStatuses = getPropertyStatuses();
  }

  initializePropertyTypes(): void {
    this.propertyTypes = getPropertyTypes();
  }

  initializeBedSizeTypes(): void {
    this.bedSizeTypes = getBedSizeTypes();
  }

  initializeTimeTypes(): void {
    this.checkInTimes = getCheckInTimes();
    this.checkOutTimes = getCheckOutTimes();
  }

  initializeReservationNotices(): void {
    this.reservationNoticeOptions = getReservationNotices();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.contacts = (contacts || []).filter(c => c.entityTypeId === EntityType.Owner);
        });
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'))).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = (offices || []).filter(f => f.organizationId === this.organizationId && f.isActive);
          this.showOfficeDropdown = this.offices.length > 1;
          if (!this.shellMode) {
            this.resolveOfficeScope(
              this.isAddMode ? this.globalSelectionService.getSelectedOfficeIdValue() : null
            );
          } else if (!this.isAddMode && this.property?.officeId) {
            this.resolveOfficeScope(this.property.officeId);
          }

          if (!this.officesInitialized) {
            this.officesInitialized = true;
            if (this.property && this.form) {
              this.form.patchValue({
                officeId: this.property.officeId || null,
                regionId: this.property.regionId || null,
                areaId: this.property.areaId || null,
                buildingId: this.property.buildingId || null,
              }, { emitEvent: false });
              this.filterReservations();
            }
          }

          this.filterLocationLookupsByOffice();
          this.emitTitleBarContextToShell();
        });
      },
      error: () => {
        this.offices = [];
        this.selectedOffice = null;
        this.showOfficeDropdown = false;
        this.form?.patchValue({ officeId: null }, { emitEvent: false });
        this.emitTitleBarContextToShell();
      }
    });
  }

  loadRegions(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allRegionsByOrg = [];
      this.regions = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions');
      return;
    }

    this.regionService.getRegions().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'regions'); })).subscribe({
      next: (regions) => {
        this.allRegionsByOrg = (regions || []).filter(r => r.organizationId === orgId && r.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allRegionsByOrg = [];
        this.regions = [];
      }
    });
  }

  loadAreas(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allAreasByOrg = [];
      this.areas = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas');
      return;
    }

    this.areaService.getAreas().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'areas'); })).subscribe({
      next: (areas) => {
        this.allAreasByOrg = (areas || []).filter(a => a.organizationId === orgId && a.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allAreasByOrg = [];
        this.areas = [];
      }
    });
  }

  loadBuildings(): void {
    const orgId = (this.authService.getUser()?.organizationId || '').trim();
    if (!orgId) {
      this.allBuildingsByOrg = [];
      this.buildings = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
      return;
    }

    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (buildings) => {
        this.allBuildingsByOrg = (buildings || []).filter(b => b.isActive);
        this.filterLocationLookupsByOffice();
      },
      error: () => {
        this.allBuildingsByOrg = [];
        this.buildings = [];
      }
    });
  }

  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.states = [...cachedStates];
      return;
    }
    
    this.commonService.getStates().pipe(filter(states => states && states.length > 0),take(1)).subscribe({
      next: (states) => {
        this.states = [...states];
      },
      error: () => {
        // States are handled globally, ignore
      }
    });
  }

  loadReservations(): void {
    if (this.isAddMode || !this.propertyId) {
      // In add mode, no reservations to load
      this.reservations = [];
      this.availableReservations = [];
      return;
    }
    
    // In edit mode, load reservations for this property only
    this.reservationService.getReservationsByPropertyId(this.propertyId).pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
        this.emitTitleBarContextToShell();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
        this.emitTitleBarContextToShell();
      }
    });
  }
  //#endregion

  //#region Building amenity sync from selection
  setupBuildingAmenitySyncFromSelection(): void {
    this.form.get('buildingId')?.valueChanges.pipe(distinctUntilChanged(), takeUntil(this.destroy$)).subscribe(buildingId => {
      if (buildingId != null && typeof buildingId === 'number') {
        const building = this.allBuildingsByOrg.find(b => b.buildingId === buildingId);
        if (building) {
          this.applyBuildingAmenitiesToPropertyForm(building);
        }
      }
    });
  }

  applyBuildingAmenitiesToPropertyForm(building: BuildingResponse): void {
    const patch = this.mappingService.mapBuildingAmenitiesToPropertyFormPatch(building);
    this.form.patchValue(patch, { emitEvent: false });
    this.syncConditionalFieldState();
  }
  //#endregion

  //#region Form Response Methods
  onPanelOpened(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = true;
    if (section === 'description') {
      setTimeout(() => this.syncDescriptionEditorFromForm());
    }
    if (section === 'features') {
      setTimeout(() => this.syncAmenitiesEditorFromForm());
    }
  }

  onPanelClosed(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = false;
  }

  filterReservations(): void {
    const rawOfficeId = this.form?.getRawValue()?.officeId ?? this.form?.get('officeId')?.value ?? this.property?.officeId ?? null;
    const officeId = rawOfficeId == null || rawOfficeId === '' ? null : Number(rawOfficeId);
    if (officeId == null || Number.isNaN(officeId)) {
      this.availableReservations = [];
      return;
    }

    const filteredReservations = this.reservations.filter(r => Number(r.officeId) === officeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.contacts.find(c => c.contactId === r.contactId) ?? null)
    }));
  }

  onOfficeChange(): void {
    this.form.get('officeId')?.markAsDirty();
    this.filterLocationLookupsByOffice();
    this.filterReservations();
    this.form.get('reservationId')?.setValue(null, { emitEvent: false });
    this.selectedReservationId = null;

    // In Add mode, enforce owner-office consistency by clearing owner selections
    // whenever office changes.
    if (this.isAddMode && !this.isOwnerMode) {
      this.form.patchValue({
        owner1Id: '',
        owner2Id: null,
        owner3Id: null,
        vendorId: null
      }, { emitEvent: false });
    }
  }

  onPropertyCodeFocus(event: FocusEvent): void {
    if (!this.isAddMode) {
      return;
    }
    const input = event.target as HTMLInputElement | null;
    const currentValue = String(this.form?.get('propertyCode')?.value ?? '').trim();
    if (input && currentValue.toLowerCase() === this.propertyCodeDefaultPrompt.toLowerCase()) {
      input.select();
    }
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  formatCoordinateValue(value: number | string | null | undefined, defaultValue: string): string {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return defaultValue;
    }
    return num.toFixed(8).replace(/\.?0+$/, '') || String(num);
  }

  parseCoordinateValue(value: string | number | null | undefined, defaultValue: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return defaultValue;
    }
    return parsed;
  }

  filterLocationLookupsByOffice(): void {
    const officeId = this.form?.get('officeId')?.value ?? null;
    const officeNum = officeId != null ? Number(officeId) : null;

    this.regions = officeNum != null ? this.allRegionsByOrg.filter(r => Number(r.officeId) === officeNum) : [];
    this.areas = officeNum != null ? this.allAreasByOrg.filter(a => Number(a.officeId) === officeNum) : [];
    this.buildings = officeNum != null ? this.allBuildingsByOrg.filter(b => Number(b.officeId) === officeNum) : [];

    if (!this.form) return;
    const regionId = this.form.get('regionId')?.value;
    const areaId = this.form.get('areaId')?.value;
    const buildingId = this.form.get('buildingId')?.value;
    const updates: { regionId?: number | null; areaId?: number | null; buildingId?: number | null } = {};
    if (regionId != null && !this.regions.some(r => r.regionId === regionId)) {
      updates.regionId = null;
    }
    if (areaId != null && !this.areas.some(a => a.areaId === areaId)) {
      updates.areaId = null;
    }
    if (buildingId != null && !this.buildings.some(b => b.buildingId === buildingId)) {
      updates.buildingId = null;
    }
    if (Object.keys(updates).length > 0) {
      this.form.patchValue(updates, { emitEvent: false });
    }
  }

    onDescriptionInput(event: Event): void {
    const element = event.target as HTMLDivElement;
    const descriptionControl = this.form.get('description');
    descriptionControl?.setValue(element.innerHTML, { emitEvent: false });
    descriptionControl?.markAsDirty();
    descriptionControl?.markAsTouched();
  }

  applyDescriptionFormat(format: 'bold' | 'italic' | 'underline' | 'paragraph' | 'unorderedList'): void {
    const editor = this.descriptionEditor?.nativeElement;
    if (!editor) {
      return;
    }

    editor.focus();
    if (format === 'paragraph') {
      // Force a visible new paragraph break at caret.
      const inserted = document.execCommand('insertParagraph', false);
      if (!inserted) {
        document.execCommand('insertHTML', false, '<p><br></p>');
      }
      this.form.get('description')?.setValue(editor.innerHTML);
      return;
    }

    if (format === 'unorderedList') {
      this.applyUnorderedListCommand(editor);
      this.form.get('description')?.setValue(editor.innerHTML);
      return;
    }

    document.execCommand(format, false);
    this.form.get('description')?.setValue(editor.innerHTML);
  }

  onAmenitiesInput(event: Event): void {
    const element = event.target as HTMLDivElement;
    const amenitiesControl = this.form.get('amenities');
    amenitiesControl?.setValue(element.innerHTML, { emitEvent: false });
    amenitiesControl?.markAsDirty();
    amenitiesControl?.markAsTouched();
  }

  applyAmenitiesFormat(format: 'bold' | 'italic' | 'underline' | 'paragraph' | 'unorderedList'): void {
    const editor = this.amenitiesEditor?.nativeElement;
    if (!editor) {
      return;
    }

    editor.focus();
    if (format === 'paragraph') {
      const inserted = document.execCommand('insertParagraph', false);
      if (!inserted) {
        document.execCommand('insertHTML', false, '<p><br></p>');
      }
      this.form.get('amenities')?.setValue(editor.innerHTML);
      return;
    }

    if (format === 'unorderedList') {
      this.applyUnorderedListCommand(editor);
      this.form.get('amenities')?.setValue(editor.innerHTML);
      return;
    }

    document.execCommand(format, false);
    this.form.get('amenities')?.setValue(editor.innerHTML);
  }

  preventEditorToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  applyUnorderedListCommand(editor: HTMLDivElement): void {
    editor.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const listItems = selectedText
      .split(/\r?\n+/)
      .map(item => item.trim())
      .filter(item => !!item);
    if (listItems.length > 0) {
      const listHtml = `<ul>${listItems.map(item => `<li>${this.escapeEditorHtml(item)}</li>`).join('')}</ul>`;
      document.execCommand('insertHTML', false, listHtml);
      return;
    }

    if (!selection || selection.rangeCount === 0) {
      document.execCommand('insertHTML', false, '<ul><li><br></li></ul>');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    document.execCommand('insertHTML', false, '<ul><li><br></li></ul>');
  }

  parseIdValue(value: unknown, fallback: number = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  escapeEditorHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  applyPropertyIdContext(id: string): void {
    this.isServiceError = false;
    this.propertyId = id;
    this.isAddMode = id === 'new';
    this.expandedSections.agreement = this.canShowPropertyAgreement;

    const codeControl = this.form.get('propertyCode');
    if (this.isAddMode) {
      codeControl?.setValidators([Validators.required, this.propertyCodeEntryValidator]);
    } else {
      codeControl?.clearValidators();
    }
    codeControl?.updateValueAndValidity();
    this.applyOwnerVendorLeaseValidators();
    this.applyOfficeControlState();
    this.applyAddModeOfficeValidators();

    if (!this.isAddMode) {
      this.appliedCopyFromPropertyId = null;
      this.getProperty();
    } else {
      this.setAddModeDefaults();
      this.tryApplyCopyFromProperty();
    }
    this.loadReservations();
    this.captureSavedStateSignature();
  }

  tryApplyCopyFromProperty(): void {
    if (!this.isAddMode) {
      return;
    }

    const copyFromPropertyId = this.pendingCopyFromPropertyId;
    if (!copyFromPropertyId || copyFromPropertyId === this.appliedCopyFromPropertyId) {
      return;
    }

    this.appliedCopyFromPropertyId = copyFromPropertyId;
    this.copyFromProperty(copyFromPropertyId);
  }
  //#endregion

  //#region Save Tracking Methods
  captureSavedStateSignature(): void {
    if (!this.form) {
      return;
    }
    this.savedFormState = this.cloneFormState(this.form.getRawValue() as Record<string, unknown>);
    this.form?.markAsPristine();
    this.form?.markAsUntouched();
  }

  hasUnsavedChanges(): boolean {
    if (this.isSubmitting) {
      return false;
    }
    return !!this.form?.dirty || !!this.propertyAgreementSection?.isAgreementDirty;
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      return this.savePropertyAndWait();
    }
    this.discardUnsavedChanges();
    return true;
  }

  canDeactivate(): Promise<boolean> | boolean {
    return this.confirmNavigationWithUnsavedChanges();
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  savePropertyAndWait(): Promise<boolean> {
    return new Promise(resolve => this.saveProperty(resolve));
  }

  discardUnsavedChanges(): void {
    if (!this.form || !this.savedFormState) {
      return;
    }

    this.form.reset(this.cloneFormState(this.savedFormState), { emitEvent: false });
    this.syncDescriptionEditorFromForm();
    this.syncAmenitiesEditorFromForm();
    this.applyOfficeControlState();
    this.applyOwnerVendorLeaseValidators();
    this.syncConditionalFieldState();

    const officeId = this.form.get('officeId')?.value;
    this.resolveOfficeScope(officeId == null ? null : Number(officeId));
    this.filterLocationLookupsByOffice();
    this.filterReservations();

    const reservationId = this.form.get('reservationId')?.value;
    this.selectedReservationId = reservationId == null ? null : String(reservationId);

    this.form.markAsPristine();
    this.form.markAsUntouched();

    this.propertyAgreementSection?.discardAndReloadIfDirty();
    this.emitTitleBarContextToShell();
  }

  cloneFormState<T>(state: T): T {
    return structuredClone(state);
  }

  getApiErrorMessage(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const payload = error.error;
    if (typeof payload === 'string') {
      const text = payload.trim();
      return text.length > 0 ? text : null;
    }
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const errors = record['errors'];
    if (errors && typeof errors === 'object') {
      const flattened: string[] = [];
      const errorMap = errors as Record<string, unknown>;
      for (const key of Object.keys(errorMap)) {
        const value = errorMap[key];
        if (Array.isArray(value)) {
          const first = value.find(item => typeof item === 'string' && item.trim().length > 0);
          if (typeof first === 'string') {
            flattened.push(`${key}: ${first}`);
          }
        } else if (typeof value === 'string' && value.trim().length > 0) {
          flattened.push(`${key}: ${value.trim()}`);
        }
      }
      if (flattened.length > 0) {
        return flattened.join(' | ');
      }
    }
    const message = typeof record['message'] === 'string' ? record['message'].trim() : '';
    if (message) {
      return message;
    }
    const title = typeof record['title'] === 'string' ? record['title'].trim() : '';
    if (title) {
      return title;
    }
    return null;
  }
  //#endregion

  //#region Utility Methods
  syncDescriptionEditorFromForm(): void {
    const editor = this.descriptionEditor?.nativeElement;
    if (!editor) {
      return;
    }

    const description = this.form?.get('description')?.value ?? '';
    const nextHtml = typeof description === 'string' ? description : String(description);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }

  syncAmenitiesEditorFromForm(): void {
    const editor = this.amenitiesEditor?.nativeElement;
    if (!editor) {
      return;
    }

    const amenities = this.form?.get('amenities')?.value ?? '';
    const nextHtml = typeof amenities === 'string' ? amenities : String(amenities);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }

  quickInsertCodeSymbol(controlName: string, symbol: string): void {
    const codeControl = this.form.get(controlName);
    if (!codeControl) {
      return;
    }

    const currentValue = String(codeControl.value ?? '');
    const nextValue = `${currentValue}${symbol}`.slice(0, 20);
    codeControl.setValue(nextValue);
    codeControl.markAsDirty();
    codeControl.markAsTouched();
  }

  toggleCodePalette(controlName: string, event: Event): void {
    event.stopPropagation();
    this.codePaletteTargetControl = this.codePaletteTargetControl === controlName ? null : controlName;
  }

  insertCodePaletteSymbol(symbol: string, event?: Event): void {
    event?.stopPropagation();
    if (!this.codePaletteTargetControl) {
      return;
    }

    this.quickInsertCodeSymbol(this.codePaletteTargetControl, symbol);
    this.clearCodePaletteTarget();
  }

  clearCodePaletteTarget(): void {
    this.codePaletteTargetControl = null;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.clearCodePaletteTarget();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

