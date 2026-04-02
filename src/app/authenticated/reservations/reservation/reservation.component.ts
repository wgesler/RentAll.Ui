import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, filter, finalize, firstValueFrom, map, of, skip, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceListComponent } from '../../accounting/invoice-list/invoice-list.component';
import { TransactionType } from '../../accounting/models/accounting-enum';
import { CostCodesResponse } from '../../accounting/models/cost-codes.model';
import { CostCodesService } from '../../accounting/services/cost-codes.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactComponent } from '../../contacts/contact/contact.component';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { AgentResponse } from '../../organizations/models/agent.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AgentService } from '../../organizations/services/agent.service';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { CheckinTimes, CheckoutTimes, getCheckInTimes, getCheckOutTimes, normalizeCheckInTimeId, normalizeCheckOutTimeId } from '../../properties/models/property-enums';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitlebarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { LeaseComponent } from '../lease/lease.component';
import { BillingMethod, BillingType, DepositType, Frequency, ProrateType, ReservationNotice, ReservationStatus, ReservationType, getBillingMethods, getBillingTypes, getDepositTypes, getFrequencies, getProrateTypes, getReservationNotices, getReservationStatuses, getReservationTypes } from '../models/reservation-enum';
import { ExtraFeeLineRequest, ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';
import { LeaseReloadService } from '../services/lease-reload.service';
import { ReservationService } from '../services/reservation.service';

// Display interface for ExtraFeeLine in the UI
interface ExtraFeeLineDisplay {
  extraFeeLineId: string | null;
  feeDescription: string | null;
  feeAmount: number | undefined;
  feeFrequencyId: number | undefined;
  costCodeId: number | undefined;
  isNew?: boolean; // Track if this is a new line
}

@Component({
    standalone: true,
    selector: 'app-reservation',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, TitlebarSelectComponent, LeaseComponent, DocumentListComponent, EmailListComponent, InvoiceListComponent],
    templateUrl: './reservation.component.html',
    styleUrl: './reservation.component.scss'
})

export class ReservationComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('reservationDocumentList') reservationDocumentList?: DocumentListComponent;
  @ViewChild('reservationEmailList') reservationEmailList?: EmailListComponent;
  
  isServiceError: boolean = false;
  selectedTabIndex: number = 0;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  propertyPanelOpen: boolean = true;
  billingPanelOpen: boolean = true;
  ReservationType = ReservationType; // Expose enum to template
  EntityType = EntityType; // Expose enum to template
  DocumentType = DocumentType; // Expose enum to template
  EmailType = EmailType; // Expose enum to template
  departureDateStartAt: Date | null = null;
  checkInTimes: { value: number, label: string }[] = [];
  checkOutTimes: { value: number, label: string }[] = [];
  availableClientTypes: { value: number, label: string }[] = [];
  availableBillingTypes: { value: number, label: string }[] = [];
  availableBillingMethods: { value: number, label: string }[] = [];
  availableProrateTypes: { value: number, label: string }[] = [];
  availableFrequencies: { value: number, label: string }[] = [];
  availableReservationNotices: { value: number, label: string }[] = [];
  availableDepositTypes: { value: number, label: string }[] = [];
  allReservationStatuses: { value: number, label: string }[] = [];
  availableReservationStatuses: { value: number, label: string }[] = [];

  reservationId: string;
  reservation: ReservationResponse;
  organization: OrganizationResponse | null = null;
  agents: AgentResponse[] = [];
  contacts: ContactResponse[] = [];
  companyContacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  selectedContact: ContactResponse | null = null;
  properties: PropertyListResponse[] = [];
  availableProperties: PropertyListResponse[] = [];
  selectedProperty: PropertyListResponse | null = null;
  reservationList: ReservationListResponse[] = [];
  availableHeaderReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedHeaderReservationId: string | null | undefined = undefined;
  organizationId: string = '';
  preferredOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  contactsSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  handlersSetup: boolean = false;
  
  extraFeeLines: ExtraFeeLineDisplay[] = [];
  
  chargeCostCodes: CostCodesResponse[] = [];
  availableChargeCostCodes: { value: number, label: string }[] = [];
  costCodesSubscription?: Subscription;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'properties', 'contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  readonly tabParamToIndex: Record<string, number> = {
    lease: 1,
    invoices: 2,
    email: 3,
    documents: 4
  };
  readonly newContactOptionValue = '__new_contact__';
  lastSavedStateSignature = '';
  hasSavedStateSignature = false;

  constructor(
    public reservationService: ReservationService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private agentService: AgentService,
    private officeService: OfficeService,
    private commonService: CommonService,
    private authService: AuthService,
    public formatterService: FormatterService,
    private dialog: MatDialog,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private costCodesService: CostCodesService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService
  ) {
  }

  //#region Reservation Page
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
    this.loadContacts();  
    this.loadOrganization();
    this.loadProperties();
    this.loadAgents();
    this.loadOffices();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0 && this.isAddMode) {
        this.resolveOfficeScope(officeId);
        if (this.selectedOffice) {
          this.loadCostCodes();
        }
        this.filterPropertiesByOffice();
      }
    });

    // Initialize form immediately to prevent template errors
    this.buildForm();
    
    // Get route params first
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      this.reservationId = paramMap.get('id') || null;
      this.isAddMode = !this.reservationId || this.reservationId === 'new';
      if (!this.isAddMode && this.reservationId) {
        this.selectedHeaderReservationId = this.reservationId;
      }
      
      if (this.isAddMode) {
        this.billingPanelOpen = false;
        this.updatePetFields();
        this.updateMaidServiceFields();
        this.extraFeeLines = [];
      }
    });
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
        this.selectedTabIndex = this.getTabIndexFromQueryParam(queryParams['tab']);
        
        if (queryParams['officeId'] && this.isAddMode && this.offices.length > 0) {
          const officeId = parseInt(queryParams['officeId'], 10);
          if (!isNaN(officeId)) {
            this.resolveOfficeScope(officeId);
            if (this.selectedOffice) {
              this.loadCostCodes();
              this.filterPropertiesByOffice();
            }
          }
        } else if (this.isAddMode && this.offices.length > 0) {
          const globalOfficeId = this.globalOfficeSelectionService.getSelectedOfficeIdValue();
          if (globalOfficeId != null) {
            this.resolveOfficeScope(globalOfficeId);
            if (this.selectedOffice) {
              this.loadCostCodes();
              this.filterPropertiesByOffice();
            }
          }
        }
      });
    });
    
    // Set up handlers after all data is loaded, then load reservation if needed
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      this.setupFormHandlers();

      if (this.isAddMode) {
        this.applyAddModePrefillFromQueryParams();
        const copyFrom = (history.state?.copyFromReservation) as ReservationResponse | undefined;
        if (copyFrom) {
          this.applyCopyFromReservation(copyFrom);
        }
        this.captureSavedStateSignature();
      } else {
        this.getReservation();
        this.loadReservationOptions();
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  /** Pre-fill form from a copied reservation: empty property code, arrival = today, same stay length. */
  private applyCopyFromReservation(source: ReservationResponse): void {
    if (!this.form || !source) return;

    this.selectedOffice = this.offices.find(o => o.officeId === source.officeId) || null;
    this.selectedProperty = null;
    this.selectedContact = this.contacts.find(c => c.contactId === source.contactId) || null;
    if (this.selectedOffice) {
      this.loadCostCodes();
    }
    this.filterPropertiesByOffice();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arrivalSource = source.arrivalDate ? new Date(source.arrivalDate) : null;
    const departureSource = source.departureDate ? new Date(source.departureDate) : null;
    const stayDays = arrivalSource && departureSource
      ? Math.max(1, Math.ceil((departureSource.getTime() - arrivalSource.getTime()) / (24 * 60 * 60 * 1000)))
      : 1;
    const departure = new Date(today);
    departure.setDate(departure.getDate() + stayDays);
    departure.setHours(0, 0, 0, 0);

    this.form.patchValue({ reservationTypeId: source.reservationTypeId }, { emitEvent: false });
    this.updateReservationStatusesByReservationType();
    this.updateContactsByReservationType();
    this.updateEnabledFieldsByReservationType();

    this.form.patchValue({
      isActive: true,
      allowExtensions: source.allowExtensions ?? true,
      reservationCode: '',
      propertyId: '',
      propertyCode: '',
      propertyAddress: '',
      agentId: source.agentId || null,
      contactId: source.contactId || null,
      companyName: (source as { companyName?: string })?.companyName ?? '',
      tenantName: source.tenantName || '',
      referenceNo: source.referenceNo || '',
      reservationStatusId: source.reservationStatusId,
      reservationNoticeId: source.reservationNoticeId ?? undefined,
      arrivalDate: today,
      departureDate: departure,
      checkInTimeId: source.checkInTimeId,
      checkOutTimeId: source.checkOutTimeId,
      lockBoxCode: source.lockBoxCode || '',
      unitTenantCode: source.unitTenantCode || '',
      billingTypeId: source.billingTypeId ?? BillingType.Monthly,
      billingMethodId: source.billingMethodId ?? BillingMethod.Invoice,
      prorateTypeId: source.prorateTypeId ?? null,
      billingRate: (source.billingRate ?? 0).toFixed(2),
      numberOfPeople: source.numberOfPeople === 0 ? 1 : source.numberOfPeople,
      depositType: source.depositTypeId ?? DepositType.Deposit,
      deposit: source.deposit !== null && source.deposit !== undefined ? source.deposit.toFixed(2) : '0.00',
      departureFee: (source.departureFee ?? 0).toFixed(2),
      pets: source.hasPets ?? false,
      petFee: (source.petFee ?? 0).toFixed(2),
      numberOfPets: source.numberOfPets ?? 0,
      petDescription: source.petDescription || '',
      maidService: source.maidService ?? false,
      maidStartDate: (() => {
        const d = new Date(today);
        d.setDate(d.getDate() + 7);
        return d;
      })(),
      maidServiceFee: (source.maidServiceFee ?? 0).toFixed(2),
      frequencyId: source.frequencyId ?? Frequency.NA,
      taxes: source.taxes === 0 ? null : source.taxes,
      notes: source.notes || ''
    }, { emitEvent: false });

    this.departureDateStartAt = today;
    this.updateContactFields();
    this.updatePetFields();
    this.updateMaidServiceFields();
    this.updateMaidStartDate();
    if (source.extraFeeLines?.length) {
      this.extraFeeLines = source.extraFeeLines.map(line => ({
        extraFeeLineId: null,
        feeDescription: line.feeDescription ?? null,
        feeAmount: line.feeAmount,
        feeFrequencyId: line.feeFrequencyId,
        costCodeId: line.costCodeId,
        isNew: true
      }));
    }
  }

  private applyAddModePrefillFromQueryParams(): void {
    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      const propertyId = queryParams['propertyId'] as string | undefined;
      const startDateParam = (queryParams['startDate'] || queryParams['arrivalDate']) as string | undefined;

      const patch: Record<string, unknown> = {};

      if (propertyId && this.properties.some(p => p.propertyId === propertyId)) {
        patch['propertyId'] = propertyId;
      }

      const parsedStartDate = this.parseDateFromQuery(startDateParam);
      if (parsedStartDate) {
        patch['arrivalDate'] = parsedStartDate;
        this.departureDateStartAt = new Date(parsedStartDate);
      }

      if (Object.keys(patch).length > 0) {
        this.form.patchValue(patch);
      }
    });
  }

  private parseDateFromQuery(value?: string): Date | null {
    if (!value) {
      return null;
    }

    const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (ymdMatch) {
      const year = Number(ymdMatch[1]);
      const month = Number(ymdMatch[2]) - 1;
      const day = Number(ymdMatch[3]);
      const localDate = new Date(year, month, day);
      localDate.setHours(0, 0, 0, 0);
      return isNaN(localDate.getTime()) ? null : localDate;
    }

    const parsed = new Date(value);
    parsed.setHours(0, 0, 0, 0);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  getReservation(): void {
    if (this.isAddMode) {
      return;
    }

    this.reservationService.getReservationByGuid(this.reservationId).pipe( take(1)).subscribe({
      next: (response: ReservationResponse) => {
        this.reservation = response;
        this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId) || null;
        this.selectedContact = this.contacts.find(c => c.contactId === this.reservation.contactId);
        this.populateForm();
        this.selectedHeaderReservationId = this.reservation.reservationId;
        this.refreshHeaderReservationOptions();
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  saveReservation(): void {
    // Mark all fields as touched to show validation errors
    this.form.markAllAsTouched();
    
    // Also mark individual controls as touched to ensure error messages appear
    // Use emitEvent: false to prevent triggering valueChanges subscriptions that might clear fields
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      if (control) {
        control.markAsTouched();
        control.updateValueAndValidity({ emitEvent: false });
      }
    });
    
    // Explicitly ensure reservationTypeId is validated and shows error
    const reservationTypeControl = this.form.get('reservationTypeId');
    if (reservationTypeControl) {
      reservationTypeControl.markAsTouched();
      reservationTypeControl.updateValueAndValidity({ emitEvent: false });
    }
    
    if (!this.form.valid) {
      this.toastr.error('Please fill in all required fields', CommonMessage.Error);
      return;
    }

    // Validate ExtraFeeLines before saving
    if (!this.validateExtraFeeLines()) {
      return;
    }

    // Check for date overlaps before saving
    this.validateDates('save');
  }

  deleteReservation(): void {
    if (this.isAddMode || !this.reservationId) {
      return;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const arrivalDate = this.parseDateOnly(this.reservation?.arrivalDate ?? this.form.get('arrivalDate')?.value);
    if (arrivalDate && now >= arrivalDate) {
      const dialogData: GenericModalData = {
        title: 'Cancel Reservation',
        message: 'It is not possible to cancel a reservation that has already begun.',
        icon: 'warning' as any,
        iconColor: 'warn',
        no: '',
        yes: 'OK',
        callback: (dialogRef) => dialogRef.close(),
        useHTML: false
      };

      this.dialog.open(GenericModalComponent, {
        data: dialogData,
        width: '35rem'
      });
      return;
    }

    const dialogData: GenericModalData = {
      title: 'Delete Reservation',
      message: 'Are you sure you want to delete this reservation?',
      icon: 'warning' as any,
      iconColor: 'warn',
      no: 'No',
      yes: 'Yes',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: true
    };

    const dialogRef = this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });

    dialogRef.afterClosed().pipe(take(1)).subscribe(result => {
      if (result !== true) {
        return;
      }

      this.isSubmitting = true;
      this.reservationService.deleteReservation(this.reservationId).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: () => {
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.router.navigateByUrl(RouterUrl.ReservationList);
        },
        error: () => {
          this.toastr.error('Failed to delete reservation', CommonMessage.Error);
        }
      });
    });
  }

  performSave(): void {
    this.isSubmitting = true;

    const formValue = this.form.getRawValue();
    const user = this.authService.getUser();
    const officeId = this.selectedOffice?.officeId || this.selectedProperty?.officeId;
    if (!officeId) {
      this.toastr.error('Office ID is required', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const agentId = formValue.agentId;
    if (!agentId || agentId === '' || agentId === 'null' || agentId === null) {
      this.toastr.error('Agent is required', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const reservationRequest: ReservationRequest = {
      organizationId: user?.organizationId || '',
      officeId: officeId,
      propertyId: formValue.propertyId,
      agentId: agentId,
      contactId: formValue.contactId,
      reservationTypeId: formValue.reservationTypeId !== null && formValue.reservationTypeId !== undefined ? Number(formValue.reservationTypeId) : ReservationType.Individual,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId !== null && formValue.reservationNoticeId !== undefined ? Number(formValue.reservationNoticeId) : ReservationNotice.ThirtyDays,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      hasPets: formValue.pets ?? false,
      tenantName: formValue.tenantName || '',
      referenceNo: formValue.referenceNo || '',
      arrivalDate: formValue.arrivalDate ? (formValue.arrivalDate as Date).toISOString() : new Date().toISOString(),
      departureDate: formValue.departureDate ? (formValue.departureDate as Date).toISOString() : new Date().toISOString(),
      checkInTimeId: normalizeCheckInTimeId(formValue.checkInTimeId),
      checkOutTimeId: normalizeCheckOutTimeId(formValue.checkOutTimeId),
      lockBoxCode: formValue.lockBoxCode || null,
      unitTenantCode: formValue.unitTenantCode || null,
      billingTypeId: formValue.billingTypeId ?? BillingType.Monthly,
      billingMethodId: formValue.billingMethodId ?? BillingMethod.Invoice,
      prorateTypeId: formValue.prorateTypeId !== null && formValue.prorateTypeId !== undefined ? Number(formValue.prorateTypeId) : ProrateType.FirstMonth,
      billingRate: formValue.billingRate ? parseFloat(formValue.billingRate.toString()) : 0,
      deposit: formValue.deposit ? parseFloat(formValue.deposit.toString()) : 0,
      depositTypeId: formValue.depositType !== null && formValue.depositType !== undefined ? Number(formValue.depositType) : DepositType.Deposit,
      departureFee: formValue.departureFee ? parseFloat(formValue.departureFee.toString()) : 0,
      maidService: formValue.maidService ?? false,
      maidServiceFee: formValue.maidServiceFee ? parseFloat(formValue.maidServiceFee.toString()) : 0,
      frequencyId: formValue.frequencyId ?? Frequency.NA,
      maidStartDate: formValue.maidStartDate ? (formValue.maidStartDate as Date).toISOString() : new Date().toISOString(),
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      numberOfPets: formValue.numberOfPets ? Number(formValue.numberOfPets) : 0,
      petDescription: formValue.petDescription || undefined,
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      extraFeeLines: this.mapExtraFeeLinesToRequest(),
      notes: formValue.notes !== null && formValue.notes !== undefined ? String(formValue.notes) : '',
      allowExtensions: formValue.allowExtensions ?? false,
      currentInvoiceNo: formValue.currentInvoiceNo ?? 0,
      creditDue: formValue.creditDue ?? 0,
      isActive: formValue.isActive ?? true
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
      reservationRequest.organizationId = this.reservation?.organizationId || user?.organizationId || '';
      reservationRequest.reservationCode = this.reservation?.reservationCode || formValue.reservationCode || '';
    }


    const save$ = this.isAddMode
      ? this.reservationService.createReservation(reservationRequest)
      : this.reservationService.updateReservation(reservationRequest);

    save$.pipe(take(1),  finalize(() => this.isSubmitting = false) ).subscribe({
      next: (response: ReservationResponse) => {
        const message = this.isAddMode ? 'Reservation created successfully' : 'Reservation updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        
        // If in add mode, navigate back to reservation list
        if (this.isAddMode && response) {
          this.captureSavedStateSignature();
          this.router.navigateByUrl(RouterUrl.ReservationList);
        } else if (!this.isAddMode && response) {
          // Update the reservation data with the response
          this.reservation = response;
          this.populateForm();
          this.captureSavedStateSignature();
        }
        
        // Trigger lease reload event
        this.leaseReloadService.triggerReload();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 400) {
          const errorData = err?.error;
          if (errorData && typeof errorData === 'object') {
            const problemDetails = errorData as any;
            let message = problemDetails.title || problemDetails.message || problemDetails.Message || 'Validation failed.';
            if (problemDetails.errors && typeof problemDetails.errors === 'object') {
              const fieldErrors: string[] = [];
              Object.keys(problemDetails.errors).forEach(key => {
                const errors = problemDetails.errors[key];
                if (Array.isArray(errors) && errors.length > 0) {
                  fieldErrors.push(`${key}: ${errors.join(', ')}`);
                }
              });
              if (fieldErrors.length > 0) {
                message += '\n' + fieldErrors.join('\n');
              }
            }
            this.toastr.error(message, CommonMessage.Error, { timeOut: 10000 });
          } else {
            this.toastr.error('Validation failed. Please check your input.', CommonMessage.Error);
          }
        }
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      isActive: new FormControl(true),
      allowExtensions: new FormControl(true),
      reservationCode: new FormControl({ value: '', disabled: true }), // Read-only, only shown in Edit Mode
      propertyCode: new FormControl({ value: '', disabled: true }), // Read-only
      propertyId: new FormControl('', [Validators.required]),
      propertyAddress: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      agentId: new FormControl(null, [Validators.required]),
      tenantName: new FormControl('', [Validators.required]), // Always enabled
      referenceNo: new FormControl(''),
      contactId: new FormControl('', [Validators.required]), // Always enabled
      companyName: new FormControl({ value: '', disabled: true }), // Display selected contact company name
      reservationTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(null, [Validators.required]),
      reservationNoticeId: new FormControl(ReservationNotice.ThirtyDays, [Validators.required]),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required]),
      checkInTimeId: new FormControl<number>(CheckinTimes.FourPM, [Validators.required]),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.ElevenAM, [Validators.required]),
      lockBoxCode: new FormControl(''),
      unitTenantCode: new FormControl(''),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingMethodId: new FormControl(BillingMethod.Invoice, [Validators.required]),
      prorateTypeId: new FormControl<number | null>(null),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      pets: new FormControl(false, [Validators.required]),
      petFee: new FormControl<string>('0.00'),
      numberOfPets: new FormControl(0),
      petDescription: new FormControl(''),
      maidService: new FormControl(false, [Validators.required]),
      maidStartDate: new FormControl<Date | null>(null),
      phone: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      email: new FormControl({ value: '', disabled: true }), // No validators for disabled fields
      depositType: new FormControl(DepositType.Deposit, [Validators.required]),
      deposit: new FormControl<string>('0.00'),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00'),
      frequencyId: new FormControl(Frequency.NA),
      taxes: new FormControl(null),
      notes: new FormControl(''),
      currentInvoiceNo: new FormControl(0),
      creditDue: new FormControl(0)
    });

    // Initialize field states
    this.initializeEnums();
  }

  populateForm(): void {
    if (!this.reservation || !this.form) {
      return;
    }

    this.selectedProperty = this.properties.find(p => p.propertyId === this.reservation.propertyId) || null;
    const reservationOfficeId = this.selectedProperty?.officeId ?? this.reservation.officeId;
    this.selectedOffice = this.offices.find(o => o.officeId === reservationOfficeId) || null;
    this.selectedContact = this.contacts.find(c => c.contactId === this.reservation.contactId);
    if (this.selectedOffice) {
      this.loadCostCodes();
    }
    this.filterPropertiesByOffice();


    // Patch form with reservationTypeId and adjust dropdowns accordingly
    this.form.patchValue({ reservationTypeId: this.reservation.reservationTypeId }, { emitEvent: false });
    this.updateReservationStatusesByReservationType();
    this.updateContactsByReservationType();
    this.updateEnabledFieldsByReservationType();
  
    // Patch all form values directly from reservation (without contact fields first)
    this.form.patchValue({
      isActive: typeof this.reservation.isActive === 'number' ? this.reservation.isActive === 1 : Boolean(this.reservation.isActive),
      allowExtensions: this.reservation.allowExtensions ?? true,
      reservationCode: this.reservation.reservationCode || '',
      propertyId: this.reservation.propertyId,
      propertyCode: this.selectedProperty?.propertyCode || this.properties.find(p => p.propertyId === this.reservation.propertyId)?.propertyCode || '',
      propertyAddress: this.selectedProperty?.shortAddress || '',
      agentId: this.reservation.agentId || null,
      contactId: this.reservation.contactId || null,
      companyName: (this.reservation as { companyName?: string })?.companyName ?? '',
      tenantName: this.reservation.tenantName || '',
      referenceNo: this.reservation.referenceNo || '',
      reservationStatusId: this.reservation.reservationStatusId,
      reservationNoticeId: this.reservation.reservationNoticeId,
      arrivalDate: this.reservation.arrivalDate ? new Date(this.reservation.arrivalDate) : null,
      departureDate: this.reservation.departureDate ? new Date(this.reservation.departureDate) : null,
      checkInTimeId: this.reservation.checkInTimeId,
      checkOutTimeId: this.reservation.checkOutTimeId,
      lockBoxCode: this.reservation.lockBoxCode || '',
      unitTenantCode: this.reservation.unitTenantCode || '',
      billingTypeId: this.reservation.billingTypeId ?? BillingType.Monthly,
      billingMethodId: this.reservation.billingMethodId ?? BillingMethod.Invoice,
      prorateTypeId: this.reservation.prorateTypeId ?? null,
      billingRate: (this.reservation.billingRate ?? 0).toFixed(2),
      numberOfPeople: this.reservation.numberOfPeople === 0 ? 1 : this.reservation.numberOfPeople,
      depositType: this.reservation.depositTypeId ?? DepositType.Deposit,
      deposit: this.reservation.deposit !== null && this.reservation.deposit !== undefined ? this.reservation.deposit.toFixed(2) : '0.00',
      departureFee: (this.reservation.departureFee ?? 0).toFixed(2),
      pets: this.reservation.hasPets ?? false,
      petFee: (this.reservation.petFee ?? 0).toFixed(2),
      numberOfPets: this.reservation.numberOfPets ?? 0,
      petDescription: this.reservation.petDescription || '',
      maidService: this.reservation.maidService ?? false,
      maidStartDate: this.reservation.maidStartDate ? new Date(this.reservation.maidStartDate) : null,
      maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
      frequencyId: this.reservation.frequencyId ?? Frequency.NA,
      taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
      notes: this.reservation.notes || ''
    }, { emitEvent: false });

    // Find selected contact - contacts are guaranteed to be loaded at this point
    this.selectedContact = this.contacts.find(c => c.contactId === this.reservation.contactId);
    this.updateContactFields();
   
    // Update pet and maid service fields after patching
    this.updatePetFields();
    this.updateMaidServiceFields();
    this.loadExtraFeeLines();
    this.updateMaidStartDate();
    this.updatePropertyIdEditState();
    this.captureSavedStateSignature();
  }

  /** True when editing an existing reservation whose arrival date is in the future (property can be changed). */
  get canEditProperty(): boolean {
    if (this.isAddMode || !this.reservation) {
      return false;
    }
    const arrival = this.form.get('arrivalDate')?.value as Date | null;
    if (!arrival) {
      return false;
    }
    const arrivalStart = new Date(arrival);
    arrivalStart.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return arrivalStart > todayStart;
  }

  /** Enable or disable propertyId based on whether the reservation has started (edit mode only). */
  updatePropertyIdEditState(): void {
    const control = this.form.get('propertyId');
    if (!control) {
      return;
    }
    if (this.canEditProperty) {
      control.enable({ emitEvent: false });
    } else if (!this.isAddMode) {
      control.disable({ emitEvent: false });
    }
  }
    
  setupFormHandlers(): void {
    // Prevent setting up handlers multiple times
    if (this.handlersSetup) {
      return;
    }
    
    // Set up handlers that depend on loaded data (office, properties, etc.)
    this.setupPropertySelectionHandler();
    this.setupContactSelectionHandler();
    this.setupReservationTypeHandler();
    this.setupDepositHandlers();
    this.setupBillingTypeHandler();
    this.setupPetFeeHandler();
    this.setupMaidServiceHandler();
    this.setupMaidStartDateHandler();
    this.setupDepartureDateStartAtHandler();
    
    this.handlersSetup = true;
  }
  //#endregion

  //#region Form Value Change Handlers
  setupPropertySelectionHandler(): void {
    this.form.get('propertyId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(propertyId => {
      this.selectedProperty = propertyId ? this.availableProperties.find(p => p.propertyId === propertyId) || null : null;
      if (this.selectedProperty && !this.selectedOffice) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.selectedProperty.officeId) || null;
        if (this.selectedOffice) {
          this.loadCostCodes();
        }
      }
      if (this.reservation?.contactId) {
        this.selectedContact = this.contacts.find(c => c.contactId === this.reservation.contactId);
      }

      const propertyAddress = this.selectedProperty?.shortAddress || '';
      const propertyCode = this.selectedProperty?.propertyCode || '';
      this.form.patchValue({ 
        propertyAddress: propertyAddress,
        propertyCode: propertyCode
      }, { emitEvent: false });
     
      // Property affects the deposit and billing amounts
      this.updateDepositValues();
      this.updateBillingValues();
      this.updateDepartureFeeValue();
      this.updatePetFields();
      this.updateMaidServiceFields();
      this.updateContactFields();
      this.refreshHeaderReservationOptions();
    });
  }

  setupContactSelectionHandler(): void {
    this.form.get('contactId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(contactId => {
      if (contactId === this.newContactOptionValue) {
        this.form.patchValue({ contactId: '' }, { emitEvent: false });
        this.openNewContactDialog();
        return;
      }

      this.selectedContact = contactId ? this.contacts.find(c => c.contactId === contactId) || null : null;
      this.updateContactFields();
    });
  }

  setupReservationTypeHandler(): void {
    this.form.get('reservationTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(reservationTypeId => {
      // Filter statuses and contacts based on reservation type
      this.updateReservationStatusesByReservationType();
      this.updateContactsByReservationType();
      this.applyDefaultProrateTypeByReservationType(reservationTypeId);
      this.updateEnabledFieldsByReservationType();

       // Always clear reservation status when type changes
      this.form.patchValue({ reservationStatusId: null }, { emitEvent: false });
      
      // When reservation type changes, always clear contact-related fields
      this.form.patchValue({ 
        phone: '',
        email: '',
        companyName: '',
        tenantName: '',
        referenceNo: '',
        contactId: ''
      }, { emitEvent: false });
      
      // Clear selected contact reference
      this.selectedContact = null;
      this.updateContactFields();
    });
  }
    
  setupDepositHandlers(): void {
    this.form.get('depositType')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateDepositValues();
    });
  }

  setupBillingTypeHandler(): void {
    this.form.get('billingTypeId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(billingTypeId => {
      this.updateBillingValues();
    });
  }

  setupPetFeeHandler(): void {
    this.form.get('pets')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(pets => {
      this.updatePetFields();
    });
  }

  updateMaidStartDate(): void {
    const arrivalDate = this.form.get('arrivalDate')?.value;
    const maidStartDateControl = this.form.get('maidStartDate');
    
    // Always update maidStartDate to arrivalDate + 7 days when arrivalDate changes
    // (field will be disabled/grayed out if maidService is false)
    if (arrivalDate && maidStartDateControl) {
      const arrival = new Date(arrivalDate);
      const arrivalPlus7Days = new Date(arrival);
      arrivalPlus7Days.setDate(arrivalPlus7Days.getDate() + 7);
      const currentMaidStartDate = maidStartDateControl.value ? new Date(maidStartDateControl.value) : null;
      
      // If maidStartDate is null or before arrivalDate, set it to arrivalDate + 7 days
      if (!currentMaidStartDate || currentMaidStartDate < arrival) {
        maidStartDateControl.setValue(arrivalPlus7Days, { emitEvent: false });
      }
    }
  }

  setupMaidServiceHandler(): void {
    this.form.get('maidService')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(maidService => {
      this.updateMaidServiceFields();
      
      // When maidService becomes enabled, initialize maidStartDate if arrivalDate exists
      if (maidService) {
        this.updateMaidStartDate();
      }
    });
  }

  setupMaidStartDateHandler(): void {
    this.form.get('arrivalDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateMaidStartDate();
    });
  }

  setupDepartureDateStartAtHandler(): void {
    this.form.get('arrivalDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(arrivalDate => {
      const departureDate = this.form.get('departureDate')?.value;
      
      // If arrival date is set and departure date is unset, start calendar at arrival date
      if (arrivalDate && !departureDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      } else if (!arrivalDate) {
        this.departureDateStartAt = null;
      }
      this.updatePropertyIdEditState();
      if (this.canEditProperty) {
        this.filterPropertiesByOffice();
      }
    });
    this.form.get('departureDate')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.canEditProperty) {
        this.filterPropertiesByOffice();
      }
    });
  }

  initializeEnums(): void {
    this.availableClientTypes = getReservationTypes();
    this.allReservationStatuses = getReservationStatuses();
    // Initialize with all statuses, will be filtered based on reservation type
    this.updateReservationStatusesByReservationType();
    this.checkInTimes = getCheckInTimes();
    this.checkOutTimes = getCheckOutTimes();
    this.availableBillingTypes = getBillingTypes();
    this.availableBillingMethods = getBillingMethods();
    this.availableProrateTypes = getProrateTypes();
    this.availableFrequencies = getFrequencies();
    this.availableReservationNotices = getReservationNotices();
    this.availableDepositTypes = getDepositTypes();
  }
  //#endregion

  //#region Dynamic Form Adjustment Methods
  updateContactsByReservationType(): void {
    if (!this.form) {
       return;
    }

    const reservationTypeId = this.form.get('reservationTypeId')?.value as number;
    const contactId = this.form.get('contactId')?.value || this.reservation?.contactId;

    if (reservationTypeId === ReservationType.Individual) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Tenant);
    else if (reservationTypeId === ReservationType.Corporate) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);
    else if (reservationTypeId === ReservationType.Owner) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Owner);
    else
      this.filteredContacts = this.contacts;
    
    if (contactId)  {
      this.updateContactFields();
    }
  }

  get contactNameOptions(): SearchableSelectOption[] {
    return [
      { value: this.newContactOptionValue, label: 'New Contact' },
      ...this.filteredContacts.map(contact => ({
        value: contact.contactId,
        label: this.getContactNameLabel(contact)
      }))
    ];
  }

  getContactNameLabel(contact: ContactResponse): string {
    if (contact.entityTypeId === EntityType.Company) {
      return `${contact.displayName ?? contact.companyName}: ${contact.firstName} ${contact.lastName}`;
    }
    return `${contact.firstName} ${contact.lastName}`;
  }

  onContactNameChange(contactId: string | number | null): void {
    const normalizedContactId = contactId === null || contactId === undefined ? '' : String(contactId);
    this.form.get('contactId')?.setValue(normalizedContactId);
    this.form.get('contactId')?.markAsTouched();
  }

  get headerReservationOptions(): SearchableSelectOption[] {
    return this.availableHeaderReservations.map(option => ({ value: option.value.reservationId, label: option.label }));
  }

  onHeaderReservationDropdownChange(reservationId: string | number | null): void {
    this.selectedHeaderReservationId = reservationId == null ? null : String(reservationId);
    this.onHeaderReservationChange();
  }

  onReservationNumberDropdownChange(controlName: 'reservationTypeId' | 'reservationStatusId' | 'reservationNoticeId' | 'checkInTimeId' | 'checkOutTimeId', value: string | number | null): void {
    this.form.get(controlName)?.setValue(value == null || value === '' ? null : Number(value));
    this.form.get(controlName)?.markAsTouched();
  }

  onAgentDropdownChange(value: string | number | null): void {
    const normalizedAgentId = value == null || value === '' ? null : String(value);
    this.form.get('agentId')?.setValue(normalizedAgentId);
    this.form.get('agentId')?.markAsTouched();
  }

  get agentOptions(): SearchableSelectOption[] {
    return this.agents.map(agent => ({ value: agent.agentId, label: agent.agentCode }));
  }

  updateReservationStatusesByReservationType(): void {
    if (!this.form) {
      this.availableReservationStatuses = this.allReservationStatuses;
      return;
    }

    const reservationTypeId = this.form.get('reservationTypeId')?.value ?? null as number | null;
   
    if (reservationTypeId === ReservationType.Owner) {
      // For Owner type: show only Owner Blocked and Maintenance (in that order - Owner Blocked first)
      this.availableReservationStatuses = [
        { value: ReservationStatus.OwnerBlocked, label: 'Owner Blocked' },
        { value: ReservationStatus.Maintenance, label: 'Maintenance' }
      ];
    } else {
      // For all other types: show everything EXCEPT Maintenance and Owner Blocked
      this.availableReservationStatuses = this.allReservationStatuses.filter(status => 
        status.value !== ReservationStatus.Maintenance && 
        status.value !== ReservationStatus.OwnerBlocked
      );
    }
  }

  updateEnabledFieldsByReservationType(): void {
    const reservationTypeId = this.form.get('reservationTypeId')?.value ?? null as number | null;

    if (reservationTypeId === ReservationType.Owner) {
      // Make billing and fee fields readonly for Owner type
      this.disableFieldWithValidation('billingTypeId');
      this.disableFieldWithValidation('billingMethodId');
      this.disableFieldWithValidation('prorateTypeId');
      this.disableFieldWithValidation('billingRate');
      this.disableFieldWithValidation('depositType');      
      this.disableFieldWithValidation('deposit');
      this.disableFieldWithValidation('departureFee');
      this.disableFieldWithValidation('pets');
      this.disableFieldWithValidation('petFee');
      this.disableFieldWithValidation('numberOfPets');
      this.disableFieldWithValidation('petDescription');
      this.disableFieldWithValidation('maidService');
      this.disableFieldWithValidation('maidServiceFee');
      this.disableFieldWithValidation('frequencyId');
      this.disableFieldWithValidation('taxes');
    } else {
      // Enable fields for non-Owner types (with appropriate validators)
      this.enableFieldWithValidation('billingTypeId', [Validators.required]);
      this.enableFieldWithValidation('billingMethodId', [Validators.required]);
      this.enableFieldWithValidation('prorateTypeId');
      this.enableFieldWithValidation('billingRate', [Validators.required]);
      this.enableFieldWithValidation('depositType', [Validators.required]);
      this.enableFieldWithValidation('deposit', [Validators.required]);
      this.enableFieldWithValidation('departureFee', [Validators.required]);
      this.enableFieldWithValidation('taxes');
      this.enableFieldWithValidation('pets', [Validators.required]);      
      this.enableFieldWithValidation('maidService', [Validators.required]);      
      this.updatePetFields();
      this.updateMaidServiceFields();
      
      // Set departureDateStartAt if arrival date is set and departure date is unset
      const arrivalDate = this.form.get('arrivalDate')?.value;
      const departureDate = this.form.get('departureDate')?.value;
      if (arrivalDate && !departureDate) {
        this.departureDateStartAt = new Date(arrivalDate);
      }
    }
  }

  applyDefaultProrateTypeByReservationType(reservationTypeId: number | null): void {
    const prorateTypeControl = this.form.get('prorateTypeId');
    if (!prorateTypeControl) {
      return;
    }

    if (reservationTypeId === ReservationType.Individual) {
      prorateTypeControl.setValue(ProrateType.SecondMonth, { emitEvent: false });
    } else if (reservationTypeId === ReservationType.Corporate) {
      prorateTypeControl.setValue(ProrateType.FirstMonth, { emitEvent: false });
    }
  }

  updateContactFields(): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    if (reservationTypeId === ReservationType.Owner) {
      this.selectedContact = this.contacts.find(c => c.contactId === this.selectedProperty?.owner1Id) || null;
      this.form.patchValue({ contactId: this.selectedContact?.contactId || '' }, { emitEvent: false });
    }

    if (!this.selectedContact) {
      this.form.patchValue({
        companyName: '',
        phone: '',
        email: '',
        referenceNo: ''
      }, { emitEvent: false });
      return;
    }

    const selectedContactFullName = (this.selectedContact.fullName || '').trim() ||
      `${this.selectedContact.firstName || ''} ${this.selectedContact.lastName || ''}`.trim();

    // Phone, email and companyName remain disabled (read-only) - just update their values. Prefer displayName so e.g. "Harvard" not "Harvard University".
    const selectedCompanyName = (this.selectedContact.displayName ?? (this.utilityService.getCompanyDisplayToken(this.selectedContact.companyName ?? null) || this.selectedContact.companyName || '')).trim();
    this.form.patchValue({
      companyName: selectedCompanyName,
      phone: this.formatterService.phoneNumber(this.selectedContact.phone) || '',
      email: this.selectedContact.email || '',
    }, { emitEvent: false });

    if (reservationTypeId === ReservationType.Owner) {
      this.form.patchValue({ tenantName: selectedContactFullName }, { emitEvent: false });
      return;
    }

    if (reservationTypeId === ReservationType.Individual) {
      this.form.patchValue({ tenantName: selectedContactFullName }, { emitEvent: false });
      return;
    }

    // Keep existing behavior for non-individual reservations.
    const tenantName = this.form.get('tenantName')?.value;
    if ((tenantName === null || tenantName === undefined) && this.selectedContact.entityTypeId !== EntityType.Company) {
      this.form.patchValue({ tenantName: selectedContactFullName }, { emitEvent: false });
    }

    if (!this.showPoNumberField) {
      this.form.patchValue({ referenceNo: '' }, { emitEvent: false });
    }
 }

  get showPoNumberField(): boolean {
    if (!this.selectedContact) {
      return false;
    }

    if (this.selectedContact.entityTypeId === EntityType.Company) {
      return true;
    }

    const entityId = (this.selectedContact.entityId ?? '').trim().toLowerCase();
    return entityId === 'company';
  }

  openNewContactDialog(): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    let entityTypeId: number | null = null;

    if (reservationTypeId === ReservationType.Individual) {
      entityTypeId = EntityType.Tenant;
    } else if (reservationTypeId === ReservationType.Corporate) {
      entityTypeId = EntityType.Company;
    } else if (reservationTypeId === ReservationType.Owner) {
      entityTypeId = EntityType.Owner;
    }

    const dialogRef = this.dialog.open(ContactComponent, {
      width: '1200px',
      maxWidth: '95vw',
      disableClose: true
    });

    dialogRef.componentInstance.id = 'new';
    dialogRef.componentInstance.copyFrom = null;
    dialogRef.componentInstance.entityTypeId = entityTypeId;
    dialogRef.componentInstance.compactDialogMode = true;
    dialogRef.componentInstance.closed
      .pipe(take(1))
      .subscribe((result: { saved?: boolean; contactId?: string; entityTypeId?: number }) => dialogRef.close(result));

    dialogRef.afterClosed().pipe(take(1)).subscribe((result?: { saved?: boolean; contactId?: string; entityTypeId?: number }) => {
      if (!result?.saved || !result.contactId) {
        return;
      }

      this.contactService.refreshContacts().pipe(take(1)).subscribe({
        next: (contacts) => {
          this.contacts = contacts || [];
          let targetReservationTypeId: number | null = null;
          if (result.entityTypeId === EntityType.Tenant) {
            targetReservationTypeId = ReservationType.Individual;
          } else if (result.entityTypeId === EntityType.Company) {
            targetReservationTypeId = ReservationType.Corporate;
          }

          if (targetReservationTypeId !== null) {
            this.form.patchValue({ reservationTypeId: targetReservationTypeId }, { emitEvent: false });
            this.updateReservationStatusesByReservationType();
            this.updateContactsByReservationType();
            this.applyDefaultProrateTypeByReservationType(targetReservationTypeId);
            this.updateEnabledFieldsByReservationType();
          } else {
            this.updateContactsByReservationType();
          }

          this.form.patchValue({ contactId: result.contactId }, { emitEvent: false });
          this.selectedContact = this.contacts.find(c => c.contactId === result.contactId) || null;
          this.updateContactFields();
        },
        error: () => {}
      });
    });
  }

  updateDepositValues(): void {
    if (!this.selectedOffice) {
      return;
    }

    const depositControl = this.form.get('deposit')!;
    const depositType = this.form.get('depositType')!.value;

    let defaultDeposit = '0.00';
    if (depositType === DepositType.SDW) {
      defaultDeposit = this.selectedOffice.defaultSdw.toFixed(2);
    } else if (depositType === DepositType.Deposit) {
      defaultDeposit = this.selectedOffice.defaultDeposit.toFixed(2);
    }

    depositControl.setValue(defaultDeposit, { emitEvent: false });
  }

  updateBillingValues(): void {
    if (!this.selectedProperty) {
      return;
    }

    const billingControl = this.form.get('billingRate')!;
    const billingTypeId = this.form.get('billingTypeId')!.value;

    let billingRate: string;
    if (billingTypeId === BillingType.Monthly) {
      billingRate = this.selectedProperty.monthlyRate.toFixed(2);
    } else {
      billingRate = this.selectedProperty.dailyRate.toFixed(2);
    }

    billingControl.setValue(billingRate, { emitEvent: false });
  }

  updateDepartureFeeValue(): void {
    if (!this.selectedProperty) {
      return;
    }

    const departureControl = this.form.get('departureFee')!;
    const departureFee = this.selectedProperty.departureFee != null 
      ? this.selectedProperty.departureFee.toFixed(2) 
      : '0.00';
    departureControl.setValue(departureFee, { emitEvent: false });
  }

  updatePetFields(): void {
    const hasPets = this.form.get('pets')?.value ?? false;
    const petFeeControl = this.form.get('petFee');
    const numberOfPetsControl = this.form.get('numberOfPets');
    const petDescriptionControl = this.form.get('petDescription');
    
    if (hasPets === false) {
      petFeeControl.setValue('0.00', { emitEvent: false });
      this.disableFieldWithValidation('petFee');

      numberOfPetsControl.setValue(0, { emitEvent: false });
      this.disableFieldWithValidation('numberOfPets');
      
      petDescriptionControl.setValue('', { emitEvent: false });
      this.disableFieldWithValidation('petDescription');  
    } 
    else {
      // Only need selectedProperty when enabling fields
      if (!this.selectedProperty) {
        return;
      }
      
      const petFee = this.selectedProperty.petFee != null 
        ? this.selectedProperty.petFee.toFixed(2) 
        : '0.00';
      petFeeControl.setValue(petFee, { emitEvent: false });
      this.enableFieldWithValidation('petFee', [Validators.required]);
      
      numberOfPetsControl.setValue(1, { emitEvent: false });
      this.enableFieldWithValidation('numberOfPets', [Validators.required]);
      
      this.enableFieldWithValidation('petDescription', [Validators.required]);
    }
  }
  
  updateMaidServiceFields(): void {
    const hasMaidService = this.form.get('maidService')?.value ?? false;
    const maidServiceFeeControl = this.form.get('maidServiceFee');
    const frequencyControl = this.form.get('frequencyId');
    
    if (hasMaidService === false) {
      maidServiceFeeControl.setValue('0.00', { emitEvent: false });
      this.disableFieldWithValidation('maidServiceFee');
      
      frequencyControl.setValue(Frequency.NA, { emitEvent: false });
      this.disableFieldWithValidation('frequencyId');

      this.disableFieldWithValidation('maidStartDate');

    } 
    else {
      // Only need selectedProperty when enabling fields
      if (!this.selectedProperty) {
        return;
      }
      
      maidServiceFeeControl.setValue(this.selectedProperty.maidServiceFee.toFixed(2), { emitEvent: false });
      this.enableFieldWithValidation('maidServiceFee', [Validators.required]);

      // Only set frequency to OneTime if it's currently NA (don't override existing values from API)
      const currentFrequency = frequencyControl.value;
      if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
        frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
      }
      this.enableFieldWithValidation('frequencyId', [Validators.required]);

      this.enableFieldWithValidation('maidStartDate', [Validators.required]);
    }
  }
  //#endregion

  //#region ExtraFeeLines Management
  getExtraFeeFrequencyValue(frequencyId: number | undefined | null): number | null {
    if (frequencyId === undefined || frequencyId === null) {
      return null;
    }
    // Ensure it's a number and matches one of the available frequencies (Frequency enum)
    const numValue = Number(frequencyId);
    const isValidFrequency = this.availableFrequencies.some(f => f.value === numValue);
    return isValidFrequency ? numValue : null;
  }

  loadExtraFeeLines(): void {
    if (!this.reservation || !this.reservation.extraFeeLines) {
      this.extraFeeLines = [];
      return;
    }
    
    this.extraFeeLines = this.reservation.extraFeeLines.map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId !== null && line.feeFrequencyId !== undefined ? Number(line.feeFrequencyId) : undefined,
      costCodeId: line.costCodeId !== null && line.costCodeId !== undefined ? Number(line.costCodeId) : undefined,
      isNew: false
    }));
  }

  addExtraFeeLine(): void {
    const newLine: ExtraFeeLineDisplay = {
      extraFeeLineId: null,
      feeDescription: null,
      feeAmount: undefined,
      feeFrequencyId: undefined,
      costCodeId: undefined,
      isNew: true
    };
    this.extraFeeLines.push(newLine);
  }

  removeExtraFeeLine(index: number): void {
    if (index >= 0 && index < this.extraFeeLines.length) {
      this.extraFeeLines.splice(index, 1);
    }
  }

  updateExtraFeeLineField(index: number, field: keyof ExtraFeeLineDisplay, value: any): void {
    if (index >= 0 && index < this.extraFeeLines.length) {
      (this.extraFeeLines[index] as any)[field] = value;
    }
  }

  validateExtraFeeLines(): boolean {
    if (!this.extraFeeLines || this.extraFeeLines.length === 0) {
      return true; // Empty list is valid
    }

    for (let i = 0; i < this.extraFeeLines.length; i++) {
      const line = this.extraFeeLines[i];
      
      // Check if feeDescription is provided
      if (!line.feeDescription || line.feeDescription.trim() === '') {
        this.toastr.error(`Extra Fee Line ${i + 1}: Fee Description is required`, CommonMessage.Error);
        return false;
      }

      // Check if feeAmount is provided and greater than 0
      if (line.feeAmount === undefined || line.feeAmount === null || line.feeAmount <= 0) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Fee Amount must be greater than 0`, CommonMessage.Error);
        return false;
      }

      // Check if feeFrequencyId is provided (must be a valid Frequency enum value)
      if (line.feeFrequencyId === undefined || line.feeFrequencyId === null) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Frequency is required`, CommonMessage.Error);
        return false;
      }

      // Check if costCodeId is provided
      if (line.costCodeId === undefined || line.costCodeId === null) {
        this.toastr.error(`Extra Fee Line ${i + 1}: Cost Code is required`, CommonMessage.Error);
        return false;
      }
    }

    return true;
  }

  mapExtraFeeLinesToRequest(): ExtraFeeLineRequest[] {
    if (!this.extraFeeLines || this.extraFeeLines.length === 0) {
      return [];
    }

    return this.extraFeeLines.map(line => ({
      extraFeeLineId: line.extraFeeLineId || undefined,
      reservationId: this.isAddMode ? undefined : (this.reservationId || undefined),
      feeDescription: line.feeDescription || null,
      feeAmount: line.feeAmount || 0,
      feeFrequencyId: line.feeFrequencyId !== undefined && line.feeFrequencyId !== null ? Number(line.feeFrequencyId) : Frequency.OneTime,
      costCodeId: line.costCodeId !== undefined && line.costCodeId !== null ? Number(line.costCodeId) : 0
    }));
  }
  //#endregion

  //#region Data Load Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.contacts = contacts || [];
      },
      error: () => {
        this.contacts = [];
      }
    });
  }

  loadOrganization(): void {
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1)).subscribe({
      next: (organization: OrganizationResponse) => {
        this.organization = organization;
      },
      error: () => {}
    });
  }
  
  loadAgents(): void {
    this.agentService.getAgents().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agents'); })).subscribe({
      next: (agents: AgentResponse[]) => {
        this.agents = agents;
      },
      error: () => {
        this.agents = [];
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'properties'); })).subscribe({
      next: (properties: PropertyListResponse[]) => {
        this.properties = properties;
        this.filterPropertiesByOffice();
       },
      error: () => {
        this.properties = [];
        this.availableProperties = [];
      }
    });
  }

  loadOffices(): void {
    this.globalOfficeSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.selectedOffice = this.offices.find(o => o.officeId === this.selectedProperty?.officeId) || null;
        if (this.selectedOffice) {
          this.loadCostCodes();
        }
        this.filterPropertiesByOffice();
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
      }
    });
  }

  loadCostCodes(): void {
    if (!this.selectedOffice) {
      this.chargeCostCodes = [];
      this.availableChargeCostCodes = [];
      return;
    }

    // Wait for cost codes to be loaded, then filter for charge types
    this.costCodesService.areCostCodesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe({
      next: () => {
        this.costCodesSubscription = this.costCodesService.getAllCostCodes().subscribe(() => {
          // Get cost codes for the selected office and filter for charge types (non-payment)
          const costCodes = this.costCodesService.getCostCodesForOffice(this.selectedOffice!.officeId);
          this.chargeCostCodes = costCodes.filter(c => c.isActive && c.transactionTypeId !== TransactionType.Payment);
          this.availableChargeCostCodes = this.chargeCostCodes.map(c => ({
            value: parseInt(c.costCodeId, 10),
            label: `${c.costCode}: ${c.description}`
          }));
        });
      },
      error: () => {
        this.chargeCostCodes = [];
        this.availableChargeCostCodes = [];
      }
    });
  }

  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    if (this.selectedOffice) {
      this.loadCostCodes();
    }
    this.filterPropertiesByOffice();
    
    if (this.selectedProperty && this.selectedProperty.officeId !== this.selectedOffice?.officeId) {
      this.selectedProperty = null;
      this.form.patchValue({
        propertyId: '',
        propertyAddress: '',
        propertyCode: ''
      });
    }
    this.refreshHeaderReservationOptions();
  }

  onLeaseOfficeIdChange(officeId: number | null): void {
    if (officeId !== null && officeId !== undefined && this.offices.length > 0) {
      const newOffice = this.offices.find(o => o.officeId === officeId) || null;
      if (newOffice && newOffice !== this.selectedOffice) {
        this.selectedOffice = newOffice;
        this.loadCostCodes();
        this.filterPropertiesByOffice();
      }
    } else if (officeId === null && this.selectedOffice) {
      this.selectedOffice = null;
      this.filterPropertiesByOffice();
    }
    this.refreshHeaderReservationOptions();
  }

  filterPropertiesByOffice(): void {
    const officeFiltered = !this.selectedOffice
      ? this.properties
      : this.properties.filter(p => p.officeId === this.selectedOffice.officeId);

    if (!this.canEditProperty || !this.reservation) {
      this.availableProperties = officeFiltered;
      this.applySelectedPropertyClearIfOfficeMismatch();
      this.refreshHeaderReservationOptions();
      return;
    }

    const arrivalRaw = this.form.get('arrivalDate')?.value ?? this.reservation?.arrivalDate;
    const departureRaw = this.form.get('departureDate')?.value ?? this.reservation?.departureDate;
    if (!arrivalRaw || !departureRaw) {
      this.availableProperties = officeFiltered;
      this.applySelectedPropertyClearIfOfficeMismatch();
      this.refreshHeaderReservationOptions();
      return;
    }

    const arrival = this.normalizeDateForConflict(arrivalRaw);
    const departure = this.normalizeDateForConflict(departureRaw);
    const currentReservationId = this.reservation.reservationId;
    const currentPropertyId = this.reservation.propertyId;

    this.reservationService.getReservationList().pipe(take(1), catchError(() => of([] as ReservationListResponse[]))).subscribe(list => {
      const propertyIdsWithConflict = new Set<string>();
      for (const r of list) {
        if (r.reservationId === currentReservationId || !r.isActive) continue;
        if (!r.arrivalDate || !r.departureDate) continue;
        const rArr = this.normalizeDateForConflict(r.arrivalDate);
        const rDep = this.normalizeDateForConflict(r.departureDate);
        if (arrival <= rDep && departure >= rArr) {
          propertyIdsWithConflict.add(r.propertyId);
        }
      }
      this.availableProperties = officeFiltered.filter(p =>
        !propertyIdsWithConflict.has(p.propertyId) || p.propertyId === currentPropertyId
      );
      this.applySelectedPropertyClearIfOfficeMismatch();
      this.refreshHeaderReservationOptions();
    });
  }

  loadReservationOptions(): void {
    this.reservationService.getReservationList().pipe(take(1), catchError(() => of([] as ReservationListResponse[]))).subscribe(reservations => {
      this.reservationList = reservations || [];
      this.refreshHeaderReservationOptions();
    });
  }

  refreshHeaderReservationOptions(): void {
    const officeId = this.sharedOfficeId;
    const propertyId = this.sharedPropertyId;
    const preferredReservationId = this.reservation?.reservationId ?? this.reservationId ?? null;
    if (!officeId || !propertyId) {
      this.availableHeaderReservations = [];
      if (this.selectedHeaderReservationId === undefined) {
        this.selectedHeaderReservationId = preferredReservationId;
      }
      return;
    }

    this.availableHeaderReservations = this.reservationList
      .filter(r => r.officeId === officeId && r.propertyId === propertyId)
      .sort((a, b) => a.reservationCode.localeCompare(b.reservationCode))
      .map(r => ({
        value: r,
        label: this.utilityService.getReservationDropdownLabel(r, this.contacts.find(c => c.contactId === r.contactId) ?? null)
      }));

    if (this.selectedHeaderReservationId === undefined) {
      this.selectedHeaderReservationId = preferredReservationId ?? this.sharedReservationId ?? null;
    }

    // Preserve current selection while options are still loading.
    if (this.availableHeaderReservations.length === 0) {
      return;
    }

    if (this.selectedHeaderReservationId && !this.availableHeaderReservations.some(r => r.value.reservationId === this.selectedHeaderReservationId)) {
      if (preferredReservationId && this.availableHeaderReservations.some(r => r.value.reservationId === preferredReservationId)) {
        this.selectedHeaderReservationId = preferredReservationId;
        return;
      }
      this.selectedHeaderReservationId = null;
    }
  }

  async onHeaderReservationChange(): Promise<void> {
    if (this.selectedTabIndex === 0) {
      if (!this.selectedHeaderReservationId) {
        return;
      }
      if (this.selectedHeaderReservationId !== this.reservation?.reservationId) {
        const canLeave = await this.confirmNavigationWithUnsavedChanges();
        if (!canLeave) {
          this.selectedHeaderReservationId = this.reservation?.reservationId ?? this.reservationId ?? null;
          return;
        }
      }
      this.loadReservationFromHeaderSelection(this.selectedHeaderReservationId);
      return;
    }
    if (this.selectedTabIndex === 1 && this.selectedHeaderReservationId) {
      this.leaseReloadService.triggerReload();
    }
    if (this.selectedTabIndex === 3 && this.reservationEmailList) {
      this.reservationEmailList.reload();
    }
    if (this.selectedTabIndex === 4 && this.reservationDocumentList) {
      this.reservationDocumentList.reload();
    }
  }

  private loadReservationFromHeaderSelection(reservationId: string): void {
    if (!reservationId || this.reservation?.reservationId === reservationId) {
      return;
    }

    this.reservationService.getReservationByGuid(reservationId).pipe(take(1)).subscribe({
      next: (response: ReservationResponse) => {
        this.reservationId = response.reservationId;
        this.reservation = response;
        this.selectedProperty = this.properties.find(p => p.propertyId === response.propertyId) || null;
        this.selectedContact = this.contacts.find(c => c.contactId === response.contactId) || null;
        this.selectedHeaderReservationId = response.reservationId;
        this.populateForm();
        this.refreshHeaderReservationOptions();
      },
      error: () => {}
    });
  }

  get activeReservationId(): string | null {
    return this.selectedHeaderReservationId ?? null;
  }

  private normalizeDateForConflict(value: string | Date | null | undefined): Date {
    const d = value instanceof Date ? new Date(value) : new Date(value as string);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private applySelectedPropertyClearIfOfficeMismatch(): void {
    if (this.selectedProperty && this.selectedOffice && this.selectedProperty.officeId !== this.selectedOffice.officeId) {
      this.selectedProperty = null;
      this.form.patchValue({
        propertyId: '',
        propertyAddress: '',
        propertyCode: ''
      }, { emitEvent: false });
    }
  }

  get sharedOfficeId(): number | null {
    return this.selectedOffice?.officeId ?? this.selectedProperty?.officeId ?? this.reservation?.officeId ?? null;
  }

  get sharedPropertyId(): string | null {
    const formPropertyId = this.form?.get('propertyId')?.value;
    if (formPropertyId) {
      return String(formPropertyId);
    }
    return this.selectedProperty?.propertyId ?? this.reservation?.propertyId ?? null;
  }

  get sharedPropertyCode(): string | null {
    const formCode = this.form?.get('propertyCode')?.value;
    if (typeof formCode === 'string' && formCode.trim().length > 0) {
      return formCode.trim();
    }
    return this.selectedProperty?.propertyCode
      ?? this.properties.find(p => p.propertyId === this.reservation?.propertyId)?.propertyCode
      ?? null;
  }

  get sharedReservationId(): string | null {
    if (this.isAddMode) {
      return null;
    }
    return this.reservationId ?? this.reservation?.reservationId ?? null;
  }
  //#endregion

  //#region Validator Update Methods
  disableFieldWithValidation(controlName: string): void {
    const control = this.form?.get(controlName);
    if (control) {
      // Clear validators when disabling
      control.clearValidators();
      control.disable();
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  enableFieldWithValidation(controlName: string, validators?: any[]): void {
    const control = this.form?.get(controlName);
    if (control) {
      // Restore validators when enabling
      if (validators && validators.length > 0) {
        control.setValidators(validators);
      }
      control.enable({ emitEvent: false });
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
  //#endregion

  // #region Date Validation Methods
  validateDates(offendingField: 'arrivalDate' | 'departureDate' | 'save'): void {
    const propertyId = this.form.get('propertyId')?.value;
    const arrivalDate = this.form.get('arrivalDate')?.value;
    const departureDate = this.form.get('departureDate')?.value;

    // Need property and both dates to check for overlaps
    if (!propertyId || !arrivalDate || !departureDate) {
      // If called from save and dates are missing, proceed with save (validation will catch it)
      if (offendingField === 'save') {
        this.performSave();
      }
      return;
    }

    // Convert dates to Date objects if they aren't already
    const arrival = arrivalDate instanceof Date ? new Date(arrivalDate) : new Date(arrivalDate);
    const departure = departureDate instanceof Date ? new Date(departureDate) : new Date(departureDate);

    // Reset time to compare dates only
    arrival.setHours(0, 0, 0, 0);
    departure.setHours(0, 0, 0, 0);

    const selectedProperty = this.selectedProperty?.propertyId === propertyId
      ? this.selectedProperty : this.properties.find(p => p.propertyId === propertyId) || null;

    const availableFrom = this.parseDateOnly(selectedProperty?.availableFrom);
    if (availableFrom && arrival < availableFrom) {
      const message = `This property is not available until ${this.formatDateForMessage(availableFrom)}.`;
      this.handleAvailabilityDateError(message, offendingField === 'save' ? 'arrivalDate' : offendingField, offendingField === 'save');
      return;
    }

    const availableUntil = this.parseDateOnly(selectedProperty?.availableUntil);
    if (availableUntil && departure > availableUntil) {
      const message = `This property is not available after ${this.formatDateForMessage(availableUntil)}.`;
      this.handleAvailabilityDateError(message, offendingField === 'save' ? 'departureDate' : offendingField, offendingField === 'save');
      return;
    }

    // Get all reservations for this property
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1), catchError(() => of([] as ReservationListResponse[]))
    ).subscribe(reservations => {
      // Filter out the current reservation if editing
      const otherReservations = reservations.filter(r => 
        !this.reservation || r.reservationId !== this.reservation.reservationId
      );

      // Check for overlaps
      const conflictingReservation = otherReservations.find(r => {
        if (!r.arrivalDate || !r.departureDate) {
          return false;
        }

        const rArrival = new Date(r.arrivalDate);
        const rDeparture = new Date(r.departureDate);
        rArrival.setHours(0, 0, 0, 0);
        rDeparture.setHours(0, 0, 0, 0);

        // Check if dates overlap
        // Overlap occurs if: (arrival <= rDeparture && departure >= rArrival)
        return arrival <= rDeparture && departure >= rArrival;
      });

      if (conflictingReservation) {
        const reservationCode = conflictingReservation.reservationCode || conflictingReservation.reservationId;
        
        if (offendingField === 'save') {
          // On save, clear both dates and prevent save
          this.showDateOverlapDialog(reservationCode, true);
        } else {
          // On date change, clear the offending date
          this.showDateOverlapDialog(reservationCode, false);
          this.clearOffendingDate(offendingField);
        }
      } else if (offendingField === 'save') {
        // No overlap, proceed with save
        this.performSave();
      }
    });
  }

  private parseDateOnly(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? new Date(value) : new Date(value);
    if (isNaN(parsed.getTime())) {
      return null;
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private formatDateForMessage(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  private handleAvailabilityDateError(
    message: string,
    fieldToClear: 'arrivalDate' | 'departureDate',
    preserveOnSave: boolean
  ): void {
    this.toastr.error(message, CommonMessage.Error);
    if (!preserveOnSave) {
      this.clearOffendingDate(fieldToClear);
    }
  }

  clearOffendingDate(field: 'arrivalDate' | 'departureDate'): void {
    if (field === 'arrivalDate') {
      this.form.patchValue({ arrivalDate: null }, { emitEvent: false });
      this.departureDateStartAt = null;
    } else if (field === 'departureDate') {
      this.form.patchValue({ departureDate: null }, { emitEvent: false });
    }
  }

  showDateOverlapDialog(reservationCode: string, resetDates: boolean = false): void {
    const dialogData: GenericModalData = {
      title: 'Date Conflict',
      message: `The selected dates overlap with an existing reservation.<br><div style="text-align: center; margin-top: 10px;"><strong>${reservationCode}</strong></div>`,
      icon: 'warning' as any,
      iconColor: 'warn',
      no: '',
      yes: 'OK',
      callback: (dialogRef, result) => {
        if (resetDates) {
          // Reset arrival and departure dates
          this.form.patchValue({
            arrivalDate: null,
            departureDate: null
          }, { emitEvent: false });
          this.departureDateStartAt = null;
        }
        dialogRef.close();
      },
      useHTML: true
    };

    this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });
  }
  //#endregion
 
  //#region Format Methods
  formatDecimal(fieldName: string): void {
    this.formatterService.formatDecimalControl(this.form.get(fieldName));
  }

  onDecimalInput(event: Event, fieldName: string): void {
    this.formatterService.formatDecimalInput(event, this.form.get(fieldName));
  }

  selectAllOnFocus(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  onIntegerInput(event: Event, fieldName: string): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    input.value = value;
    this.form.get(fieldName)?.setValue(value, { emitEvent: false });
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  onExtraFeeAmountInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    let value = input.value;
    
    // Check if value starts with minus sign
    const isNegative = value.startsWith('-');
    
    // Strip non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Allow negative sign if present
    if (isNegative) {
      value = '-' + value;
    }
    
    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      input.value = parts[0] + '.' + parts.slice(1).join('');
    } else {
      input.value = value;
    }
  }

  onExtraFeeAmountFocus(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    // Set initial value on focus - show raw number without formatting (same as ledger line)
    if (line && line.feeAmount != null && line.feeAmount !== undefined) {
      input.value = line.feeAmount.toString();
      input.select(); // Select all text (same as selectAllOnFocus)
    } else {
      input.value = '';
    }
  }

  onExtraFeeAmountBlur(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const line = this.extraFeeLines[index];
    if (line) {
      // Check if value is negative
      const isNegative = input.value.startsWith('-');
      // Parse and format exactly like ledger line amount
      const rawValue = input.value.replace(/[^0-9.]/g, '').trim();
      let numValue: number;
      let formattedValue: string;
      
      if (rawValue !== '' && rawValue !== null) {
        const parsed = parseFloat(rawValue);
        if (!isNaN(parsed)) {
          // Use sign from input (allow negative amounts)
          const finalValue = isNegative ? -parsed : parsed;
          // Format to 2 decimal places (same as ledger line)
          formattedValue = finalValue.toFixed(2);
          numValue = parseFloat(formattedValue);
        } else {
          formattedValue = '0.00';
          numValue = 0;
        }
      } else {
        formattedValue = '0.00';
        numValue = 0;
      }
      
      // Update the input display value
      input.value = formattedValue;
      
      // Update the model
      this.updateExtraFeeLineField(index, 'feeAmount', numValue);
    }
  }

  onExtraFeeAmountEnter(event: Event, index: number): void {
    // Prevent default form submission behavior
    event.preventDefault();
    // Blur the input to complete the edit (same as pressing Tab)
    const input = event.target as HTMLInputElement;
    input.blur();
  }
  //#endregion

  //#region Tab Selection Methods
  onTabChange(event: any): void {
    this.selectedTabIndex = event.index;
    this.refreshHeaderReservationOptions();
    if (event.index === 1) {
      const defaultReservationId = this.sharedReservationId ?? this.reservation?.reservationId ?? null;
      if (!this.selectedHeaderReservationId && defaultReservationId) {
        this.selectedHeaderReservationId = defaultReservationId;
      }
      this.onHeaderReservationChange();
    }
    const tabParam = this.getTabParamFromIndex(event.index);

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tabParam },
      queryParamsHandling: 'merge'
    });

    // When Email tab (index 3) is selected, reload the email list
    if (event.index === 3 && this.reservationEmailList) {
      this.reservationEmailList.reload();
    }

    // When Documents tab (index 4) is selected, reload the document list
    if (event.index === 4 && this.reservationDocumentList) {
      this.reservationDocumentList.reload();
    }
  }
  
 getTabIndexFromQueryParam(tabParam: string | undefined): number {
    if (!tabParam) {
      return 0;
    }

    return this.tabParamToIndex[tabParam] ?? 0;
  }

  getTabParamFromIndex(tabIndex: number): string | null {
    switch (tabIndex) {
      case 1:
        return 'lease';
      case 2:
        return 'invoices';
      case 3:
        return 'email';
      case 4:
        return 'documents';
      default:
        return null;
    }
  }
  //#endregion

  //#region Utility Methods
  back(): void {
    this.confirmNavigationWithUnsavedChanges().then(canLeave => {
      if (!canLeave) {
        return;
      }
      const returnTo = this.route.snapshot.queryParamMap.get('returnTo');
      if (returnTo === 'reservation-board') {
        this.router.navigateByUrl(RouterUrl.ReservationBoard);
        return;
      }
      this.router.navigateByUrl(RouterUrl.ReservationList);
    });
  }

  canDeactivate(): Promise<boolean> | boolean {
    return this.confirmNavigationWithUnsavedChanges();
  }

  getCurrentStateSignature(): string {
    const formSignature = this.form ? JSON.stringify(this.form.getRawValue()) : '';
    const feesSignature = JSON.stringify(this.extraFeeLines || []);
    return `${formSignature}|${feesSignature}`;
  }

  captureSavedStateSignature(): void {
    this.lastSavedStateSignature = this.getCurrentStateSignature();
    this.hasSavedStateSignature = true;
    this.form?.markAsPristine();
  }

  hasUnsavedChanges(): boolean {
    if (!this.form || this.isSubmitting) {
      return false;
    }
    const currentSignature = this.getCurrentStateSignature();
    if (!this.hasSavedStateSignature) {
      this.lastSavedStateSignature = currentSignature;
      this.hasSavedStateSignature = true;
      return false;
    }
    return currentSignature !== this.lastSavedStateSignature;
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const dialogData: GenericModalData = {
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Do you want to save before leaving this page?',
      icon: 'warning' as any,
      iconColor: 'warn',
      no: 'No',
      yes: 'Yes',
      callback: (dialogRef, result) => dialogRef.close(result),
      useHTML: false,
      hideClose: true
    };
    const dialogRef = this.dialog.open(GenericModalComponent, {
      data: dialogData,
      width: '35rem'
    });
    const shouldSave = await firstValueFrom(dialogRef.afterClosed());
    if (shouldSave === true) {
      this.saveReservation();
    }
    return true;
  }

  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.costCodesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
