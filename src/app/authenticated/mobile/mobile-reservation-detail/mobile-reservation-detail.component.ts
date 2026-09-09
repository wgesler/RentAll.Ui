import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, finalize, map, of, switchMap, take, takeUntil } from 'rxjs';
import { InvoiceMethod, normalizeInvoiceMethodId } from '../../accounting/models/accounting-enum';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { MixedMappingService } from '../../../services/mixed-mapping.service';
import { UtilityService } from '../../../services/utility.service';
import type { CalendarDateString } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AgentService } from '../../organizations/services/agent.service';
import { OfficeService } from '../../organizations/services/office.service';
import { CheckinTimes, CheckoutTimes } from '../../properties/models/property-enums';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { BillingMethod, BillingType, DepositType, Frequency, ProrateType, ReservationNotice, ReservationStatus, ReservationType } from '../../reservations/models/reservation-enum';
import { ReservationRequest, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { getMobileReservationBackUrl, resolveMobileReservationReturnTo } from '../mobile-nav';
import { MobileListField, MobileListFieldOption } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-reservation-detail',
  imports: [MaterialModule, FormsModule, NgTemplateOutlet],
  templateUrl: './mobile-reservation-detail.component.html',
  styleUrl: './mobile-reservation-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileReservationDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() reservationId = '';
  @Output() dirtyChange = new EventEmitter<boolean>();
  @ViewChild('notesTextarea') notesTextarea?: ElementRef<HTMLTextAreaElement>;
  private reservationService = inject(ReservationService);
  private mixedMappingService = inject(MixedMappingService);
  private mappingService = inject(MappingService);
  private agentService = inject(AgentService);
  private contactService = inject(ContactService);
  private propertyService = inject(PropertyService);
  private officeService = inject(OfficeService);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);
  reservation: ReservationResponse | null = null;
  fields: MobileListField[] = [];
  agentOptions: MobileListFieldOption[] = [];
  contactOptions: MobileListFieldOption[] = [];
  contacts: ContactResponse[] = [];
  propertyCode = '';
  propertyAddress = '';
  isPageReady = false;
  isSaving = false;
  isDirty = false;
  destroy$ = new Subject<void>();
  readonly reservationPanelFieldKeys = [
    'reservationCode',
    'officeName',
    'propertyCode',
    'propertyAddress',
    'reservationTypeId',
    'reservationStatusId',
    'reservationNoticeId',
    'agentId',
    'contactId',
    'contactPhone',
    'contactEmail',
    'companyName',
    'numberOfPeople',
    'tenantName',
    'referenceNo',
    'arrivalDate',
    'departureDate',
    'billingStartDate',
    'billingEndDate',
    'checkInTimeId',
    'checkOutTimeId',
    'lockBoxCode',
    'unitTenantCode',
    'garageCode'
  ] as const;
  readonly billingPanelFieldKeys = [
    'billingTypeId',
    'billingRate',
    'depositTypeId',
    'deposit',
    'billingMethodId',
    'prorateTypeId',
    'departureFee',
    'taxes',
    'hasPets',
    'petFee',
    'numberOfPets',
    'petDescription',
    'maidService',
    'maidServiceFee',
    'frequencyId',
    'invoiceMethodId'
  ] as const;

  //#region Mobile-Reservation-Detail
  get isAddMode(): boolean {
    return this.reservationId.trim() === 'new';
  }

  ngOnInit(): void {
    this.loadAgents();
    this.loadContacts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationId']) {
      this.getReservation();
    }
  }

  getReservation(): void {
    this.loadReservation();
  }

  updateReservation(): void {
    const reservationId = this.reservationId.trim();
    if (!reservationId || this.isSaving || !this.reservation) {
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    this.reservationService.getReservationByGuid(reservationId).pipe(
      take(1),
      takeUntil(this.destroy$),
      switchMap(reservation => {
        const overrides = this.mappingService.mapMobileReservationDetailOverrides(reservation, this.fields);
        const request = this.mixedMappingService.mapReservationResponseToRequest(reservation, overrides);
        return this.reservationService.updateReservation(request);
      }),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: saved => {
        this.reservation = saved;
        this.fields = this.mapFields(saved);
        this.setDirty(false);
        this.queueNotesTextareaHeightSync();
        this.toastr.success('Reservation updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        this.markViewForCheck();
      },
      error: () => {
        this.toastr.error('Reservation could not be saved.', CommonMessage.Error);
        this.markViewForCheck();
      }
    });
  }

  createReservation(): void {
    if (this.isSaving || !this.reservation) {
      return;
    }
    const propertyId = String(this.reservation.propertyId || '').trim();
    const officeId = Number(this.reservation.officeId || 0);
    if (!propertyId || !officeId) {
      this.toastr.error('Office and property are required to create a reservation.', CommonMessage.Error);
      return;
    }
    this.isSaving = true;
    this.markViewForCheck();
    const overrides = this.mappingService.mapMobileReservationDetailOverrides(this.reservation, this.fields);
    const request = this.buildCreateReservationRequest(this.reservation, overrides);
    this.reservationService.createReservation(request).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isSaving = false;
        this.markViewForCheck();
      })
    ).subscribe({
      next: saved => {
        if (saved?.reservationId) {
          this.reservationService.notifyReservationSaved(saved.reservationId);
        }
        this.toastr.success('Reservation created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
        void this.router.navigateByUrl(getMobileReservationBackUrl(resolveMobileReservationReturnTo(this.router.url)));
      },
      error: () => {
        this.toastr.error('Reservation could not be saved.', CommonMessage.Error);
      }
    });
  }

  saveReservation(): void {
    if (this.isAddMode) {
      this.createReservation();
      return;
    }
    this.updateReservation();
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

  getNotesField(): MobileListField | null {
    return this.fields.find(field => field.key === 'notes') ?? null;
  }

  getReservationPanelFields(): MobileListField[] {
    return this.getPanelFields(this.reservationPanelFieldKeys);
  }

  getBillingPanelFields(): MobileListField[] {
    return this.getPanelFields(this.billingPanelFieldKeys);
  }

  onNotesInput(event: Event): void {
    this.onFieldChange();
    this.syncNotesTextareaHeight(event.target as HTMLTextAreaElement);
  }

  onNotesResize(event: Event): void {
    this.syncNotesTextareaHeight(event.target as HTMLTextAreaElement);
  }

  syncNotesTextareaHeight(textarea?: HTMLTextAreaElement | null): void {
    const element = textarea ?? this.notesTextarea?.nativeElement;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    const minHeight = Number.parseFloat(getComputedStyle(element).minHeight) || 0;
    element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
  }

  queueNotesTextareaHeightSync(): void {
    queueMicrotask(() => this.syncNotesTextareaHeight());
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadReservation(): void {
    const reservationId = this.reservationId.trim();
    this.isPageReady = false;
    this.reservation = null;
    this.fields = [];
    this.propertyCode = '';
    this.propertyAddress = '';
    this.setDirty(false);
    this.markViewForCheck();
    if (!reservationId) {
      this.isPageReady = true;
      this.markViewForCheck();
      return;
    }
    if (this.isAddMode) {
      this.loadAddModeReservation();
      return;
    }
    this.reservationService.getReservationByGuid(reservationId).pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => {
        this.isPageReady = true;
        this.queueNotesTextareaHeightSync();
        this.markViewForCheck();
      })
    ).subscribe({
      next: reservation => {
        this.reservation = reservation;
        this.loadProperty(reservation.propertyId);
        this.applyFields();
      },
      error: () => {
        this.reservation = null;
        this.fields = [];
        this.markViewForCheck();
      }
    });
  }

  loadAddModeReservation(): void {
    this.route.queryParams.pipe(take(1), takeUntil(this.destroy$)).subscribe(queryParams => {
      const propertyId = String(queryParams['propertyId'] || '').trim();
      const officeId = Number.parseInt(String(queryParams['officeId'] ?? ''), 10);
      const startDateParam = (queryParams['startDate'] || queryParams['arrivalDate']) as string | undefined;
      const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
      const arrivalDate = this.parseDateFromQuery(startDateParam) ?? this.utilityService.todayAsCalendarDateString();
      const departureDate = this.addDaysToDateString(arrivalDate, 1);
      this.reservation = this.buildAddModeReservationSkeleton({
        organizationId,
        officeId: Number.isFinite(officeId) ? officeId : 0,
        propertyId,
        arrivalDate,
        departureDate
      });
      if (!propertyId) {
        this.finishAddModeReservation(null, null);
        return;
      }
      this.propertyService.getPropertyByGuid(propertyId).pipe(
        take(1),
        switchMap(property => {
          const resolvedOfficeId = Number.isFinite(officeId) && officeId > 0 ? officeId : (property.officeId ?? 0);
          const organizationIdForOffice = property.organizationId || organizationId;
          if (!organizationIdForOffice || !resolvedOfficeId) {
            return of({ property, office: null as OfficeResponse | null });
          }
          return this.officeService.ensureOfficesLoaded(organizationIdForOffice).pipe(
            switchMap(() => this.officeService.getAllOffices().pipe(take(1))),
            map(offices => ({
              property,
              office: (offices || []).find(office => office.officeId === resolvedOfficeId) ?? null
            }))
          );
        }),
        finalize(() => {
          this.isPageReady = true;
          this.queueNotesTextareaHeightSync();
          this.markViewForCheck();
        })
      ).subscribe({
        next: ({ property, office }) => this.finishAddModeReservation(property, office),
        error: () => this.finishAddModeReservation(null, null)
      });
    });
  }

  loadAgents(): void {
    this.agentService.ensureAgentsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.agentService.getAllAgents().pipe(takeUntil(this.destroy$)).subscribe(agents => {
          this.agentOptions = this.mappingService.mapMobileReservationAgentOptions(agents || []);
          this.applyFields();
        });
      },
      error: () => {
        this.agentOptions = [];
        this.applyFields();
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.contacts = contacts || [];
          this.contactOptions = this.mappingService.mapMobileReservationContactOptions(this.contacts);
          this.applyFields();
        });
      },
      error: () => {
        this.contacts = [];
        this.contactOptions = [];
        this.applyFields();
      }
    });
  }

  loadProperty(propertyId: string | null | undefined): void {
    const id = String(propertyId || '').trim();
    if (!id) {
      return;
    }
    this.propertyService.getPropertyByGuid(id).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: property => {
        this.propertyCode = property?.propertyCode || '';
        this.propertyAddress = [property?.address1, property?.address2].filter(part => !!String(part || '').trim()).join(', ');
        this.applyFields();
      },
      error: () => {
        this.propertyCode = '';
        this.propertyAddress = '';
        this.applyFields();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  finishAddModeReservation(property: PropertyResponse | null, office: OfficeResponse | null): void {
    if (!this.reservation) {
      return;
    }
    if (property) {
      this.applyPropertyDefaultsToReservation(this.reservation, property);
      this.propertyCode = property.propertyCode || '';
      this.propertyAddress = [property.address1, property.address2].filter(part => !!String(part || '').trim()).join(', ');
    }
    if (office) {
      this.reservation.officeId = office.officeId;
      this.reservation.officeName = office.name || '';
      this.reservation.deposit = office.defaultDeposit ?? this.reservation.deposit;
    }
    this.fields = this.mapFields(this.reservation);
    this.queueNotesTextareaHeightSync();
    this.markViewForCheck();
  }

  buildAddModeReservationSkeleton(args: {
    organizationId: string;
    officeId: number;
    propertyId: string;
    arrivalDate: CalendarDateString;
    departureDate: CalendarDateString;
  }): ReservationResponse {
    const maidStartDate = this.addDaysToDateString(args.arrivalDate, 7);
    return {
      reservationId: '',
      organizationId: args.organizationId,
      officeId: args.officeId,
      officeName: '',
      propertyId: args.propertyId,
      reservationCode: '',
      reservationTypeId: ReservationType.Individual,
      reservationStatusId: ReservationStatus.PreBooking,
      reservationNoticeId: ReservationNotice.ThirtyDays,
      contactIds: [],
      contactName: '',
      numberOfPeople: 1,
      tenantName: '',
      referenceNo: '',
      arrivalDate: args.arrivalDate,
      departureDate: args.departureDate,
      checkInTimeId: CheckinTimes.FourPM,
      checkOutTimeId: CheckoutTimes.ElevenAM,
      currentInvoiceNo: 0,
      billingMethodId: BillingMethod.Invoice,
      prorateTypeId: ProrateType.FirstMonth,
      billingTypeId: BillingType.Monthly,
      billingRate: 0,
      deposit: 0,
      depositTypeId: DepositType.Deposit,
      departureFee: 0,
      taxes: 0,
      hasPets: false,
      petFee: 0,
      numberOfPets: 0,
      maidService: false,
      maidServiceFee: 0,
      frequencyId: Frequency.NA,
      maidStartDate,
      allowExtensions: true,
      billedToEmployer: false,
      collapseCharges: false,
      invoiceMethodId: InvoiceMethod.Create,
      isActive: true,
      extraFeeLines: []
    };
  }

  applyPropertyDefaultsToReservation(reservation: ReservationResponse, property: PropertyResponse): void {
    reservation.propertyId = property.propertyId;
    if (Number(reservation.officeId || 0) <= 0) {
      reservation.officeId = property.officeId;
    }
    reservation.officeName = property.officeName || reservation.officeName;
    reservation.billingRate = property.monthlyRate ?? 0;
    reservation.departureFee = property.departureFee ?? 0;
    reservation.checkInTimeId = property.checkInTimeId ?? CheckinTimes.FourPM;
    reservation.checkOutTimeId = property.checkOutTimeId ?? CheckoutTimes.ElevenAM;
    reservation.petFee = property.petFee ?? 0;
    reservation.maidServiceFee = property.maidServiceFee ?? 0;
  }

  buildCreateReservationRequest(reservation: ReservationResponse, overrides: Partial<ReservationRequest>): ReservationRequest {
    const request = this.mixedMappingService.mapReservationResponseToRequest(reservation, {
      ...overrides,
      reservationId: undefined,
      reservationCode: null,
      propertyId: reservation.propertyId,
      officeId: reservation.officeId,
      currentInvoiceNo: 0,
      aCleanerUserId: null,
      aCleaningDate: null,
      aCarpetUserId: null,
      aCarpetDate: null,
      aInspectorUserId: null,
      aInspectingDate: null,
      dCleanerUserId: null,
      dCleaningDate: null,
      dCarpetUserId: null,
      dCarpetDate: null,
      dInspectorUserId: null,
      dInspectingDate: null,
      invoiceMethodId: normalizeInvoiceMethodId(overrides.invoiceMethodId ?? reservation.invoiceMethodId)
    });
    return request;
  }

  parseDateFromQuery(value?: string): CalendarDateString | null {
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
      return isNaN(localDate.getTime()) ? null : (this.utilityService.formatDateOnlyForApi(localDate) ?? null);
    }
    const parsed = this.utilityService.parseCalendarDateInput(value);
    return this.utilityService.formatDateOnlyForApi(parsed) ?? null;
  }

  addDaysToDateString(value: CalendarDateString, days: number): CalendarDateString {
    const parsed = this.utilityService.parseCalendarDateInput(value);
    if (!parsed) {
      return value;
    }
    const next = new Date(parsed);
    next.setDate(next.getDate() + days);
    next.setHours(0, 0, 0, 0);
    return this.utilityService.formatDateOnlyForApi(next) ?? value;
  }

  applyFields(): void {
    if (!this.reservation || this.isDirty) {
      return;
    }
    this.fields = this.mapFields(this.reservation);
    this.queueNotesTextareaHeightSync();
    this.markViewForCheck();
  }

  mapFields(reservation: ReservationResponse): MobileListField[] {
    const contactId = (reservation.contactIds || []).find(id => !!String(id || '').trim()) || '';
    const contact = this.contacts.find(item => item.contactId === contactId);
    return this.mappingService.mapMobileReservationDetailFields(reservation, {
      agents: this.agentOptions,
      contacts: this.contactOptions,
      officeName: reservation.officeName,
      propertyCode: this.propertyCode,
      propertyAddress: this.propertyAddress,
      contactPhone: contact?.phone || '',
      contactEmail: contact?.email || ''
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  //#endregion
}
