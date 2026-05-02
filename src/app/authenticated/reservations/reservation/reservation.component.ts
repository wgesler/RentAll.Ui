import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, Subscription, catchError, filter, finalize, map, of, pairwise, skip, startWith, take, takeUntil } from 'rxjs';
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
import { EmailRequest } from '../../email/models/email.model';
import { EmailListComponent } from '../../email/email-list/email-list.component';
import { EmailType } from '../../email/models/email.enum';
import { EmailService } from '../../email/services/email.service';
import { AgentResponse } from '../../organizations/models/agent.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AgentService } from '../../organizations/services/agent.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { CheckinTimes, CheckoutTimes, getCheckInTimes, getCheckOutTimes, normalizeCheckInTimeId, normalizeCheckOutTimeId } from '../../properties/models/property-enums';
import { PropertyListResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { SearchableSelectComponent, SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { GenericModalComponent } from '../../shared/modals/generic/generic-modal.component';
import { GenericModalData } from '../../shared/modals/generic/models/generic-modal-data';
import { AddAlertDialogComponent, AddAlertDialogData } from '../../shared/modals/add-alert-dialog/add-alert-dialog.component';
import { UnsavedChangesDialogService } from '../../shared/modals/unsaved-changes/unsaved-changes-dialog.service';
import { LeaseComponent } from '../lease/lease.component';
import { BillingMethod, BillingType, DepositType, Frequency, ProrateType, ReservationNotice, ReservationStatus, ReservationType, getBillingMethods, getBillingTypes, getDepositTypes, getFrequencies, getProrateTypes, getReservationNotices, getReservationStatus, getReservationStatuses, getReservationTypes } from '../models/reservation-enum';
import { ExtraFeeLineRequest, ReservationListResponse, ReservationRequest, ReservationResponse } from '../models/reservation-model';
import { LeaseReloadService } from '../services/lease-reload.service';
import { ReservationService } from '../services/reservation.service';
import { UserGroups } from '../../users/models/user-enums';
import { UserResponse } from '../../users/models/user.model';
import { UserService } from '../../users/services/user.service';

// Display interface for ExtraFeeLine in the UI
interface ExtraFeeLineDisplay {
  extraFeeLineId: string | null;
  feeDescription: string | null;
  feeAmount: number | undefined;
  feeFrequencyId: number | undefined;
  costCodeId: number | undefined;
  isNew?: boolean; // Track if this is a new line
}

interface AdditionalContactRow {
  contactId: string;
  contactPhone: string;
  contactEmail: string;
}

type ReservationNotificationContext = {
  shouldNotify: boolean;
  isNewReservation: boolean;
  isCancellation: boolean;
  arrivalDateChanged: boolean;
  departureDateChanged: boolean;
};

@Component({
    standalone: true,
    selector: 'app-reservation',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, SearchableSelectComponent, TitleBarSelectComponent, LeaseComponent, DocumentListComponent, EmailListComponent, InvoiceListComponent],
    templateUrl: './reservation.component.html',
    styleUrl: './reservation.component.scss'
})

export class ReservationComponent implements OnInit, OnDestroy, CanComponentDeactivate {
  @Input() shellMode: boolean = false;
  @ViewChild('reservationDocumentList') reservationDocumentList?: DocumentListComponent;
  @ViewChild('reservationEmailList') reservationEmailList?: EmailListComponent;
  @ViewChildren('extraFeeDescriptionInput') extraFeeDescriptionInputs?: QueryList<ElementRef<HTMLInputElement>>;
  
  isServiceError: boolean = false;
  selectedTabIndex: number = 0;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  propertyPanelOpen: boolean = true;
  billingPanelOpen: boolean = true;
  ReservationType = ReservationType; 
  EntityType = EntityType; 
  DocumentType = DocumentType; 
  EmailType = EmailType;
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
  housekeepingUsers: UserResponse[] = [];
  housekeepingById = new Map<string, string>();
  housekeepingUserOptions: string[] = [];
  contacts: ContactResponse[] = [];
  companyContacts: ContactResponse[] = [];
  filteredContacts: ContactResponse[] = [];
  selectedContact: ContactResponse | null = null;
  additionalContactRows: AdditionalContactRow[] = [];
  properties: PropertyListResponse[] = [];
  availableProperties: PropertyListResponse[] = [];
  selectedProperty: PropertyListResponse | null = null;
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

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['agents', 'properties', 'contacts', 'cleaners']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();
  readonly newContactOptionValue = '__new_contact__';
  readonly noneAgentOptionValue = '__none_agent__';
  readonly noneAssignedMaidOptionValue = '__none_assigned_maid__';
  savedFormState: Record<string, unknown> | null = null;
  savedExtraFeeLinesState: ExtraFeeLineDisplay[] = [];
  readonly agentSelectionRequiredValidator: ValidatorFn = (control: AbstractControl) => {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return { required: true };
    }
    return null;
  };

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
    private emailService: EmailService,
    private commonService: CommonService,
    private authService: AuthService,
    public formatterService: FormatterService,
    private dialog: MatDialog,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private costCodesService: CostCodesService,
    private globalSelectionService: GlobalSelectionService,
    private unsavedChangesDialogService: UnsavedChangesDialogService,
    private userService: UserService
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
    this.loadHousekeepingUsers();
    this.loadOffices();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      if (this.offices.length > 0 && this.isAddMode) {
        this.resolveOfficeScope(officeId);
        if (this.selectedOffice) {
          this.loadCostCodes();
        }
        this.filterPropertiesByOffice();
      }
    });


    this.buildForm();
    
    // Get route params first
    this.route.paramMap.pipe(take(1)).subscribe((paramMap: ParamMap) => {
      this.reservationId = paramMap.get('id') || null;
      this.isAddMode = !this.reservationId || this.reservationId === 'new';
      
      if (this.isAddMode) {
        this.propertyPanelOpen = true;
        this.billingPanelOpen = true;
        this.updatePetFields();
        this.updateMaidServiceFields();
        this.extraFeeLines = [];
      }
    });
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
        this.selectedTabIndex = 0;

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
          const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
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
        this.loadReservation();
      }
    });
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  getPrimaryReservationContactId(reservation: ReservationResponse | null | undefined): string | null {
    const contactIds = reservation?.contactIds || [];
    const firstContactId = contactIds.find(id => String(id || '').trim().length > 0);
    return firstContactId ? String(firstContactId) : null;
  }

  applyCopyFromReservation(source: ReservationResponse): void {
    if (!this.form || !source) return;

    this.selectedOffice = this.offices.find(o => o.officeId === source.officeId) || null;
    this.selectedProperty = null;
    this.selectedContact = this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(source)) || null;
    if (this.selectedOffice) {
      this.loadCostCodes();
    }
    this.filterPropertiesByOffice();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const arrivalSource = this.parseDateOnly(source.arrivalDate);
    const departureSource = this.parseDateOnly(source.departureDate);
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
      agentId: source.reservationTypeId === ReservationType.Owner
        ? null
        : (source.agentId || this.noneAgentOptionValue),
      contactId: this.getPrimaryReservationContactId(source) || null,
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
      maidUserId: (source.maidUserId && String(source.maidUserId).trim())
        ? String(source.maidUserId).trim()
        : this.noneAssignedMaidOptionValue,
      maidServiceFee: (source.maidServiceFee ?? 0).toFixed(2),
      frequencyId: source.frequencyId ?? Frequency.NA,
      taxes: source.taxes === 0 ? null : source.taxes,
      notes: source.notes || ''
    }, { emitEvent: false });

    const departurePickerStart = new Date(today);
    departurePickerStart.setDate(departurePickerStart.getDate() + 1);
    this.departureDateStartAt = departurePickerStart;
    this.buildAdditionalContactRows(source.contactIds || []);
    this.updateContactFields();
    this.applyPlatformCompanyDetails(source.companyId ?? null, source.companyName ?? null);
    this.updatePetFields(false);
    this.updateMaidServiceFields(false);
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

  applyAddModePrefillFromQueryParams(): void {
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
        const start = new Date(parsedStartDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() + 1);
        this.departureDateStartAt = start;
      }

      if (Object.keys(patch).length > 0) {
        this.form.patchValue(patch);
      }
    });
  }

  parseDateFromQuery(value?: string): Date | null {
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

  saveReservation(): void {
    this.touchAllFormControls(this.form);
    this.form.markAsTouched();
    this.form.markAsDirty();
    this.validateNumberOfPeopleAgainstContacts();
    this.form.updateValueAndValidity({ emitEvent: false });
    
    if (!this.form.valid) {
      this.toastr.error('Please fill in all required fields', CommonMessage.Error);
      return;
    }

    if (!this.validateExtraFeeLines()) {
      return;
    }

    this.validateDates('save');
  }

  touchAllFormControls(control: AbstractControl): void {
    if (control instanceof FormGroup) {
      Object.keys(control.controls).forEach(key => this.touchAllFormControls(control.controls[key]));
      return;
    }

    control.markAsTouched();
    control.markAsDirty();
    control.updateValueAndValidity({ emitEvent: false });
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

      const deletedReservation = this.reservation ? { ...this.reservation, isDeleted: true } : null;
      this.isSubmitting = true;
      this.reservationService.deleteReservation(this.reservationId).pipe(
        take(1),
        finalize(() => this.isSubmitting = false)
      ).subscribe({
        next: () => {
          this.sendReservationChangeNotification(deletedReservation, {
            shouldNotify: true,
            isNewReservation: false,
            isCancellation: true,
            arrivalDateChanged: false,
            departureDateChanged: false
          });
          this.toastr.success('Reservation deleted successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          this.navigateToReservationEntryOrigin();
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

    const reservationTypeId = formValue.reservationTypeId !== null && formValue.reservationTypeId !== undefined
      ? Number(formValue.reservationTypeId)
      : ReservationType.Individual;
    const isOwnerReservationType = reservationTypeId === ReservationType.Owner;

    const agentIdRaw = formValue.agentId;
    const agentId = agentIdRaw === this.noneAgentOptionValue ? null : agentIdRaw;
    if (!isOwnerReservationType && (agentIdRaw == null || String(agentIdRaw).trim() === '')) {
      this.toastr.error('Agent is required', CommonMessage.Error);
      this.isSubmitting = false;
      return;
    }

    const companyIdRaw = formValue.companyContact;
    const companyNameRaw = formValue.companyName;
    const companyId = companyIdRaw == null || String(companyIdRaw).trim() === '' ? null : String(companyIdRaw).trim();
    const companyName = companyNameRaw == null || String(companyNameRaw).trim() === '' ? null : String(companyNameRaw).trim();
    const selectedContactIds = this.getSelectedContactIdsFromForm();

    const reservationRequest: ReservationRequest = {
      organizationId: user?.organizationId || '',
      officeId: officeId,
      propertyId: formValue.propertyId,
      agentId: isOwnerReservationType
        ? null
        : (agentId == null || String(agentId).trim() === '' ? null : String(agentId)),
      contactIds: selectedContactIds,
      companyId: companyId,
      companyName: companyName,
      reservationTypeId: reservationTypeId,
      reservationStatusId: formValue.reservationStatusId ?? ReservationStatus.PreBooking,
      reservationNoticeId: formValue.reservationNoticeId !== null && formValue.reservationNoticeId !== undefined ? Number(formValue.reservationNoticeId) : ReservationNotice.ThirtyDays,
      numberOfPeople: formValue.numberOfPeople ? Number(formValue.numberOfPeople) : 1,
      hasPets: formValue.pets ?? false,
      tenantName: formValue.tenantName || '',
      referenceNo: formValue.referenceNo || '',
      arrivalDate:
        this.utilityService.formatDateOnlyForApi(formValue.arrivalDate as Date | null | undefined) ??
        this.utilityService.todayAsCalendarDateString(),
      departureDate:
        this.utilityService.formatDateOnlyForApi(formValue.departureDate as Date | null | undefined) ??
        this.utilityService.todayAsCalendarDateString(),
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
      maidStartDate:
        this.utilityService.formatDateOnlyForApi(formValue.maidStartDate as Date | null | undefined) ??
        this.utilityService.todayAsCalendarDateString(),
      petFee: formValue.petFee ? parseFloat(formValue.petFee.toString()) : 0,
      numberOfPets: formValue.numberOfPets ? Number(formValue.numberOfPets) : 0,
      petDescription: formValue.petDescription || undefined,
      taxes: formValue.taxes ? parseFloat(formValue.taxes.toString()) : 0,
      extraFeeLines: this.mapExtraFeeLinesToRequest(),
      notes: formValue.notes !== null && formValue.notes !== undefined ? String(formValue.notes) : '',
      allowExtensions: formValue.allowExtensions ?? false,
      paymentReceived: this.reservation?.paymentReceived ?? false,
      welcomeLetterChecked: this.reservation?.welcomeLetterChecked ?? false,
      welcomeLetterSent: this.reservation?.welcomeLetterSent ?? false,
      readyForArrival: this.reservation?.readyForArrival ?? false,
      code: this.reservation?.code ?? false,
      departureLetterChecked: this.reservation?.departureLetterChecked ?? false,
      departureLetterSent: this.reservation?.departureLetterSent ?? false,
      currentInvoiceNo: formValue.currentInvoiceNo ?? 0,
      isActive: formValue.isActive ?? true
    };

    if (!this.isAddMode) {
      reservationRequest.reservationId = this.reservationId;
      reservationRequest.organizationId = this.reservation?.organizationId || user?.organizationId || '';
      reservationRequest.reservationCode = this.reservation?.reservationCode || formValue.reservationCode || '';
    }

    const reservationNotificationContext = this.getReservationNotificationContext(formValue);

    const save$ = this.isAddMode
      ? this.reservationService.createReservation(reservationRequest)
      : this.reservationService.updateReservation(reservationRequest);

    save$.pipe(take(1),  finalize(() => this.isSubmitting = false) ).subscribe({
      next: (response: ReservationResponse) => {
        const message = this.isAddMode ? 'Reservation created successfully' : 'Reservation updated successfully';
        this.toastr.success(message, CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.sendReservationChangeNotification(response, reservationNotificationContext);
        
        if (this.isAddMode && response) {
          this.captureSavedStateSignature();
          this.navigateToReservationEntryOrigin();
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
      agentId: new FormControl(null, [this.agentSelectionRequiredValidator]),
      tenantName: new FormControl('', [Validators.required]), // Always enabled
      referenceNo: new FormControl(''),
      contactId: new FormControl('', [Validators.required]), // Always enabled
      companyName: new FormControl({ value: '', disabled: true }),
      companyContact: new FormControl(''),
      contactPhone: new FormControl({ value: '', disabled: true }),
      contactEmail: new FormControl({ value: '', disabled: true }),
      reservationTypeId: new FormControl(null, [Validators.required]),
      reservationStatusId: new FormControl(null, [Validators.required]),
      reservationNoticeId: new FormControl(ReservationNotice.ThirtyDays, [Validators.required]),
      arrivalDate: new FormControl(null, [Validators.required]),
      departureDate: new FormControl(null, [Validators.required, this.departureAfterArrivalValidator]),
      checkInTimeId: new FormControl<number>(CheckinTimes.FourPM, [Validators.required]),
      checkOutTimeId: new FormControl<number>(CheckoutTimes.ElevenAM, [Validators.required]),
      lockBoxCode: new FormControl(''),
      unitTenantCode: new FormControl(''),
      billingTypeId: new FormControl(BillingType.Monthly, [Validators.required]),
      billingMethodId: new FormControl(BillingMethod.Invoice, [Validators.required]),
      prorateTypeId: new FormControl<number | null>(ProrateType.FirstMonth),
      billingRate: new FormControl<string>('0.00', [Validators.required]),
      numberOfPeople: new FormControl(1, [Validators.required]),
      pets: new FormControl(false, [Validators.required]),
      petFee: new FormControl<string>('0.00'),
      numberOfPets: new FormControl(0),
      petDescription: new FormControl(''),
      maidService: new FormControl(false, [Validators.required]),
      maidStartDate: new FormControl<Date | null>(null),
      maidUserId: new FormControl<string>(this.noneAssignedMaidOptionValue),
      phone: new FormControl({ value: '', disabled: true }),
      email: new FormControl({ value: '', disabled: true }),
      depositType: new FormControl(DepositType.Deposit, [Validators.required]),
      deposit: new FormControl<string>('0.00'),
      departureFee: new FormControl<string>('0.00', [Validators.required]),
      maidServiceFee: new FormControl<string>('0.00'),
      frequencyId: new FormControl(Frequency.NA),
      taxes: new FormControl(null),
      notes: new FormControl(''),
      currentInvoiceNo: new FormControl(0)
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
    this.selectedContact = this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(this.reservation));
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
      agentId: this.reservation.reservationTypeId === ReservationType.Owner
        ? null
        : (this.reservation.agentId || this.noneAgentOptionValue),
      contactId: this.getPrimaryReservationContactId(this.reservation) || null,
      companyName: (this.reservation as { companyName?: string })?.companyName ?? '',
      tenantName: this.reservation.tenantName || '',
      referenceNo: this.reservation.referenceNo || '',
      reservationStatusId: this.reservation.reservationStatusId,
      reservationNoticeId: this.reservation.reservationNoticeId,
      arrivalDate: this.parseDateOnly(this.reservation.arrivalDate),
      departureDate: this.parseDateOnly(this.reservation.departureDate),
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
      maidStartDate: this.parseDateOnly(this.reservation.maidStartDate),
     maidUserId: (this.reservation.maidUserId && String(this.reservation.maidUserId).trim())
        ? String(this.reservation.maidUserId).trim()
        : this.noneAssignedMaidOptionValue,
      maidServiceFee: (this.reservation.maidServiceFee ?? 0).toFixed(2),
      frequencyId: this.reservation.frequencyId ?? Frequency.NA,
      taxes: this.reservation.taxes === 0 ? null : this.reservation.taxes,
      notes: this.reservation.notes || ''
    }, { emitEvent: false });

    // Find selected contact - contacts are guaranteed to be loaded at this point
    this.selectedContact = this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(this.reservation));
    this.buildAdditionalContactRows(this.reservation.contactIds || []);
    this.updateContactFields();
    this.applyPlatformCompanyDetails(this.reservation.companyId ?? null, this.reservation.companyName ?? null);
   
    // Update pet and maid service fields after patching
    this.updatePetFields(false);
    this.updateMaidServiceFields(false);
    this.loadExtraFeeLines();
    this.updateMaidStartDate();
    this.updatePropertyIdEditState();

    const arr = this.form.get('arrivalDate')?.value;
    const dep = this.form.get('departureDate')?.value;
    if (arr && dep) {
      const a = this.parseDateOnly(arr);
      const d = this.parseDateOnly(dep);
      if (!a || !d) {
        this.departureDateStartAt = null;
      } else if (d.getTime() > a.getTime()) {
        this.departureDateStartAt = new Date(d.getTime());
      } else {
        const s = new Date(a.getTime());
        s.setDate(s.getDate() + 1);
        this.departureDateStartAt = s;
      }
    } else if (arr && !dep) {
      const a0 = this.parseDateOnly(arr);
      if (!a0) {
        this.departureDateStartAt = null;
      } else {
        const s = new Date(a0.getTime());
        s.setDate(s.getDate() + 1);
        this.departureDateStartAt = s;
      }
    } else {
      this.departureDateStartAt = null;
    }
    this.form.get('departureDate')?.updateValueAndValidity({ emitEvent: false });

    this.captureSavedStateSignature();
  }

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

  departureAfterArrivalValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const group = control.parent;
    if (!group) {
      return null;
    }
    const arrivalRaw = group.get('arrivalDate')?.value;
    const departureRaw = control.value;
    if (!arrivalRaw || !departureRaw) {
      return null;
    }
    const arrival = this.parseDateOnly(arrivalRaw);
    const departure = this.parseDateOnly(departureRaw);
    if (!arrival || !departure) {
      return null;
    }
    return departure.getTime() > arrival.getTime() ? null : { departureAfterArrival: true };
  };

  getMinDepartureDate(): Date | null {
    if (!this.form) {
      return null;
    }
    const arrivalDate = this.form.get('arrivalDate')?.value;
    if (!arrivalDate) {
      return null;
    }
    const base = this.parseDateOnly(arrivalDate);
    if (!base) {
      return null;
    }
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + 1);
    return d;
  }

  departureDateCalendarFilter = (date: Date | null): boolean => {
    if (!date) {
      return false;
    }
    const min = this.getMinDepartureDate();
    if (!min) {
      return true;
    }
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() >= min.getTime();
  }; 
  //#endregion

  //#region Data Load Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.contacts = contacts || [];
        this.companyContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);
        if (this.additionalContactRows.length > 0) {
          this.buildAdditionalContactRows(this.getSelectedContactIdsFromForm());
        }
      },
      error: () => {
        this.contacts = [];
        this.companyContacts = [];
        this.additionalContactRows = [];
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

  loadReservation(reservationId?: string): void {
    if (this.isAddMode) {
      return;
    }

    const targetReservationId = reservationId ?? this.reservationId;
    if (!targetReservationId || this.reservation?.reservationId === targetReservationId) {
      return;
    }

    const isInitialLoad = !reservationId;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservation');
    this.reservationService.getReservationByGuid(targetReservationId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'); })).subscribe({
      next: (response: ReservationResponse) => {
        this.reservationId = response.reservationId;
        this.reservation = response;
        this.selectedProperty = this.properties.find(p => p.propertyId === response.propertyId) || null;
        this.selectedContact = this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(response)) || null;
        this.populateForm();
      },
      error: () => {
        if (isInitialLoad) {
          this.isServiceError = true;
        }
      }
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

  loadHousekeepingUsers(): void {
    this.userService.getUsersByType(UserGroups[UserGroups.Housekeeping]).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'cleaners'))).subscribe({
      next: (users: UserResponse[]) => {
        this.housekeepingUsers = users || [];
        this.housekeepingById = new Map(this.housekeepingUsers.map(user => [user.userId, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]));
        const names = this.housekeepingUsers.map(user => `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()).filter(name => name !== '');
        names.unshift('Clear Selection');
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, ...names);
      },
      error: () => {
        this.housekeepingUsers = [];
        this.housekeepingById = new Map<string, string>();
        this.housekeepingUserOptions.splice(0, this.housekeepingUserOptions.length, 'Clear Selection');
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
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1)).subscribe({
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
            value: c.costCodeId,
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
  //#endregion

 //#region Form Value Change Handlers
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
    this.updateCompanyContactRequirement();
    
    this.handlersSetup = true;
  }
  
  setupPropertySelectionHandler(): void {
    this.form.get('propertyId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(propertyId => {
      this.selectedProperty = propertyId ? this.availableProperties.find(p => p.propertyId === propertyId) || null : null;
      if (this.selectedProperty) {
        const propertyOffice = this.offices.find(o => o.officeId === this.selectedProperty!.officeId) || null;
        if (propertyOffice && this.selectedOffice?.officeId !== propertyOffice.officeId) {
          this.selectedOffice = propertyOffice;
          this.loadCostCodes();
          this.filterPropertiesByOffice();
        }
      }
      const selectedContactId = this.getPrimaryReservationContactId(this.reservation);
      if (selectedContactId) {
        this.selectedContact = this.contacts.find(c => c.contactId === selectedContactId);
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
      this.updatePetFields(this.isAddMode);
      this.updateMaidServiceFields(this.isAddMode);
      this.updateContactFields();
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
    const reservationTypeControl = this.form.get('reservationTypeId');
    reservationTypeControl?.valueChanges.pipe(startWith(reservationTypeControl.value), pairwise(), takeUntil(this.destroy$)).subscribe(([previousReservationTypeId, reservationTypeId]) => {
      this.updateReservationStatusesByReservationType();
      this.updateContactsByReservationType();
      this.applyDefaultProrateTypeByReservationType(reservationTypeId);
      this.applyDefaultDepositTypeByReservationType(reservationTypeId);
      this.updateEnabledFieldsByReservationType();

      const shouldPreserveContactId = this.isIndividualPlatformReservationTypeChange(previousReservationTypeId as number | null, reservationTypeId as number | null);
      this.form.patchValue({
        contactPhone: '',
        contactEmail: '',
        phone: '',
        email: '',
        companyName: '',
        companyContact: '',
        tenantName: '',
        referenceNo: '',
        contactId: shouldPreserveContactId ? this.form.get('contactId')?.value || '' : ''
      }, { emitEvent: false });

      // Clear selected contact reference except Individual <-> Platform switches.
      if (shouldPreserveContactId) {
        const preservedContactId = (this.form.get('contactId')?.value || '').toString().trim();
        this.selectedContact = preservedContactId
          ? this.contacts.find(contact => contact.contactId === preservedContactId) || null
          : null;
      } else {
        this.selectedContact = null;
      }
      this.additionalContactRows = [];
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
    this.form.get('pets')?.valueChanges.pipe(startWith(this.form.get('pets')?.value ?? false), pairwise(), takeUntil(this.destroy$)).subscribe(([previousPets, currentPets]) => {
      const applyEnabledDefaults = !previousPets && Boolean(currentPets);
      this.updatePetFields(applyEnabledDefaults);
    });
  }

  updateMaidStartDate(): void {
    const arrivalDate = this.form.get('arrivalDate')?.value;
    const maidStartDateControl = this.form.get('maidStartDate');
    
    // Always update maidStartDate to arrivalDate + 7 days when arrivalDate changes
    // (field will be disabled/grayed out if maidService is false)
    if (arrivalDate && maidStartDateControl) {
      const arrival = this.parseDateOnly(arrivalDate);
      if (!arrival) {
        return;
      }
      const arrivalPlus7Days = new Date(arrival.getTime());
      arrivalPlus7Days.setDate(arrivalPlus7Days.getDate() + 7);
      const currentMaidStartDate = this.parseDateOnly(maidStartDateControl.value);
      
      // If maidStartDate is null or before arrivalDate, set it to arrivalDate + 7 days
      if (!currentMaidStartDate || currentMaidStartDate < arrival) {
        maidStartDateControl.setValue(arrivalPlus7Days, { emitEvent: false });
      }
    }
  }

  setupMaidServiceHandler(): void {
    this.form.get('maidService')?.valueChanges.pipe(startWith(this.form.get('maidService')?.value ?? false), pairwise(), takeUntil(this.destroy$)).subscribe(([previousMaidService, currentMaidService]) => {
      const applyEnabledDefaults = !previousMaidService && Boolean(currentMaidService);
      this.updateMaidServiceFields(applyEnabledDefaults);
      
      // When maidService becomes enabled, initialize maidStartDate if arrivalDate exists
      if (applyEnabledDefaults && currentMaidService) {
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
      const departureControl = this.form.get('departureDate');
      const departureDate = departureControl?.value;

      // If arrival date is set and departure date is unset, start calendar at first allowed departure day
      if (arrivalDate && !departureDate) {
        const a0 = this.parseDateOnly(arrivalDate);
        if (!a0) {
          this.departureDateStartAt = null;
        } else {
          const start = new Date(a0.getTime());
          start.setDate(start.getDate() + 1);
          this.departureDateStartAt = start;
        }
      } else if (!arrivalDate) {
        this.departureDateStartAt = null;
      }

      if (arrivalDate && departureDate) {
        const a = this.parseDateOnly(arrivalDate);
        const dep = this.parseDateOnly(departureDate);
        if (a && dep && dep.getTime() <= a.getTime()) {
          departureControl?.setValue(null, { emitEvent: true });
        }
      }
      departureControl?.updateValueAndValidity({ emitEvent: false });

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
    const contactId = this.form.get('contactId')?.value || this.getPrimaryReservationContactId(this.reservation);

    if (reservationTypeId === ReservationType.Individual) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Tenant);
    else if (reservationTypeId === ReservationType.Corporate) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);
    else if (reservationTypeId === ReservationType.Owner) 
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Owner);
    else if (reservationTypeId === ReservationType.Platform)
      this.filteredContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Tenant);
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

  //#region Contact List Methods
  get contactNameOptionsNoCreate(): SearchableSelectOption[] {
    return [
      { value: this.newContactOptionValue, label: 'New Contact' },
      ...this.filteredContacts.map(contact => ({
        value: contact.contactId,
        label: this.getContactNameLabel(contact)
      }))
    ];
  }

  get companyContactOptions(): SearchableSelectOption[] {
    return this.companyContacts.map(contact => ({
      value: contact.contactId,
      label: this.getContactNameLabel(contact)
    }));
  }

  getContactNameLabel(contact: ContactResponse): string {
    if (contact.entityTypeId === EntityType.Company) {
      return `${contact.displayName ?? contact.companyName}: ${contact.firstName} ${contact.lastName}`;
    }
    return `${contact.firstName} ${contact.lastName}`;
  }

  onContactNameChange(contactId: string | number | null): void {
    const normalizedContactId = contactId === null || contactId === undefined ? '' : String(contactId);
    const contactControl = this.form.get('contactId');
    contactControl?.setValue(normalizedContactId);
    contactControl?.markAsTouched();
    contactControl?.markAsDirty();
    this.validateNumberOfPeopleAgainstContacts();
  }

  onAdditionalContactNameChange(index: number, contactId: string | number | null): void {
    const normalizedContactId = contactId === null || contactId === undefined ? '' : String(contactId).trim();
    if (normalizedContactId === this.newContactOptionValue) {
      this.additionalContactRows[index] = {
        contactId: '',
        contactPhone: '',
        contactEmail: ''
      };
      this.openNewContactDialog(index);
      return;
    }

    const selectedContact = normalizedContactId ? this.contacts.find(c => c.contactId === normalizedContactId) || null : null;
    this.additionalContactRows[index] = {
      contactId: normalizedContactId,
      contactPhone: selectedContact ? (this.formatterService.phoneNumber(selectedContact.phone) || '') : '',
      contactEmail: selectedContact?.email || ''
    };
    this.syncTenantNamesFromSelectedContacts();
    this.validateNumberOfPeopleAgainstContacts();
  }

  addAdditionalContactRow(): void {
    this.additionalContactRows.unshift({
      contactId: '',
      contactPhone: '',
      contactEmail: ''
    });
    this.validateNumberOfPeopleAgainstContacts();
  }

  removeAdditionalContactRow(index: number): void {
    if (index < 0 || index >= this.additionalContactRows.length) {
      return;
    }
    this.additionalContactRows.splice(index, 1);
    this.syncTenantNamesFromSelectedContacts();
    this.validateNumberOfPeopleAgainstContacts();
  }

  buildAdditionalContactRows(contactIds: string[] | null | undefined): void {
    const additionalContactIds = (contactIds || [])
      .map(id => String(id || '').trim())
      .filter((id, index) => id.length > 0 && index > 0);
    this.additionalContactRows = additionalContactIds.map(contactId => {
      const matchedContact = this.contacts.find(c => c.contactId === contactId) || null;
      return {
        contactId,
        contactPhone: matchedContact ? (this.formatterService.phoneNumber(matchedContact.phone) || '') : '',
        contactEmail: matchedContact?.email || ''
      };
    });
  }

  getSelectedContactIdsFromForm(): string[] {
    const primaryContactIdRaw = this.form?.get('contactId')?.value;
    const primaryContactId = primaryContactIdRaw == null ? '' : String(primaryContactIdRaw).trim();
    const additionalContactIds = this.additionalContactRows
      .map(row => String(row.contactId || '').trim())
      .filter(id => id.length > 0 && id !== this.newContactOptionValue);
    const contactIds = [primaryContactId, ...additionalContactIds].filter(id => id.length > 0 && id !== this.newContactOptionValue);
    return [...new Set(contactIds)];
  }

  getSelectedContactCount(): number {
    return this.getSelectedContactIdsFromForm().length;
  }

  get canAddAdditionalContactRow(): boolean {
    const primaryContactId = String(this.form?.get('contactId')?.value || '').trim();
    if (!primaryContactId || primaryContactId === this.newContactOptionValue) {
      return false;
    }
    if (this.additionalContactRows.length === 0) {
      return true;
    }
    const topContactId = String(this.additionalContactRows[0]?.contactId || '').trim();
    return !!topContactId;
  }

  validateNumberOfPeopleAgainstContacts(): boolean {
    const numberOfPeopleControl = this.form?.get('numberOfPeople');
    if (!numberOfPeopleControl) {
      return true;
    }
    const selectedContactCount = this.getSelectedContactCount();
    const numberOfPeople = Number(numberOfPeopleControl.value);
    const isValid = !Number.isNaN(numberOfPeople) && numberOfPeople >= selectedContactCount;
    const errors = { ...(numberOfPeopleControl.errors || {}) } as Record<string, boolean>;
    if (!isValid) {
      errors['minContacts'] = true;
      numberOfPeopleControl.setErrors(errors);
      return false;
    }
    if (errors['minContacts']) {
      delete errors['minContacts'];
      numberOfPeopleControl.setErrors(Object.keys(errors).length > 0 ? errors : null);
    }
    return true;
  }
  //#endregion

  onCompanyContactChange(contactId: string | number | null): void {
    const normalizedContactId = contactId === null || contactId === undefined ? '' : String(contactId);
    const companyContactControl = this.form.get('companyContact');
    companyContactControl?.setValue(normalizedContactId);
    companyContactControl?.markAsTouched();
    companyContactControl?.markAsDirty();
    if (!normalizedContactId) {
      return;
    }

    const selectedCompanyContact = this.companyContacts.find(c => c.contactId === normalizedContactId) || null;
    if (!selectedCompanyContact) {
      return;
    }

    const selectedCompanyName = (selectedCompanyContact.displayName
      ?? (this.utilityService.getCompanyDisplayToken(selectedCompanyContact.companyName ?? null) || selectedCompanyContact.companyName || '')).trim();
    this.form.patchValue({
      companyName: selectedCompanyName,
      phone: this.formatterService.phoneNumber(selectedCompanyContact.phone) || '',
      email: selectedCompanyContact.email || ''
    }, { emitEvent: false });
  }

  onReservationNumberDropdownChange(controlName: 'reservationTypeId' | 'reservationStatusId' | 'reservationNoticeId' | 'checkInTimeId' | 'checkOutTimeId', value: string | number | null): void {
    const control = this.form.get(controlName);
    control?.setValue(value == null || value === '' ? null : Number(value));
    control?.markAsTouched();
    control?.markAsDirty();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    const normalizedPropertyId = value == null ? '' : String(value).trim();
    const propertyControl = this.form.get('propertyId');
    propertyControl?.setValue(normalizedPropertyId);
    propertyControl?.markAsTouched();
    propertyControl?.markAsDirty();
  }

  get propertyOptions(): SearchableSelectOption[] {
    return this.availableProperties.map(property => ({ value: property.propertyId, label: property.propertyCode }));
  }

  onAgentDropdownChange(value: string | number | null): void {
    const normalizedAgentId = value == null ? null : String(value).trim();
    const agentControl = this.form.get('agentId');
    agentControl?.setValue(normalizedAgentId);
    agentControl?.markAsTouched();
    agentControl?.markAsDirty();
  }

  get agentOptions(): SearchableSelectOption[] {
    return [
      { value: this.noneAgentOptionValue, label: 'None' },
      ...this.agents.map(agent => ({ value: agent.agentId, label: agent.agentCode }))
    ];
  }

  onAssignedMaidDropdownChange(value: string | number | null): void {
    const normalized = value == null || value === '' ? this.noneAssignedMaidOptionValue : String(value).trim();
    const maidUserControl = this.form.get('maidUserId');
    maidUserControl?.setValue(normalized === '' ? this.noneAssignedMaidOptionValue : normalized);
    maidUserControl?.markAsTouched();
    maidUserControl?.markAsDirty();
  }

  get assignedMaidHousekeepingOptions(): SearchableSelectOption[] {
    return [
      { value: this.noneAssignedMaidOptionValue, label: 'None' },
      ...this.housekeepingUsers.map(u => ({
        value: u.userId,
        label: this.housekeepingById.get(u.userId) || u.email || u.userId
      }))
    ];
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
      this.form.get('agentId')?.setValue(null, { emitEvent: false });
      this.disableFieldWithValidation('agentId');
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
      this.enableFieldWithValidation('agentId', [this.agentSelectionRequiredValidator]);
      this.enableFieldWithValidation('billingTypeId', [Validators.required]);
      this.enableFieldWithValidation('billingMethodId', [Validators.required]);
      this.enableFieldWithValidation('prorateTypeId', [Validators.required]);
      this.enableFieldWithValidation('billingRate', [Validators.required]);
      this.enableFieldWithValidation('depositType', [Validators.required]);
      this.enableFieldWithValidation('deposit', [Validators.required]);
      this.enableFieldWithValidation('departureFee', [Validators.required]);
      this.enableFieldWithValidation('taxes');
      this.enableFieldWithValidation('pets', [Validators.required]);      
      this.enableFieldWithValidation('maidService', [Validators.required]);      
      this.updatePetFields(this.isAddMode);
      this.updateMaidServiceFields(this.isAddMode);
      
      // Set departureDateStartAt if arrival date is set and departure date is unset
      const arrivalDate = this.form.get('arrivalDate')?.value;
      const departureDate = this.form.get('departureDate')?.value;
      if (arrivalDate && !departureDate) {
        const a0 = this.parseDateOnly(arrivalDate);
        if (a0) {
          const start = new Date(a0.getTime());
          start.setDate(start.getDate() + 1);
          this.departureDateStartAt = start;
        }
      }
    }

    this.updateCompanyContactRequirement();
  }

  updateCompanyContactRequirement(): void {
    const companyContactControl = this.form.get('companyContact');
    if (!companyContactControl) {
      return;
    }

    if (this.showCompanyRow) {
      companyContactControl.setValidators([Validators.required]);
    } else {
      companyContactControl.clearValidators();
    }
    companyContactControl.updateValueAndValidity({ emitEvent: false });
  }

  applyDefaultProrateTypeByReservationType(reservationTypeId: number | null): void {
    const prorateTypeControl = this.form.get('prorateTypeId');
    if (!prorateTypeControl) {
      return;
    }

    if (reservationTypeId === ReservationType.Individual) {
      prorateTypeControl.setValue(ProrateType.SecondMonth, { emitEvent: false });
    } else if (reservationTypeId === ReservationType.Corporate || reservationTypeId === ReservationType.Platform) {
      prorateTypeControl.setValue(ProrateType.FirstMonth, { emitEvent: false });
    } else if (reservationTypeId === ReservationType.Owner) {
      prorateTypeControl.setValue(null, { emitEvent: false });
    }
  }

  applyDefaultDepositTypeByReservationType(reservationTypeId: number | null): void {
    const depositTypeControl = this.form.get('depositType');
    if (!depositTypeControl) {
      return;
    }

    if (reservationTypeId === ReservationType.Corporate || reservationTypeId === ReservationType.Platform) {
      depositTypeControl.setValue(DepositType.CLR, { emitEvent: false });
    } else {
      depositTypeControl.setValue(DepositType.Deposit, { emitEvent: false });
    }
    this.updateDepositValues();
  }

  updateContactFields(): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    if (reservationTypeId === ReservationType.Owner) {
      const currentContactId = this.form?.get('contactId')?.value as string | null;
      const selectedOwnerContact = currentContactId
        ? this.contacts.find(c => c.contactId === currentContactId) || null
        : null;
      if (selectedOwnerContact) {
        this.selectedContact = selectedOwnerContact;
      } else {
        this.selectedContact = this.contacts.find(c => c.contactId === this.selectedProperty?.owner1Id) || null;
        this.form.patchValue({ contactId: this.selectedContact?.contactId || '' }, { emitEvent: false });
      }
    }

    if (!this.selectedContact) {
      this.form.patchValue({
        contactPhone: '',
        contactEmail: '',
        companyContact: '',
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
    const contactFieldPatch: Record<string, unknown> = {
      contactPhone: this.formatterService.phoneNumber(this.selectedContact.phone) || '',
      contactEmail: this.selectedContact.email || '',
    };

    // In Platform mode, company row is independent and should not auto-select from Contact Name.
    if (!this.showCompanyRow) {
      contactFieldPatch['companyContact'] = this.selectedContact.contactId || '';
      contactFieldPatch['companyName'] = selectedCompanyName;
      contactFieldPatch['phone'] = this.formatterService.phoneNumber(this.selectedContact.phone) || '';
      contactFieldPatch['email'] = this.selectedContact.email || '';
    }

    this.form.patchValue(contactFieldPatch, { emitEvent: false });

    if (reservationTypeId === ReservationType.Owner) {
      this.syncTenantNamesFromSelectedContacts(selectedContactFullName);
      return;
    }

    if (reservationTypeId === ReservationType.Individual || reservationTypeId === ReservationType.Platform) {
      this.syncTenantNamesFromSelectedContacts(selectedContactFullName);
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

  getContactTenantDisplayName(contact: ContactResponse | null): string {
    if (!contact) {
      return '';
    }
    if (contact.entityTypeId === EntityType.Company) {
      return String(contact.displayName || contact.companyName || '').trim();
    }
    return String(contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`).trim();
  }

  syncTenantNamesFromSelectedContacts(fallbackName: string = ''): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    if (reservationTypeId !== ReservationType.Owner && reservationTypeId !== ReservationType.Individual && reservationTypeId !== ReservationType.Platform) {
      return;
    }

    const tenantNameControl = this.form?.get('tenantName');
    const currentTenantName = String(tenantNameControl?.value ?? '').trim();
    const shouldAutoSyncTenantName = this.isAddMode || currentTenantName.length === 0;
    if (!shouldAutoSyncTenantName) {
      return;
    }

    const selectedContactIds = this.getSelectedContactIdsFromForm();
    const tenantNames = selectedContactIds
      .map(contactId => this.contacts.find(c => c.contactId === contactId) || null)
      .map(contact => this.getContactTenantDisplayName(contact))
      .filter(name => !!name);

    const tenantNameValue = tenantNames.length > 0 ? tenantNames.join(', ') : fallbackName;
    this.form.patchValue({ tenantName: tenantNameValue }, { emitEvent: false });
  }

  applyPlatformCompanyDetails(companyId: string | null, companyName: string | null): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    if (reservationTypeId !== ReservationType.Platform) {
      return;
    }

    const normalizedCompanyId = companyId == null || String(companyId).trim() === '' ? null : String(companyId).trim();
    const normalizedCompanyName = companyName == null || String(companyName).trim() === '' ? null : String(companyName).trim();

    const matchedCompanyContact = normalizedCompanyId
      ? this.companyContacts.find(c => c.contactId === normalizedCompanyId) || null
      : this.companyContacts.find(c => {
          const displayName = (c.displayName ?? '').trim();
          const rawCompanyName = (c.companyName ?? '').trim();
          return !!normalizedCompanyName && (displayName === normalizedCompanyName || rawCompanyName === normalizedCompanyName);
        }) || null;

    if (!matchedCompanyContact) {
      this.form.patchValue({
        companyContact: normalizedCompanyId ?? '',
        companyName: normalizedCompanyName ?? '',
        phone: '',
        email: ''
      }, { emitEvent: false });
      return;
    }

    const selectedCompanyName = (matchedCompanyContact.displayName
      ?? (this.utilityService.getCompanyDisplayToken(matchedCompanyContact.companyName ?? null) || matchedCompanyContact.companyName || '')).trim();

    this.form.patchValue({
      companyContact: matchedCompanyContact.contactId || '',
      companyName: selectedCompanyName,
      phone: this.formatterService.phoneNumber(matchedCompanyContact.phone) || '',
      email: matchedCompanyContact.email || ''
    }, { emitEvent: false });
  }

  get showPoNumberField(): boolean {
    if (!this.selectedContact) {
      return false;
    }
    return this.selectedContact.entityTypeId === EntityType.Company;
  }

  get showCompanyRow(): boolean {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    return reservationTypeId === ReservationType.Platform;
  }

  isIndividualPlatformReservationTypeChange(
    previousReservationTypeId: number | null,
    currentReservationTypeId: number | null
  ): boolean {
    const isPreviousIndividualOrPlatform =
      previousReservationTypeId === ReservationType.Individual || previousReservationTypeId === ReservationType.Platform;
    const isCurrentIndividualOrPlatform =
      currentReservationTypeId === ReservationType.Individual || currentReservationTypeId === ReservationType.Platform;
    return isPreviousIndividualOrPlatform && isCurrentIndividualOrPlatform;
  }

  get isOwnerReservationType(): boolean {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    return reservationTypeId === ReservationType.Owner;
  }

  openNewContactDialog(targetAdditionalContactRowIndex?: number): void {
    const reservationTypeId = this.form?.get('reservationTypeId')?.value as number | null;
    let entityTypeId: number | null = null;

    if (reservationTypeId === ReservationType.Individual || reservationTypeId === ReservationType.Platform) {
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
    dialogRef.componentInstance.presetEntityTypeId = entityTypeId;
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
          this.companyContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);

          if (targetAdditionalContactRowIndex !== undefined) {
            const newContact = this.contacts.find(c => c.contactId === result.contactId) || null;
            if (targetAdditionalContactRowIndex >= 0 && targetAdditionalContactRowIndex < this.additionalContactRows.length) {
              this.additionalContactRows[targetAdditionalContactRowIndex] = {
                contactId: result.contactId,
                contactPhone: newContact ? (this.formatterService.phoneNumber(newContact.phone) || '') : '',
                contactEmail: newContact?.email || ''
              };
            }
            this.updateContactsByReservationType();
            this.syncTenantNamesFromSelectedContacts();
            this.validateNumberOfPeopleAgainstContacts();
            return;
          }

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
            this.applyDefaultDepositTypeByReservationType(targetReservationTypeId);
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

    const billingTypeId = this.form.get('billingTypeId')?.value;
    const billingControl = this.form.get('billingRate')!;
    const billingRate = billingTypeId === BillingType.Monthly
      ? this.selectedProperty.monthlyRate.toFixed(2)
      : this.selectedProperty.dailyRate.toFixed(2);
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

  updatePetFields(applyEnabledDefaults: boolean = true): void {
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

      if (applyEnabledDefaults) {
        const petFee = this.selectedProperty.petFee != null
          ? this.selectedProperty.petFee.toFixed(2)
          : '0.00';
        petFeeControl.setValue(petFee, { emitEvent: false });
        numberOfPetsControl.setValue(1, { emitEvent: false });
      }
      this.enableFieldWithValidation('petFee', [Validators.required]);
      this.enableFieldWithValidation('numberOfPets', [Validators.required]);
      
      this.enableFieldWithValidation('petDescription', [Validators.required]);
    }
  }
  
  updateMaidServiceFields(applyEnabledDefaults: boolean = true): void {
    const hasMaidService = this.form.get('maidService')?.value ?? false;
    const maidServiceFeeControl = this.form.get('maidServiceFee');
    const frequencyControl = this.form.get('frequencyId');
    
    if (hasMaidService === false) {
      maidServiceFeeControl.setValue('0.00', { emitEvent: false });
      this.disableFieldWithValidation('maidServiceFee');
      
      frequencyControl.setValue(Frequency.NA, { emitEvent: false });
      this.disableFieldWithValidation('frequencyId');

      this.disableFieldWithValidation('maidStartDate');
      this.disableFieldWithValidation('maidUserId');

    } 
    else {
      // Only need selectedProperty when enabling fields
      if (!this.selectedProperty) {
        return;
      }
      
      if (applyEnabledDefaults) {
        maidServiceFeeControl.setValue(this.selectedProperty.maidServiceFee.toFixed(2), { emitEvent: false });
      }
      this.enableFieldWithValidation('maidServiceFee', [Validators.required]);

      // Only set frequency default on explicit defaulting flows.
      if (applyEnabledDefaults) {
        const currentFrequency = frequencyControl.value;
        if (currentFrequency === null || currentFrequency === undefined || currentFrequency === Frequency.NA) {
          frequencyControl.setValue(Frequency.OneTime, { emitEvent: false });
        }
      }
      this.enableFieldWithValidation('frequencyId', [Validators.required]);

      this.enableFieldWithValidation('maidStartDate', [Validators.required]);
      this.enableFieldWithValidation('maidUserId');
    }
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
  }

  filterPropertiesByOffice(): void {
    const officeFiltered = !this.selectedOffice
      ? this.properties
      : this.properties.filter(p => p.officeId === this.selectedOffice.officeId);

    if (!this.canEditProperty || !this.reservation) {
      this.availableProperties = officeFiltered;
      this.applySelectedPropertyClearIfOfficeMismatch();
      return;
    }

    const arrivalRaw = this.form.get('arrivalDate')?.value ?? this.reservation?.arrivalDate;
    const departureRaw = this.form.get('departureDate')?.value ?? this.reservation?.departureDate;
    if (!arrivalRaw || !departureRaw) {
      this.availableProperties = officeFiltered;
      this.applySelectedPropertyClearIfOfficeMismatch();
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
    });
  }

  normalizeDateForConflict(value: string | Date | null | undefined): Date {
    return this.parseDateOnly(value) ?? new Date(NaN);
  }

  applySelectedPropertyClearIfOfficeMismatch(): void {
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
    setTimeout(() => this.focusLastExtraFeeDescriptionInput(), 0);
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

  focusLastExtraFeeDescriptionInput(): void {
    const lastInput = this.extraFeeDescriptionInputs?.last?.nativeElement;
    if (!lastInput) {
      return;
    }
    lastInput.focus();
    lastInput.select();
  }
  //#endregion

  //#region Reservation Change Notification
  getReservationNotificationContext(formValue: any): ReservationNotificationContext {
    if (this.isAddMode) {
      return {
        shouldNotify: true,
        isNewReservation: true,
        isCancellation: false,
        arrivalDateChanged: false,
        departureDateChanged: false
      };
    }

    if (!this.reservation) {
      return {
        shouldNotify: false,
        isNewReservation: false,
        isCancellation: false,
        arrivalDateChanged: false,
        departureDateChanged: false
      };
    }

    const arrivalDateChanged = !this.isSameDateOnly(this.reservation.arrivalDate, formValue.arrivalDate);
    const departureDateChanged = !this.isSameDateOnly(this.reservation.departureDate, formValue.departureDate);
    const shouldNotify = arrivalDateChanged || departureDateChanged;

    return {
      shouldNotify,
      isNewReservation: false,
      isCancellation: false,
      arrivalDateChanged,
      departureDateChanged
    };
  }

  sendReservationChangeNotification(response: ReservationResponse | null | undefined, context: ReservationNotificationContext): void {
    if (!response || !context.shouldNotify) {
      return;
    }
    if (context.isCancellation && !this.isReservationMarkedDeleted(response)) {
      return;
    }

    const officeId = Number(response.officeId || this.selectedOffice?.officeId || 0);
    const emailList = this.getReservationNotificationEmailList(officeId);
    const toRecipients = this.parseSemicolonEmailRecipients(emailList);
    if (!officeId || !toRecipients.length) {
      return;
    }

    const user = this.authService.getUser();
    const fromEmail = String(user?.email || '').trim();
    if (!fromEmail) {
      return;
    }

    const fromName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'RentAll User';
    const reservationLabel = this.getReservationNotificationLabel(response);
    const propertyCode = this.getReservationNotificationPropertyCode(response);
    const arrivalDate = this.getReservationNotificationDateText(response.arrivalDate);
    const departureDate = this.getReservationNotificationDateText(response.departureDate);
    const reservationStatus = getReservationStatus(response.reservationStatusId);
    const reservationUrl = this.getReservationNotificationUrl(response.reservationId);
    const reason = this.getReservationNotificationReason(context);
    const subject = `Reservation Update: ${reservationLabel}`;
    const includeLink = !context.isCancellation;
    const plainTextContent = includeLink
      ? `${reason}\n\nPropertyCode: ${propertyCode}\nReservation: ${reservationLabel}\nArrival Date: ${arrivalDate}\nDeparture Date: ${departureDate}\nReservation Status: ${reservationStatus}\nLink: ${reservationUrl}`
      : `${reason}\n\nPropertyCode: ${propertyCode}\nReservation: ${reservationLabel}\nArrival Date: ${arrivalDate}\nDeparture Date: ${departureDate}\nReservation Status: ${reservationStatus}`;
    const htmlContent = includeLink
      ? `<p>${reason}</p><p><strong>PropertyCode:</strong> ${propertyCode}<br><strong>Reservation:</strong> ${reservationLabel}<br><strong>Arrival Date:</strong> ${arrivalDate}<br><strong>Departure Date:</strong> ${departureDate}<br><strong>Reservation Status:</strong> ${reservationStatus}</p><p><a href="${reservationUrl}">${reservationUrl}</a></p>`
      : `<p>${reason}</p><p><strong>PropertyCode:</strong> ${propertyCode}<br><strong>Reservation:</strong> ${reservationLabel}<br><strong>Arrival Date:</strong> ${arrivalDate}<br><strong>Departure Date:</strong> ${departureDate}<br><strong>Reservation Status:</strong> ${reservationStatus}</p>`;

    const request: EmailRequest = {
      organizationId: response.organizationId || user?.organizationId || '',
      officeId,
      propertyId: response.propertyId || null,
      reservationId: response.reservationId || null,
      fromRecipient: {
        email: fromEmail,
        name: fromName
      },
      toRecipients,
      ccRecipients: [],
      bccRecipients: [],
      subject,
      plainTextContent,
      htmlContent,
      emailTypeId: EmailType.Other
    };

    this.emailService.sendEmail(request).pipe(take(1)).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  getReservationNotificationEmailList(officeId: number): string {
    if (!officeId) {
      return '';
    }
    const office = this.offices.find(item => item.officeId === officeId)
      || (this.selectedOffice?.officeId === officeId ? this.selectedOffice : null);
    return String(office?.emailListForReservations || '').trim();
  }

  parseSemicolonEmailRecipients(value: string): { email: string; name: string }[] {
    return (value || '')
      .split(';')
      .map(email => email.trim())
      .filter(email => email.length > 0)
      .map(email => ({ email, name: '' }));
  }

  getReservationNotificationLabel(reservation: ReservationResponse): string {
    const contactId = this.getPrimaryReservationContactId(reservation);
    const contact = this.contacts.find(item => item.contactId === contactId) || this.selectedContact || null;
    return this.utilityService.getReservationDropdownLabel(reservation, contact)
      || reservation.reservationCode
      || reservation.reservationId;
  }

  getReservationNotificationReason(context: ReservationNotificationContext): string {
    if (context.isNewReservation) {
      return 'A new reservation was created.';
    }
    if (context.isCancellation) {
      return 'A reservation was cancelled.';
    }
    if (context.arrivalDateChanged && context.departureDateChanged) {
      return 'Reservation arrival and departure dates were updated.';
    }
    if (context.arrivalDateChanged) {
      return 'Reservation arrival date was updated.';
    }
    if (context.departureDateChanged) {
      return 'Reservation departure date was updated.';
    }
    return 'Reservation was updated.';
  }

  getReservationNotificationPropertyCode(reservation: ReservationResponse): string {
    const propertyId = String(reservation.propertyId || '').trim();
    return this.selectedProperty?.propertyCode
      || this.properties.find(property => property.propertyId === propertyId)?.propertyCode
      || '';
  }

  getReservationNotificationDateText(value: string | Date | null | undefined): string {
    const parsed = this.parseDateOnly(value);
    return parsed ? this.formatDateForMessage(parsed) : '';
  }

  getReservationNotificationUrl(reservationId: string): string {
    const relativePath = `/${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}`;
    if (typeof window === 'undefined' || !window.location?.origin) {
      return relativePath;
    }
    return `${window.location.origin}${relativePath}`;
  }

  isSameDateOnly(left: string | Date | null | undefined, right: string | Date | null | undefined): boolean {
    const leftDate = this.parseDateOnly(left);
    const rightDate = this.parseDateOnly(right);
    if (!leftDate && !rightDate) {
      return true;
    }
    if (!leftDate || !rightDate) {
      return false;
    }
    return leftDate.getTime() === rightDate.getTime();
  }

  isReservationMarkedDeleted(reservation: ReservationResponse | null | undefined): boolean {
    return (reservation as any)?.isDeleted === true;
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

    const arrival = this.parseDateOnly(arrivalDate);
    const departure = this.parseDateOnly(departureDate);
    if (!arrival || !departure) {
      if (offendingField === 'save') {
        this.performSave();
      }
      return;
    }

    if (departure.getTime() <= arrival.getTime()) {
      this.toastr.error('Departure date must be after the arrival date.', CommonMessage.Error);
      return;
    }

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
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: (reservations) => {
      // Filter out the current reservation if editing
      const otherReservations = reservations.filter(r => 
        !this.reservation || r.reservationId !== this.reservation.reservationId
      );

      // Check for overlaps
      const conflictingReservation = otherReservations.find(r => {
        if (!r.arrivalDate || !r.departureDate) {
          return false;
        }

        const rArrival = this.parseDateOnly(r.arrivalDate);
        const rDeparture = this.parseDateOnly(r.departureDate);
        if (!rArrival || !rDeparture) {
          return false;
        }

        // Strict overlap: both `arrival < rDeparture` and `departure > rArrival`. Boundary equality = no conflict
        // (same calendar day for one's departure and the other's arrival is allowed).
        return arrival < rDeparture && departure > rArrival;
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
      },
      error: () => {
        if (offendingField === 'save') {
          this.toastr.error('Unable to validate reservation dates. Please try again.', CommonMessage.Error);
        }
      }
    });
  }

  parseDateOnly(value: string | Date | null | undefined): Date | null {
    if (value == null || value === '') {
      return null;
    }
    if (value instanceof Date) {
      const d = new Date(value.getTime());
      if (isNaN(d.getTime())) {
        return null;
      }
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const d = this.utilityService.parseDateOnlyStringToDate(String(value));
    if (!d) {
      return null;
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }

  formatDateForMessage(date: Date): string {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  handleAvailabilityDateError(
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
    if (fieldName === 'numberOfPeople') {
      this.validateNumberOfPeopleAgainstContacts();
    }
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

  //#region Save State Methods
  captureSavedStateSignature(): void {
    this.savedFormState = this.cloneFormState(this.form?.getRawValue() ?? {});
    this.savedExtraFeeLinesState = this.cloneExtraFeeLines(this.extraFeeLines || []);
    this.form?.markAsPristine();
    this.form?.markAsUntouched();
  }

  hasUnsavedChanges(): boolean {
    if (!this.form || this.isSubmitting) {
      return false;
    }
    return this.form.dirty;
  }

  discardUnsavedChanges(): void {
    if (!this.form || !this.savedFormState) {
      return;
    }

    this.form.reset(this.cloneFormState(this.savedFormState), { emitEvent: false });
    this.extraFeeLines = this.cloneExtraFeeLines(this.savedExtraFeeLinesState || []);

    const propertyId = this.form.get('propertyId')?.value as string | null;
    this.selectedProperty = propertyId ? this.properties.find(p => p.propertyId === propertyId) || null : null;
    const contactId = this.form.get('contactId')?.value as string | null;
    this.selectedContact = contactId ? this.contacts.find(c => c.contactId === contactId) || null : null;

    this.updateReservationStatusesByReservationType();
    this.updateContactsByReservationType();
    this.updateEnabledFieldsByReservationType();
    this.updateContactFields();
    this.updateDepositValues();
    this.updateBillingValues();
    this.updateDepartureFeeValue();
    this.updatePetFields(false);
    this.updateMaidServiceFields(false);
    this.updateMaidStartDate();

    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  cloneFormState<T>(value: T): T {
    if (value instanceof Date) {
      return new Date(value.getTime()) as T;
    }
    if (Array.isArray(value)) {
      return value.map(item => this.cloneFormState(item)) as T;
    }
    if (value && typeof value === 'object') {
      const clonedObject: Record<string, unknown> = {};
      Object.keys(value as Record<string, unknown>).forEach(key => {
        clonedObject[key] = this.cloneFormState((value as Record<string, unknown>)[key]);
      });
      return clonedObject as T;
    }
    return value;
  }

  cloneExtraFeeLines(lines: ExtraFeeLineDisplay[]): ExtraFeeLineDisplay[] {
    return lines.map(line => ({
      extraFeeLineId: line.extraFeeLineId,
      feeDescription: line.feeDescription,
      feeAmount: line.feeAmount,
      feeFrequencyId: line.feeFrequencyId,
      costCodeId: line.costCodeId,
      isNew: line.isNew
    }));
  }

  async confirmNavigationWithUnsavedChanges(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) {
      return true;
    }
    const action = await this.unsavedChangesDialogService.confirmLeaveOrSave();
    if (action === 'save') {
      // Clear dirty state immediately so navigation can proceed without repeated prompts.
      this.captureSavedStateSignature();
      this.saveReservation();
      return true;
    }

    if (action === 'discard') {
      this.discardUnsavedChanges();
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
  
  //#endregion

  //#region Utility Methods
  navigateToReservationEntryOrigin(): void {
    const qp = this.route.snapshot.queryParamMap;
    const returnTo = qp.get('returnTo');
    if (returnTo === 'reservation-board') {
      this.router.navigateByUrl(RouterUrl.ReservationBoard);
      return;
    }
    if (returnTo === 'invoice-list') {
      const params: string[] = [];
      const officeId = qp.get('officeId');
      const reservationId = qp.get('reservationId');
      const companyId = qp.get('companyId');
      const organizationId = qp.get('organizationId');

      if (officeId) {
        params.push(`officeId=${officeId}`);
      }
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }
      if (companyId) {
        params.push(`companyId=${companyId}`);
      }
      if (organizationId) {
        params.push(`organizationId=${organizationId}`);
      }

      const accountingUrl = params.length > 0 ? `${RouterUrl.AccountingList}?${params.join('&')}` : RouterUrl.AccountingList;
      this.router.navigateByUrl(accountingUrl);
      return;
    }
    if (returnTo === 'reservation-list') {
      const path = qp.get('listReturnPath')?.trim();
      if (path && this.isAllowedReservationListReturnPath(path)) {
        this.router.navigateByUrl(path.startsWith('/') ? path : `/${path}`);
        return;
      }
      this.router.navigateByUrl(RouterUrl.ReservationList);
      return;
    }
    this.router.navigateByUrl(RouterUrl.ReservationList);
  }

  isAllowedReservationListReturnPath(path: string): boolean {
    const normalized = path.split('?')[0].replace(/^\/+/, '');
    return normalized === RouterUrl.RentalList || normalized === RouterUrl.ReservationList;
  }

  back(): void {
    this.confirmNavigationWithUnsavedChanges().then(canLeave => {
      if (!canLeave) {
        return;
      }
      this.navigateToReservationEntryOrigin();
    });
  }

  openAddAlertDialog(): void {
    const dialogData: AddAlertDialogData = {
      officeId: this.sharedOfficeId,
      propertyId: this.sharedPropertyId,
      reservationId: this.selectedHeaderReservationId ?? (this.isAddMode ? null : this.reservationId),
      source: 'reservation'
    };
    this.dialog.open(AddAlertDialogComponent, {
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'add-alert-dialog-panel',
      data: dialogData
    });
  }

  canDeactivate(): Promise<boolean> | boolean {
    return this.confirmNavigationWithUnsavedChanges();
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
