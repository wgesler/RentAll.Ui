import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, catchError, filter, finalize, forkJoin, map, of, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { RouterUrl } from '../../../app.routes';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentResponse, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { EmailService } from '../../email/services/email.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailType } from '../../email/models/email.enum';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { DocumentService } from '../../documents/services/document.service';
import { BuildingResponse } from '../../organizations/models/building.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { BuildingService } from '../../organizations/services/building.service';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { getCheckInTime, getCheckOutTime, PropertyType } from '../../properties/models/property-enums';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyService } from '../../properties/services/property.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { LeaseInformationResponse } from '../models/lease-information.model';
import { BillingType, DepositType, ReservationNotice, ReservationType } from '../models/reservation-enum';
import { ReservationListResponse, ReservationResponse } from '../models/reservation-model';
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseReloadService } from '../services/lease-reload.service';
import { ReservationService } from '../services/reservation.service';
import { environment } from '../../../../environments/environment';
import { DynamicFormDraftService } from '../../owners/services/dynamic-form-draft.service';

@Component({
    standalone: true,
    selector: 'app-lease',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './lease.component.html',
    styleUrl: './lease.component.scss'
})
export class LeaseComponent extends BaseDocumentComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('previewIframe') previewIframe?: ElementRef<HTMLIFrameElement>;
  @ViewChild('editIframe') editIframe?: ElementRef<HTMLIFrameElement>;
  @Input() reservationId: string = '';
  @Input() propertyId: string = '';
  @Input() officeId: number | null = null;
  @Input() lockOfficeSelection: boolean = false;
  @Input() shellMode: boolean = false;
  @Input() openInViewOnTabSelect: boolean = false;
  @Input() hideEditButtonInViewMode: boolean = false;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  isSubmitting: boolean = false;
  form: FormGroup;

  property: PropertyResponse | null = null;
  organization: OrganizationResponse | null = null;
  organizationId: string = '';

  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];
  selectedReservation: ReservationResponse | null = null;

  contacts: ContactResponse[] = [];
  contact: ContactResponse | null = null;
  companyContact: ContactResponse | null = null;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  selectedOffice: OfficeResponse | null = null;
  officesInitialized = false;
  accountingOffices: AccountingOfficeResponse[] = [];
  buildings: BuildingResponse[] = [];

  previewIframeHtml: string = '';
  previewIframeStyles: string = '';
  safeHtml: SafeHtml | null = null;
  editableHtml: SafeHtml | null = null;
  editorStyles: string = '';
  baseTemplateHtml: string = '';
  isEditMode: boolean = true;
  pendingOpenInViewMode: boolean = false;
  lastDocumentSelectionKey: string = '';
  iframeKey: number = 0;
  isDownloading: boolean = false;
  propertyHtml: PropertyHtmlResponse | null = null;
  emailHtml: EmailHtmlResponse | null = null;
  leaseInformation: LeaseInformationResponse | null = null;
  leaseInformationScopeOverride: { officeId: number | null; propertyId: string | null } | null = null;
  includeLease: boolean = true;
  includeLetterOfResponsibility: boolean = true;
  includeNoticeToVacate: boolean = true;
  includeCreditCardAuthorization: boolean = false;
  includeBusinessCreditApplication: boolean = false;
  includeRentalCreditApplication: boolean = false;
  isCompanyRental: boolean = true;
  debuggingHtml: boolean = environment.local || environment.dev;
  isPageReady: boolean = false;
  cachedPropertyHtmlFiles: {
    lease: string;
    letterOfResponsibility: string;
    noticeToVacate: string;
    creditAuthorization: string;
    creditApplication: string;
    rentalCreditApplication: string;
  } | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'organization', 'property', 'leaseInformation', 'reservation', 'reservations', 'contacts', 'emailHtml', 'accountingOffices', 'buildings', 'logo'])); 
  destroy$ = new Subject<void>();
  logoSourcesLoaded = { offices: false, organization: false };

  constructor(
    private reservationService: ReservationService,
    private propertyHtmlService: PropertyHtmlService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private commonService: CommonService,
    private router: Router,
    private emailCreateDraftService: EmailCreateDraftService,
    private emailHtmlService: EmailHtmlService,
    private leaseInformationService: LeaseInformationService,
    private officeService: OfficeService,
    private accountingOfficeService: AccountingOfficeService,
    private buildingService: BuildingService,
    private authService: AuthService,
    private fb: FormBuilder,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private sanitizer: DomSanitizer,
    private leaseReloadService: LeaseReloadService,
    private mappingService: MappingService,
    private globalSelectionService: GlobalSelectionService,
    private http: HttpClient,
    private dynamicFormDraftService: DynamicFormDraftService,
    public override toastr: ToastrService,
    documentExportService: DocumentExportService,
    documentService: DocumentService,
    documentHtmlService: DocumentHtmlService,
    emailService: EmailService,

  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.form = this.buildForm();
  }

  //#region Lease
  ngOnInit(): void {
    this.itemsToLoad$.pipe(filter(items => items.size === 0), take(1)).subscribe(() => {
      this.isPageReady = true;
      this.getLease();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.applyOfficeSelectionLockState();
    this.loadOrganization();
    this.loadContacts();
    this.loadEmailHtml();
    this.loadOffices();
    this.loadAccountingOffices();
    this.loadBuildings();
    this.loadReservations();
    if (!this.shellMode) {
      this.loadReservation();
      this.loadProperty();
      this.loadLeaseInformation();
    } else if (this.officeId != null && this.propertyId) {
      this.applyShellScopeFromInputs();
    } else {
      this.clearShellScopeLoadItems();
    }
    
    this.leaseReloadService.reloadLease.pipe(takeUntil(this.destroy$)).subscribe((scope) => {
      this.leaseInformationScopeOverride = scope;
      this.reloadLease();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['lockOfficeSelection']) {
      this.applyOfficeSelectionLockState();
    }

    if (this.shellMode && (changes['officeId'] || changes['propertyId'] || changes['reservationId'])) {
      this.applyShellScopeFromInputs();
      return;
    }

    // When propertyId becomes available/changes, reload all property-scoped document data.
    if (changes['propertyId'] && changes['propertyId'].currentValue) {
      this.invalidateCachedPropertyHtmlFiles();
      this.loadProperty();
      this.loadLeaseInformation();
      this.getLease();
    }
    
    // When officeId changes from parent, set the selected office (don't emit back)
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;

      if (newOfficeId !== previousOfficeId) {
        if (newOfficeId !== null && newOfficeId !== undefined && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
          if (this.selectedOffice) {
            this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId });
            this.filterReservations();
          }
        } else if (newOfficeId === null || newOfficeId === undefined) {
          this.selectedOffice = null;
          this.form.patchValue({ selectedOfficeId: null });
          this.filterReservations();
        }

        this.utilityService.addLoadItem(this.itemsToLoad$, 'leaseInformation');
        this.loadLeaseInformation();
      }
    }

    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue as string | null | undefined;
      const previousReservationId = changes['reservationId'].previousValue as string | null | undefined;
      if (newReservationId !== previousReservationId) {
        this.applyReservationSelectionFromInput(newReservationId);
      }
    }

    if (changes['openInViewOnTabSelect']) {
      const shouldOpenInView = !!changes['openInViewOnTabSelect'].currentValue;
      const wasOpenInView = !!changes['openInViewOnTabSelect'].previousValue;
      if (shouldOpenInView && !wasOpenInView) {
        this.switchToViewModeFromTabSelection();
      }
    }
  }

  switchToViewModeFromTabSelection(): void {
    if (!this.isEditMode) {
      this.pendingOpenInViewMode = false;
      return;
    }

    // Shell tab + merged reservation preview must use freshly generated HTML, not edit drafts.
    const draftHtml = this.loadStoredLeaseDraft();
    const htmlForView = String(draftHtml || this.baseTemplateHtml || this.form.get('lease')?.value || '').trim();
    if (htmlForView) {
      this.isEditMode = false;
      this.processAndSetHtml(htmlForView);
      this.pendingOpenInViewMode = false;
      return;
    }

    // Content not ready yet; defer until setEditorHtml/onEditIframeLoad runs.
    this.pendingOpenInViewMode = true;
  }

  getLease(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'lease');

    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease');
      this.http.get('assets/reservation-lease.html', { responseType: 'text' }).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease'); })).subscribe({
        next: (html: string) => {
          if (html) {
            this.form.patchValue({ lease: html });
            this.processAndSetHtml(html);
          } else {
            this.previewIframeHtml = '';
            this.resolvePreviewLoad();
          }
        },
        error: () => {
          this.previewIframeHtml = '';
          this.resolvePreviewLoad();
        }
      });
      return;
    }

    // Pull local HTML templates by default while testing.
    if (this.debuggingHtml) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease');
      this.generatePreviewIframe();
      return;
    }

     this.propertyHtmlService.getPropertyHtmlByPropertyId(this.propertyId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease'); })).subscribe({
       next: (response: PropertyHtmlResponse) => {
         this.propertyHtml = response ?? null;
         this.invalidateCachedPropertyHtmlFiles();
         this.generatePreviewIframe();
       },
       error: () => {
         this.propertyHtml = null;
         this.generatePreviewIframe();
       }
     });
  }

  reloadLease(): void {
    const reloadObservables: Observable<any>[] = [];
    if (this.reservationId) {
      reloadObservables.push(
        this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1),
          map((reservation: ReservationResponse) => {
            this.selectedReservation = reservation;
            this.form.patchValue({ selectedReservationId: reservation.reservationId });
            this.syncSelectedOfficeFromContext();
            this.loadContact();
            return { type: 'reservation', data: reservation };
          }),
          catchError(() => of({ type: 'reservation', data: null }))
        )
      );
    }
    
    // Reload lease information to get latest data
    if (this.propertyId) {
      const scope = this.getLeaseInformationScope();
      reloadObservables.push(
        this.leaseInformationService.getLeaseInformationByScope(scope.officeId, scope.propertyId).pipe(take(1),
          map((response: LeaseInformationResponse) => {
            this.leaseInformation = response;
            return { type: 'leaseInformation', data: response };
          }),
          catchError(() => {
            this.leaseInformation = null;
            return of({ type: 'leaseInformation', data: null });
          })
        )
      );
    }
    
    // Wait for all reloads to complete before regenerating preview
    if (reloadObservables.length > 0) {
      forkJoin(reloadObservables).pipe(take(1)).subscribe({
        next: () => {
          // Regenerate preview after all data is updated
          this.generatePreviewIframe();
        },
        error: () => {
          // Still try to regenerate preview even if there was an error
          this.generatePreviewIframe();
        }
      });
    } else {
      this.generatePreviewIframe();
    }
  }

  saveLease(): void {
    if (!this.selectedOffice || !this.selectedReservation) {
      this.toastr.warning('Please select an office and reservation to generate the lease', 'Missing Selection');
      this.isSubmitting = false;
      return;
    }

    this.isSubmitting = true;

    // Generate HTML with styles for PDF
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
      this.previewIframeHtml,
      this.previewIframeStyles,
      { fontSize: '10pt', includeLeaseStyles: true }
    );

    const fileName = this.utilityService.generateDocumentFileName(
      'lease',
      this.property.propertyCode,
      this.utilityService.getReservationDropdownLabel(
        this.selectedReservation,
        this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(this.selectedReservation)) ?? null
      ).trim() || undefined
    );
    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: this.organization!.organizationId,
      officeId: this.selectedOffice!.officeId,
      officeName: this.selectedOffice!.name,
      propertyId: this.propertyId || null,
      reservationId: this.selectedReservation?.reservationId || null,
      documentTypeId: DocumentType.ReservationLease,
      fileName: fileName
    };

    this.documentService.generate(generateDto).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        this.toastr.success('Document generated successfully', 'Success');
        this.isSubmitting = false;
        this.generatePreviewIframe();
      },
      error: () => {
        this.isSubmitting = false;
        this.generatePreviewIframe();
      }
    });
  }

  saveDraft(): void {
    const htmlSnapshot = this.captureLiveHtmlSnapshot();
    if (!htmlSnapshot) {
      this.toastr.warning('There is no lease content to save.');
      return;
    }
    this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot);
    this.toastr.success('Draft saved.');
  }

  resetForm(): void {
    this.dynamicFormDraftService.resetDraft(this.getDraftStorageKey());
    this.setEditorHtml(this.baseTemplateHtml || '');
    this.toastr.success('Form reset.');
  }

  viewForm(): void {
    const htmlSnapshot = this.captureLiveHtmlSnapshot();
    const htmlForView = htmlSnapshot || this.baseTemplateHtml || this.previewIframeHtml || '';
    if (!htmlForView) {
      this.toastr.warning('There is no lease content to view.');
      return;
    }
    this.dynamicFormDraftService.saveDraft(this.getDraftStorageKey(), htmlSnapshot || htmlForView);
    this.isEditMode = false;
    this.processAndSetHtml(htmlForView);
  }

  editForm(): void {
    if (!this.isEditMode) {
      const htmlForEdit = this.previewIframeHtml
        ? this.documentHtmlService.buildHtmlDocument(
            this.documentHtmlService.extractBodyContent(this.previewIframeHtml),
            '',
            this.previewIframeStyles || ''
          )
        : this.baseTemplateHtml || '';
      this.setEditorHtml(htmlForEdit);
      this.isEditMode = true;
    }
  }

  onEditIframeLoad(): void {
    this.ensureEditorControlsInteractive();
    if (this.pendingOpenInViewMode && this.openInViewOnTabSelect) {
      this.switchToViewModeFromTabSelection();
    }
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    const form = this.fb.group({
      lease: new FormControl(''),
      selectedReservationId: new FormControl({ value: null, disabled: !this.selectedOffice }),
      selectedOfficeId: new FormControl({ value: null, disabled: false }),
      includeLease: new FormControl(this.includeLease),
      includeLetterOfResponsibility: new FormControl(this.includeLetterOfResponsibility),
      includeNoticeToVacate: new FormControl(this.includeNoticeToVacate),
      includeCreditCardAuthorization: new FormControl(this.includeCreditCardAuthorization),
      includeBusinessCreditApplication: new FormControl(this.includeBusinessCreditApplication),
      includeRentalCreditApplication: new FormControl(this.includeRentalCreditApplication)
    });
    return form;
  }
  //#endregion

  //#region Form Response Methods
  applyReservationSelectionFromInput(reservationId: string | null | undefined): void {
    if (!reservationId || reservationId === 'new') {
      this.selectedReservation = null;
      this.contact = null;
      this.isCompanyRental = false;
      this.form.patchValue({ selectedReservationId: null }, { emitEvent: false });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
      this.generatePreviewIframe();
      return;
    }

    if (this.selectedReservation?.reservationId === reservationId) {
      this.form.patchValue({ selectedReservationId: reservationId }, { emitEvent: false });
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
      this.generatePreviewIframe();
      return;
    }

    this.reservationService.getReservationByGuid(reservationId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'))
    ).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.form.patchValue({ selectedReservationId: reservation.reservationId }, { emitEvent: false });
        this.syncSelectedOfficeFromContext();
        this.loadContact();
        this.generatePreviewIframe();
      },
      error: () => {
        this.generatePreviewIframe();
      }
    });
  }

  filterReservations(): void {
    if (!this.selectedOffice) {
      this.availableReservations = [];
      // Disable the reservation dropdown when no office is selected
      this.form.get('selectedReservationId')?.disable();
      return;
    }
    
    // Enable the reservation dropdown when an office is selected
    this.form.get('selectedReservationId')?.enable();
    
    // Filter reservations by office
    let filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOffice.officeId);
    
    // If reservationId is provided (coming from reservation), only show that reservation
    if (this.reservationId && this.reservationId !== '') {
      filteredReservations = filteredReservations.filter(r => r.reservationId === this.reservationId);
    }
    
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.contacts.find(c => c.contactId === r.contactId) ?? null)
    }));
  }

  onIncludeCheckboxChange(controlName: string, event: MatCheckboxChange): void {
    const control = this.form.get(controlName);
    if (!control) {
      return;
    }

    control.setValue(event.checked, { emitEvent: false });
    this.syncIncludeFlagsFromForm();
    this.lastDocumentSelectionKey = '';
    if (this.shouldBypassStoredDraft()) {
      this.clearStoredLeaseDraft();
    }
    this.generatePreviewIframe();
  }

  /** Shell mode: skip property-scoped loads until office + property are set. */
  clearShellScopeLoadItems(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
  }

  /** Shell passes officeId and propertyId together when the reservation is selected. */
  applyShellScopeFromInputs(): void {
    if (this.officeId == null || !this.propertyId) {
      this.clearShellScopeLoadItems();
      return;
    }

    this.clearStoredLeaseDraft();

    if (this.reservationId && this.reservationId !== 'new') {
      this.form.patchValue({ selectedReservationId: this.reservationId }, { emitEvent: false });
    }

    if (this.offices.length > 0) {
      this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
      if (this.selectedOffice) {
        this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId }, { emitEvent: false });
        this.filterReservations();
      }
    }

    this.loadProperty();
    this.utilityService.addLoadItem(this.itemsToLoad$, 'leaseInformation');
    this.loadLeaseInformation();

    if (this.reservationId && this.reservationId !== 'new') {
      this.applyReservationSelectionFromInput(this.reservationId);
      return;
    }

    this.getLease();
  }

  /** Resolve selectedOffice from parent officeId, reservation, or property once offices are loaded. */
  syncSelectedOfficeFromContext(): boolean {
    if (this.selectedOffice) {
      return true;
    }

    const officeIdToResolve =
      (this.officeId != null && this.officeId !== undefined ? this.officeId : null) ??
      this.selectedReservation?.officeId ??
      this.property?.officeId ??
      null;

    if (officeIdToResolve == null || this.offices.length === 0) {
      return false;
    }

    this.selectedOffice = this.offices.find(o => o.officeId === officeIdToResolve) || null;
    if (!this.selectedOffice) {
      return false;
    }

    this.form.patchValue({ selectedOfficeId: this.selectedOffice.officeId }, { emitEvent: false });
    this.filterReservations();
    return true;
  }

  get isOfficeSelectionLocked(): boolean {
    return this.lockOfficeSelection;
  }

  getDocumentSelectionKey(): string {
    const parts = [
      this.form.get('includeLease')?.value ? 'lease' : '',
      this.form.get('includeLetterOfResponsibility')?.value ? 'lor' : '',
      this.form.get('includeNoticeToVacate')?.value ? 'ntv' : '',
      this.form.get('includeCreditCardAuthorization')?.value ? 'cca' : ''
    ];
    if (this.isCompanyRental) {
      parts.push(this.form.get('includeBusinessCreditApplication')?.value ? 'bca' : '');
    } else {
      parts.push(this.form.get('includeRentalCreditApplication')?.value ? 'rca' : '');
    }
    return parts.filter(part => part.length > 0).join('|');
  }

  getDraftStorageKey(): string {
    const organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    return this.dynamicFormDraftService.buildDraftKey(
      organizationId,
      null,
      this.selectedOffice?.officeId ?? this.officeId ?? null,
      this.propertyId || null,
      `reservation-lease-${this.reservationId || 'new'}`
    );
  }

  /** Shell lease tab and merged reservation preview must not reuse edit-mode local drafts. */
  shouldBypassStoredDraft(): boolean {
    return (this.shellMode && this.openInViewOnTabSelect) || !!this.form?.get('selectedReservationId')?.value;
  }

  clearStoredLeaseDraft(): void {
    this.dynamicFormDraftService.resetDraft(this.getDraftStorageKey());
  }

  loadStoredLeaseDraft(): string | null {
    if (this.shouldBypassStoredDraft()) {
      return null;
    }
    return this.dynamicFormDraftService.loadDraft(this.getDraftStorageKey());
  }

  renderLeasePreviewHtml(htmlToRender: string): void {
    const normalizedHtml = htmlToRender || '';
    this.form.patchValue({ lease: normalizedHtml }, { emitEvent: false });

    const forceShellViewPreview = this.shellMode && this.openInViewOnTabSelect && !!this.form.get('selectedReservationId')?.value;
    if (forceShellViewPreview) {
      this.isEditMode = false;
    }

    if (forceShellViewPreview || !this.isEditMode) {
      this.pendingOpenInViewMode = false;
      this.editableHtml = null;
      this.processAndSetHtml(normalizedHtml);
      return;
    }

    this.setEditorHtml(normalizedHtml);
    this.resolvePreviewLoad();
    this.iframeKey++;
  }

  getLeaseInformationScope(): { officeId: number | null; propertyId: string | null } {
    if (this.leaseInformationScopeOverride) {
      return this.leaseInformationScopeOverride;
    }

    return {
      officeId: this.officeId,
      propertyId: this.propertyId || null
    };
  }

  applyOfficeSelectionLockState(): void {
    const officeControl = this.form?.get('selectedOfficeId');
    if (!officeControl) {
      return;
    }

    if (this.lockOfficeSelection) {
      officeControl.disable({ emitEvent: false });
    } else {
      officeControl.enable({ emitEvent: false });
    }
  }
  //#endregion

   //#region Data Loading Methods 
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
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.markLogoSourceLoaded('organization');
    })).subscribe({
      next: (org: OrganizationResponse) => {
        this.organization = org;
      },
      error: () => {}
    });
  }

  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); this.markLogoSourceLoaded('offices'); })).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          if (!this.officesInitialized) {
            this.officesInitialized = true;
          }
          if (this.shellMode) {
            this.applyShellScopeFromInputs();
          } else {
            this.syncSelectedOfficeFromContext();
            if (this.selectedReservation && this.form.get('selectedReservationId')?.value) {
              this.generatePreviewIframe();
            }
          }
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
      }
    });
  }

  markLogoSourceLoaded(source: 'offices' | 'organization'): void {
    this.logoSourcesLoaded[source] = true;
    if (this.logoSourcesLoaded.offices && this.logoSourcesLoaded.organization) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'logo');
    }
  }
  
  loadAccountingOffices(): void {
    this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'); })).subscribe({
      next: (accountingOffices) => {
        this.accountingOffices = accountingOffices || [];
      },
      error: () => {
        this.accountingOffices = [];
      }
    });
  }

  loadBuildings(): void {
    if (!this.organizationId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings');
      return;
    }

    this.buildingService.getBuildings().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'buildings'); })).subscribe({
      next: (buildings: BuildingResponse[]) => {
        this.buildings = (buildings || []).filter(building => building.isActive);
      },
      error: () => {
        this.buildings = [];
      }
    });
  }

  loadProperty(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        this.syncSelectedOfficeFromContext();
        if (this.isPageReady) {
          this.invalidateCachedPropertyHtmlFiles();
          this.generatePreviewIframe();
        }
      },
      error: () => {
        this.property = null;
        if (this.isPageReady) {
          this.generatePreviewIframe();
        }
      }
    });
  }

  loadLeaseInformation(): void {
    const scope = this.getLeaseInformationScope();
    this.leaseInformationService.getLeaseInformationByScope(scope.officeId, scope.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation'); })).subscribe({
      next: (response: LeaseInformationResponse) => {
        this.leaseInformation = response;
        this.generatePreviewIframe();
      },
      error: () => {
        this.leaseInformation = null;
        this.generatePreviewIframe();
      }
    });
  }
  
  loadReservations(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.reservationService.getReservationList().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'); })).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadReservation(): void {
    if (!this.reservationId || this.reservationId === 'new') {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation');
      return;
    }
    
    this.reservationService.getReservationByGuid(this.reservationId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'); })).subscribe({
      next: (reservation: ReservationResponse) => {
        this.selectedReservation = reservation;
        this.form.patchValue({ selectedReservationId: reservation.reservationId });
        this.syncSelectedOfficeFromContext();
        this.loadContact();
        this.generatePreviewIframe();
      },
      error: () => {}
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml'); })).subscribe({
      next: (response: EmailHtmlResponse) => {
        this.emailHtml = this.mappingService.mapEmailHtml(response as any);
      },
      error: () => {}
    });
  }

  loadContact(): void {
    const selectedContactId = this.getPrimaryReservationContactId(this.selectedReservation);
    if (!selectedContactId) {
      this.contact = null;
      this.companyContact = null;
      this.isCompanyRental = false;
      return;
    }

    this.contact = this.contacts.find(c => c.contactId === selectedContactId) || null;
    this.companyContact = this.selectedReservation.companyId
      ? this.contacts.find(c => c.contactId === this.selectedReservation?.companyId) || null
      : null;

    if (this.contact && this.contact.entityTypeId === EntityType.Company) {
      this.isCompanyRental = true;
      this.form.patchValue({ includeRentalCreditApplication: false });
    } else {
      this.isCompanyRental = false;
      this.form.patchValue({ includeBusinessCreditApplication: false });
    }
  }
  //#endregion

  //#region Field Replacement Helpers
  getPrimaryReservationContactId(reservation: ReservationResponse | null): string | null {
    const contactIds = reservation?.contactIds || [];
    const firstContactId = contactIds.find(id => String(id || '').trim().length > 0);
    return firstContactId ? String(firstContactId) : null;
  }
  
  getAccountingOfficeAddress(): string {
    if (!this.property) {
      return '';
    }

    const ao = this.accountingOffices.find(a => a.officeId === this.property?.officeId);
    const officeAddressSource = ao || this.selectedOffice;
    if (!officeAddressSource) {
      return '';
    }

    const address1 = String(officeAddressSource.address1 || '').trim();
    const suite = String((officeAddressSource as any).suite || '').trim();
    const address1WithSuite = suite ? `${address1}, ${suite}` : address1;
    const parts = [
      address1WithSuite,
      officeAddressSource.city,
      officeAddressSource.state,
      officeAddressSource.zip
    ].filter(p => p);
    return parts.join(', ');
  }

  getCommunityAddress(): string {
    if (!this.property) return '';
    const isInternational = (this.property as any).isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.property.address1,
        this.property.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.property.address1,
        this.property.city,
        this.property.state,
        this.property.zip
      ].filter(p => p);
      return parts.join(', ');
    }
  }

  getComplex(): string {
    if (!this.property) return '';

    if (this.property.buildingId != null) {
      const selectedBuilding = this.buildings.find(building => Number(building.buildingId) === Number(this.property?.buildingId));
      if (selectedBuilding?.name) {
        return selectedBuilding.name;
      }
    }

    return this.property.propertyCode || '';
  }

  getApartmentAddress(): string {
    if (!this.property) return '';
    const isInternational = (this.property as any).isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.property.address1,
        this.property.suite ? `#${this.property.suite}` : '',
        this.property.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.property.address1,
        this.property.suite ? `#${this.property.suite}` : '',
        this.property.city,
        this.property.state,
        this.property.zip
      ].filter(p => p);
      return parts.join(', ');
    }
  }

  getPropertyAddressForDisplay(label: string): string {
    if (!this.property) {
      return '';
    }
    const line1 = [
      this.property.address1,
      this.property.suite ? `#${this.property.suite}` : '',
      this.property.address2
    ].filter(part => String(part || '').trim().length > 0).join(', ');
    const line2 = [
      this.property.city,
      this.property.state,
      this.property.zip
    ].filter(part => String(part || '').trim().length > 0).join(', ');

    if (!line1 && !line2) {
      return '';
    }
    if (!line2) {
      return this.escapeHtml(line1);
    }
    if (this.utilityService.isAddressSingleLine(label, line1, line2)) {
      return this.escapeHtml(`${line1}, ${line2}`);
    }
    return `${this.escapeHtml(line1)}<br>&nbsp;&nbsp;&nbsp;&nbsp;${this.escapeHtml(line2)}`;
  }

  getNoticeToVacatePropertyAddress(): string {
    return this.getPropertyAddressForDisplay('Property Address:');
  }

  getCreditAuthorizationPropertyAddress(): string {
    return this.getPropertyAddressForDisplay('Property Address:');
  }

  getOrganizationAddress(): string {
    if (!this.organization) return '';
    const isInternational = this.organization.isInternational || false;
    
    if (isInternational) {
      // For international addresses, compose from Address1 and Address2
      const parts = [
        this.organization.address1,
        this.organization.address2
      ].filter(p => p);
      return parts.join(', ');
    } else {
      // For US addresses, use the existing logic
      const parts = [
        this.organization.address1,
        this.organization.city,
        this.organization.state,
        this.organization.zip
      ].filter(p => p);
      return parts.join(', ');
    }
  }

  getWebsiteWithProtocol(): string {
    if (!this.organization?.website) return '';
    const website = this.organization.website;
    if (website.startsWith('http://') || website.startsWith('https://')) {
      return website;
    }
    return `http://${website}`;
  }

  getReservationNoticeText(): string {
    if (this.selectedReservation?.reservationNoticeId === null || this.selectedReservation?.reservationNoticeId === undefined) return '';
    if (this.selectedReservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '(30 day written notice is required)';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FifteenDays) {
      return '(15 day written notice is required)';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '(14 day written notice is required)';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.SixtyDays) {
      return '(60 day written notice is required)';
    }
    return '';
  }

  getReservationDayNotice(): string {
    if (this.selectedReservation?.reservationNoticeId === null || this.selectedReservation?.reservationNoticeId === undefined) return '';
    if (this.selectedReservation.reservationNoticeId === ReservationNotice.ThirtyDays) {
      return '30';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FifteenDays) {
      return '15';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.FourteenDays) {
      return '14';
    } else if (this.selectedReservation.reservationNoticeId === ReservationNotice.SixtyDays) {
      return '60';
    }
    return '';
  }

  getPetText(): string {
    if (!this.selectedReservation) return '';
    return this.selectedReservation.hasPets 
      ? '$' + (this.selectedReservation.petFee || 0).toFixed(2) + '     ' + this.selectedReservation.numberOfPets.toString() + ' pet(s)    ' + 'Type(s):' + this.selectedReservation.petDescription
      : 'None';
  }

  getExtensionsPossible(): string {
    if (!this.selectedReservation) return 'No';
    return this.selectedReservation.allowExtensions ? 'Yes' : 'No';
  }

  getOrganizationName(): string {
    if (!this.organization) return '';
    if (this.selectedOffice) {
      return this.organization.name + ' ' + this.selectedOffice.name;
    }
    return this.organization.name;
  }

  getOrganizationNameUpper(): string {
    if (!this.organization) return '';
    const name = this.selectedOffice 
      ? this.organization.name + ' ' + this.selectedOffice.name
      : this.organization.name;
    return name.toUpperCase();
  }

  getOrganizationWebsite(): string {
     return this.selectedOffice?.website ?? this.organization?.website ?? '';
  }

  getBillingTypeText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'Monthly';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'Daily';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'Nightly';
    }
    return '';
  }

  getBillingDayText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'month';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'day';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'night';
    }
    return '';
  }

   getProrateDayText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'day';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'day';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'night';
    }
    return '';
  }

  getBillingTypeLowerText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Monthly) {
      return 'monthly';
    } else if (this.selectedReservation.billingTypeId === BillingType.Daily) {
      return 'daily';
    } else if (this.selectedReservation.billingTypeId === BillingType.Nightly) {
      return 'nightly';
    }
    return '';
  }

  getResponsibleNoun(): string {
    const reservationTypeId = this.selectedReservation?.reservationTypeId;
    if (reservationTypeId === ReservationType.Corporate) {
      return 'Company';
    }
    return 'Tenant';
  }

  getResponsibleParty(): string {
    return this.utilityService.getResponsibleParty(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  lookupStateName(code: string | null | undefined): string {
    const normalized = String(code || '').trim();
    if (!normalized) {
      return '';
    }
    const match = (this.commonService.getStatesFullValue() || []).find(state =>
      String(state.code || '').trim().toLowerCase() === normalized.toLowerCase()
    );
    return String(match?.name || normalized).trim();
  }

  getTenantStateFullName(): string {
    return this.lookupStateName(this.getPrimaryResponsibleContact()?.state);
  }

  getResponsiblePartyAddress1() {
    return this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyAddress2() {
    return this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyPhone() {
    return this.utilityService.getResponsiblePartyPhone(this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyEmail() {
    return this.utilityService.getResponsiblePartyEmail(this.getPrimaryResponsibleContact());
  }

  getResponsiblePartiesBlock(): string {
    const contacts = this.getResponsibleContacts();
    if (contacts.length === 0) {
      return '';
    }

    return contacts.map(contact => {
      const responsibleParty = this.escapeHtml(this.utilityService.getResponsibleParty(this.selectedReservation, contact));
      const responsiblePartyAddress1Raw = this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, contact);
      const responsiblePartyAddress2Raw = this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, contact);
      const responsiblePartyAddress1 = this.escapeHtml(responsiblePartyAddress1Raw);
      const responsiblePartyAddress2 = this.escapeHtml(responsiblePartyAddress2Raw);
      const responsiblePartyAddressSingleLine = [responsiblePartyAddress1, responsiblePartyAddress2].filter(part => part).join(', ');
      const responsiblePartyPhone = this.escapeHtml(this.utilityService.getResponsiblePartyPhone(contact));
      const responsiblePartyEmail = this.escapeHtml(this.utilityService.getResponsiblePartyEmail(contact));
      const useSingleAddressLine = this.utilityService.isAddressSingleLine("Address:", responsiblePartyAddress1Raw, responsiblePartyAddress2Raw);

      return [
        `<span style="font-weight: bold">Name(s):</span> ${responsibleParty}<br>`,
        useSingleAddressLine
          ? `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddressSingleLine}<br>`
          : `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}<br>`,
        ...(!useSingleAddressLine && responsiblePartyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${responsiblePartyAddress2}<br>`] : []),
        `<span style="font-weight: bold">Phone:</span> ${responsiblePartyPhone}<br>`,
        `<span style="font-weight: bold">Email:</span> ${responsiblePartyEmail}<br>`
      ].join('');
    }).join('<br>');
  }

  getPrimaryResponsibleContact(): ContactResponse | null {
    return this.getResponsibleContacts()[0] || null;
  }

  getResponsibleContacts(): ContactResponse[] {
    const selectedContactIds = this.selectedReservation?.contactIds || [];
    const uniqueContactIds = new Set<string>();
    const contacts: ContactResponse[] = [];

    selectedContactIds.forEach(contactId => {
      const normalizedContactId = String(contactId || '').trim();
      if (!normalizedContactId || uniqueContactIds.has(normalizedContactId)) {
        return;
      }
      const reservationContact = this.contacts.find(c => c.contactId === normalizedContactId);
      if (reservationContact) {
        uniqueContactIds.add(normalizedContactId);
        contacts.push(reservationContact);
      }
    });

    if (contacts.length === 0 && this.contact) {
      contacts.push(this.contact);
    }

    return contacts;
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getSecurityDepositText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return '$0.00';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' per month';
    else 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' ';
  }
    
  getSecurityProrateText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return '$0.00';
    else 
      return '$' + (this.selectedReservation.deposit/30).toFixed(2) + ' per ' + this.getProrateDayText();
  }

  getLetterOfResponsibilityText(): string {
    if (!this.selectedReservation) return '';
     else if (this.selectedReservation.depositTypeId === DepositType.CLR) {
      return 'Corporate Letter of Responsibility';
     }
    else {
      return 'Letter of Responsibility';
    }
  }

  getPartialMonthText(): string {
    if (!this.property) return '';
    if (this.selectedReservation.billingTypeId === BillingType.Daily) 
      return '$' + this.selectedReservation.billingRate.toFixed(2) + ' per day.';
    else if (this.selectedReservation.billingTypeId === BillingType.Nightly) 
      return '$' + this.selectedReservation.billingRate.toFixed(2) + ' per night.';
    else (this.selectedReservation.billingTypeId === BillingType.Monthly) 
      return 'Monthly Rate divided by 30 days.';
  }
  
  getDepositLabel(): string{
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return 'Deposit';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return 'Security Deposit Waiver';
    else 
      return 'Deposit';
  }

  getDepositRequirementText(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return 'Corporate Letter of Responsibility';
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' per month';
    else 
      return '$' + this.selectedReservation.deposit.toFixed(2) + ' ';
  }
  
  getDepositRequirementText2(): string {
    if (!this.selectedReservation) return '';
    if (this.selectedReservation.depositTypeId === DepositType.CLR) 
      return `(Required to reserve unit)`;
    else if (this.selectedReservation.depositTypeId === DepositType.SDW) 
      return `(To be included with monthly rent)`;
    else return `(See below)`;
  }

  getDefaultUtilityFeeText(): string {
    if(!this.property || !this.selectedOffice) return '';

    if (this.property.propertyTypeId === PropertyType.House) {
      return this.selectedOffice.utilityHouse.toFixed(2);
    }

    const bedrooms = this.property.bedrooms;
    let utilityFee: number | undefined;

    switch(bedrooms) {
      case 1:
        utilityFee = this.selectedOffice.utilityOneBed;
        break;
      case 2:
        utilityFee = this.selectedOffice.utilityTwoBed;
        break;
      case 3:
        utilityFee = this.selectedOffice.utilityThreeBed;
        break;
      case 4:
        utilityFee = this.selectedOffice.utilityFourBed;
        break;
      default:
        // For 5+ bedrooms, use utilityHouse
        utilityFee = this.selectedOffice.utilityHouse;
        break;
    }

    if (utilityFee !== null && utilityFee !== undefined) {
      return utilityFee.toFixed(2);
    }
    return '';
  }

  getDefaultMaidServiceFeeText(): string {
    if(!this.property || !this.selectedOffice) return '';

    if (this.property.propertyTypeId === PropertyType.House) {
      return this.selectedOffice.maidHouse.toFixed(2);
    }

    const bedrooms = this.property.bedrooms;
    let maidFee: number | undefined;

    switch(bedrooms) {
      case 1:
        maidFee = this.selectedOffice.maidOneBed;
        break;
      case 2:
        maidFee = this.selectedOffice.maidTwoBed;
        break;
      case 3:
        maidFee = this.selectedOffice.maidThreeBed;
        break;
      case 4:
        maidFee = this.selectedOffice.maidFourBed;
        break;
      default:
        // For 5+ bedrooms, use maidHouse
        maidFee = this.selectedOffice.maidHouse;
        break;
    }

    if (maidFee !== null && maidFee !== undefined) {
      return maidFee.toFixed(2);
    }
    return '';
  }
  //#endregion

  //#region Placeholder Replacement Logic
  replacePlaceholders(html: string): string {
    let result = html;

    // LAYER 0: Handle conditional sections (must be done before placeholder replacement)
    result = this.replaceConditionalSections(result);

    // LAYER 1: Replace lease information placeholders first (with their raw text values)
    result = this.replaceLeaseInformationPlaceholders(result);

    // LAYER 2: Replace all other placeholders (reservation, property, contact, organization, etc.)
    result = this.replaceAllOtherPlaceholders(result);

    return result;
  }

  replaceConditionalSections(html: string): string {
    let result = html;

    // Handle conditional section: Security Deposit Waiver (only show if depositType is SDW)
    // Pattern: {{#if depositTypeSDW}}...content...{{#else}}...else content...{{/if}}
    // The content can contain placeholders that will be replaced in later layers
    const depositTypeSDWPattern = /\{\{#if depositTypeSDW\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    result = result.replace(depositTypeSDWPattern, (match, content) => {
      // Check if there's an else clause
      const elsePattern = /\{\{#else\}\}/;
      if (elsePattern.test(content)) {
        const parts = content.split(/\{\{#else\}\}/);
        const ifContent = parts[0] || '';
        const elseContent = parts[1] || '';
        
        if (this.selectedReservation?.depositTypeId === DepositType.SDW) {
          return ifContent;
        } else {
          return elseContent;
        }
      } else {
        // No else clause - use original logic
        if (this.selectedReservation?.depositTypeId === DepositType.SDW) {
          return content;
        } else {
          return '';
        }
      }
    });

    // Handle conditional section: Partial Month Calculation (only show if billingType is Monthly)
    // Pattern: {{#if billingTypeMonthly}}...content...{{#else}}...else content...{{/if}}
    const billingTypeMonthlyPattern = /\{\{#if billingTypeMonthly\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    result = result.replace(billingTypeMonthlyPattern, (match, content) => {
      // Check if there's an else clause
      const elsePattern = /\{\{#else\}\}/;
      if (elsePattern.test(content)) {
        const parts = content.split(/\{\{#else\}\}/);
        const ifContent = parts[0] || '';
        const elseContent = parts[1] || '';
        
        if (this.selectedReservation?.billingTypeId === BillingType.Monthly) {
          return ifContent;
        } else {
          return elseContent;
        }
      } else {
        // No else clause - use original logic
        if (this.selectedReservation?.billingTypeId === BillingType.Monthly) {
          return content;
        } else {
          return '';
        }
      }
    });

    // Handle conditional section: Reference Number (only show if reservation has a value)
    // Pattern: {{#if referenceNo}}...content...{{/if}}
    const referenceNoPattern = /\{\{#if referenceNo\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let referenceNo: string | null = null;
    if (this.selectedReservation?.referenceNo) {
      referenceNo = this.selectedReservation.referenceNo;
    }
    result = result.replace(referenceNoPattern, (match, content) => {
      return referenceNo && referenceNo.trim().length > 0 ? content : '';
    });

    return result;
  }

  replaceLeaseInformationPlaceholders(html: string): string {
    let result = html;

    if (this.leaseInformation) {
      result = result.replace(/\{\{rentalPayment\}\}/g, this.leaseInformation.rentalPayment || '');
      result = result.replace(/\{\{securityDeposit\}\}/g, this.leaseInformation.securityDeposit || '');
      result = result.replace(/\{\{securityDepositWaiver\}\}/g, this.leaseInformation.securityDepositWaiver || '');
      result = result.replace(/\{\{cancellationPolicy\}\}/g, this.leaseInformation.cancellationPolicy || '');
      result = result.replace(/\{\{keyPickUpDropOff\}\}/g, this.leaseInformation.keyPickUpDropOff || '');
      result = result.replace(/\{\{partialMonth\}\}/g, this.leaseInformation.partialMonth || '');
      result = result.replace(/\{\{departureNotification\}\}/g, this.leaseInformation.departureNotification || '');
      result = result.replace(/\{\{holdover\}\}/g, this.leaseInformation.holdover || '');
      result = result.replace(/\{\{departureServiceFee\}\}/g, this.leaseInformation.departureServiceFee || '');
      result = result.replace(/\{\{checkoutProcedure\}\}/g, this.leaseInformation.checkoutProcedure || '');
      result = result.replace(/\{\{parking\}\}/g, this.leaseInformation.parking || '');
      result = result.replace(/\{\{rulesAndRegulations\}\}/g, this.leaseInformation.rulesAndRegulations || '');
      result = result.replace(/\{\{occupyingTenants\}\}/g, this.leaseInformation.occupyingTenants || '');
      result = result.replace(/\{\{utilityAllowance\}\}/g, this.leaseInformation.utilityAllowance || '');
      result = result.replace(/\{\{maidService\}\}/g, this.leaseInformation.maidService || '');
      result = result.replace(/\{\{pets\}\}/g, this.leaseInformation.pets || '');
      result = result.replace(/\{\{smoking\}\}/g, this.leaseInformation.smoking || '');
      result = result.replace(/\{\{emergencies\}\}/g, this.leaseInformation.emergencies || '');
      result = result.replace(/\{\{homeownersAssociation\}\}/g, this.leaseInformation.homeownersAssociation || '');
      result = result.replace(/\{\{indemnification\}\}/g, this.leaseInformation.indemnification || '');
      result = result.replace(/\{\{defaultClause\}\}/g, this.leaseInformation.defaultClause || '');
      result = result.replace(/\{\{attorneyCollectionFees\}\}/g, this.leaseInformation.attorneyCollectionFees || '');
      result = result.replace(/\{\{reservedRights\}\}/g, this.leaseInformation.reservedRights || '');
      result = result.replace(/\{\{propertyUse\}\}/g, this.leaseInformation.propertyUse || '');
      result = result.replace(/\{\{miscellaneous\}\}/g, this.leaseInformation.miscellaneous || '');

      result = result.replace(/\{\{rentalPaymentSection\}\}/g, this.buildLeaseInfoSectionHtml('Rental Payments', this.leaseInformation.rentalPayment));
      result = result.replace(/\{\{securityDepositWaiverSection\}\}/g, this.buildLeaseInfoSectionHtml('Security Deposit Waiver', this.leaseInformation.securityDepositWaiver));
      result = result.replace(/\{\{securityDepositSection\}\}/g, this.buildLeaseInfoSectionHtml('Security Deposit/Credit Card Authorizations', this.leaseInformation.securityDeposit));
      result = result.replace(/\{\{cancellationPolicySection\}\}/g, this.buildLeaseInfoSectionHtml('Cancellation Policy', this.leaseInformation.cancellationPolicy));
      result = result.replace(/\{\{keyPickUpDropOffSection\}\}/g, this.buildLeaseInfoSectionHtml('Key Pick-up and drop-off', this.leaseInformation.keyPickUpDropOff));
      result = result.replace(/\{\{partialMonthSection\}\}/g, this.buildLeaseInfoSectionHtml('Partial Month Calculation', this.leaseInformation.partialMonth));
      result = result.replace(/\{\{departureNotificationSection\}\}/g, this.buildLeaseInfoSectionHtml('Departure Notification/Extensions', this.leaseInformation.departureNotification));
      result = result.replace(/\{\{holdoverSection\}\}/g, this.buildLeaseInfoSectionHtml('Holdover', this.leaseInformation.holdover));
      result = result.replace(/\{\{departureServiceFeeSection\}\}/g, this.buildLeaseInfoSectionHtml('Departure Service Fee', this.leaseInformation.departureServiceFee));
      result = result.replace(/\{\{checkoutProcedureSection\}\}/g, this.buildLeaseInfoSectionHtml('Checkout Procedure', this.leaseInformation.checkoutProcedure));
      result = result.replace(/\{\{parkingSection\}\}/g, this.buildLeaseInfoSectionHtml('Parking', this.leaseInformation.parking));
      result = result.replace(/\{\{rulesAndRegulationsSection\}\}/g, this.buildLeaseInfoSectionHtml('Rules & Regulations', this.leaseInformation.rulesAndRegulations));
      result = result.replace(/\{\{occupyingTenantsSection\}\}/g, this.buildLeaseInfoSectionHtml('Occupying Tenants', this.leaseInformation.occupyingTenants));
      result = result.replace(/\{\{utilityAllowanceSection\}\}/g, this.buildLeaseInfoSectionHtml('Utility Allowance', this.leaseInformation.utilityAllowance));
      result = result.replace(/\{\{maidServiceSection\}\}/g, this.buildLeaseInfoSectionHtml('Maid Service', this.leaseInformation.maidService));
      result = result.replace(/\{\{petsSection\}\}/g, this.buildLeaseInfoSectionHtml('Pets', this.leaseInformation.pets));
      result = result.replace(/\{\{smokingSection\}\}/g, this.buildLeaseInfoSectionHtml('Smoking in unit', this.leaseInformation.smoking));
      result = result.replace(/\{\{emergenciesSection\}\}/g, this.buildLeaseInfoSectionHtml('Emergencies', this.leaseInformation.emergencies));
      result = result.replace(/\{\{homeownersAssociationSection\}\}/g, this.buildLeaseInfoSectionHtml('Homeowner\'s Association', this.leaseInformation.homeownersAssociation));
      result = result.replace(/\{\{indemnificationSection\}\}/g, this.buildLeaseInfoSectionHtml('Indemnification', this.leaseInformation.indemnification));
      result = result.replace(/\{\{defaultClauseSection\}\}/g, this.buildLeaseInfoSectionHtml('Default', this.leaseInformation.defaultClause));
      result = result.replace(/\{\{attorneyCollectionFeesSection\}\}/g, this.buildLeaseInfoSectionHtml('Attorneys\'/Collection Fees', this.leaseInformation.attorneyCollectionFees));
      result = result.replace(/\{\{reservedRightsSection\}\}/g, this.buildLeaseInfoSectionHtml('Reserved Rights', this.leaseInformation.reservedRights));
      result = result.replace(/\{\{propertyUseSection\}\}/g, this.buildLeaseInfoSectionHtml('Use', this.leaseInformation.propertyUse));
      result = result.replace(/\{\{miscellaneousSection\}\}/g, this.buildLeaseInfoSectionHtml('Miscellaneous', this.leaseInformation.miscellaneous, false));
    } else {
      result = result.replace(/\{\{rentalPaymentSection\}\}/g, '');
      result = result.replace(/\{\{securityDepositWaiverSection\}\}/g, '');
      result = result.replace(/\{\{securityDepositSection\}\}/g, '');
      result = result.replace(/\{\{cancellationPolicySection\}\}/g, '');
      result = result.replace(/\{\{keyPickUpDropOffSection\}\}/g, '');
      result = result.replace(/\{\{partialMonthSection\}\}/g, '');
      result = result.replace(/\{\{departureNotificationSection\}\}/g, '');
      result = result.replace(/\{\{holdoverSection\}\}/g, '');
      result = result.replace(/\{\{departureServiceFeeSection\}\}/g, '');
      result = result.replace(/\{\{checkoutProcedureSection\}\}/g, '');
      result = result.replace(/\{\{parkingSection\}\}/g, '');
      result = result.replace(/\{\{rulesAndRegulationsSection\}\}/g, '');
      result = result.replace(/\{\{occupyingTenantsSection\}\}/g, '');
      result = result.replace(/\{\{utilityAllowanceSection\}\}/g, '');
      result = result.replace(/\{\{maidServiceSection\}\}/g, '');
      result = result.replace(/\{\{petsSection\}\}/g, '');
      result = result.replace(/\{\{smokingSection\}\}/g, '');
      result = result.replace(/\{\{emergenciesSection\}\}/g, '');
      result = result.replace(/\{\{homeownersAssociationSection\}\}/g, '');
      result = result.replace(/\{\{indemnificationSection\}\}/g, '');
      result = result.replace(/\{\{defaultClauseSection\}\}/g, '');
      result = result.replace(/\{\{attorneyCollectionFeesSection\}\}/g, '');
      result = result.replace(/\{\{reservedRightsSection\}\}/g, '');
      result = result.replace(/\{\{propertyUseSection\}\}/g, '');
      result = result.replace(/\{\{miscellaneousSection\}\}/g, '');
    }

    return result;
  }

  buildLeaseInfoSectionHtml(title: string, content: string | null | undefined, wrapInParagraph: boolean = true): string {
    if (!this.hasMeaningfulLeaseSectionContent(content)) {
      return '';
    }
    return wrapInParagraph
      ? `<div class="keep-together"><h2>${title}</h2><p>${content}</p></div>`
      : `<div class="keep-together"><h2>${title}</h2>${content}<br><br></div>`;
  }

  hasMeaningfulLeaseSectionContent(content: string | null | undefined): boolean {
    if (!content) {
      return false;
    }
    const withoutHtml = content
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    return withoutHtml.length > 0;
  }

  getUnderlinedFillValue(value: string | number | null | undefined): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || this.isZeroLikeValue(trimmed)) {
      return '<span class="inline-underline-fill"></span>';
    }
    return this.escapeHtml(trimmed);
  }

  isZeroLikeValue(value: string): boolean {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return true;
    }

    const numericCandidate = trimmed.replace(/[$,%\s,]/g, '');
    if (!numericCandidate) {
      return false;
    }

    if (!/^[+-]?\d*(\.\d+)?$/.test(numericCandidate)) {
      return false;
    }

    const numericValue = Number(numericCandidate);
    return Number.isFinite(numericValue) && numericValue === 0;
  }

  replaceAllOtherPlaceholders(html: string): string {
    let result = html;
    // Some lease-information templates wrap after-hours phone in underline spans.
    // Keep this value plain text (no underline) per business request.
    result = result.replace(
      /<span[^>]*class=["'][^"']*inline-underline-fill[^"']*["'][^>]*>\s*\{\{afterHoursPhone\}\}\s*<\/span>/gi,
      '{{afterHoursPhone}}'
    );
    result = result.replace(/<u>\s*\{\{afterHoursPhone\}\}\s*<\/u>/gi, '{{afterHoursPhone}}');
    result = result.replace(
      /<span[^>]*style=["'][^"']*text-decoration\s*:\s*underline[^"']*["'][^>]*>\s*\{\{afterHoursPhone\}\}\s*<\/span>/gi,
      '{{afterHoursPhone}}'
    );

    // Replace reservation placeholders
    if (this.selectedReservation) {
      let referenceNo: string | null = null;
      if (this.selectedReservation.referenceNo) {
        referenceNo = this.selectedReservation.referenceNo;
      }

      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.getUnderlinedFillValue(this.getAccountingOfficeAddress()));
      result = result.replace(/\{\{reservationCode\}\}/g, this.getUnderlinedFillValue(this.selectedReservation.reservationCode || ''));
      result = result.replace(/\{\{responsibleParty\}\}/g, this.getUnderlinedFillValue(this.getResponsibleParty()));
      result = result.replace(/\{\{responsiblePartyNoun\}\}/g, this.getUnderlinedFillValue(this.getResponsibleNoun()));
      result = result.replace(/\{\{responsiblePartyAddress1\}\}/g, this.getUnderlinedFillValue(this.getResponsiblePartyAddress1()));
      result = result.replace(/\{\{responsiblePartyAddress1\}\}/g, this.getUnderlinedFillValue(this.getResponsiblePartyAddress2()));
      result = result.replace(/\{\{responsiblePartyPhone\}\}/g, this.getUnderlinedFillValue(this.getResponsiblePartyPhone()));
      result = result.replace(/\{\{responsiblePartyEmail\}\}/g, this.getUnderlinedFillValue(this.getResponsiblePartyEmail()));
      result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, this.getResponsiblePartiesBlock());

      result = result.replace(/\{\{tenantName\}\}/g, this.getUnderlinedFillValue(this.selectedReservation.tenantName || ''));
      result = result.replace(/\{\{tenantNamePlain\}\}/g, this.escapeHtml(this.selectedReservation.tenantName || ''));
      result = result.replace(/\{\{tenantState\}\}/g, this.escapeHtml(this.getTenantStateFullName() || ''));
      result = result.replace(/\{\{referenceNo\}\}/g, this.getUnderlinedFillValue(referenceNo || ''));
      result = result.replace(/\{\{arrivalDate\}\}/g, this.getUnderlinedFillValue(this.formatterService.formatDateStringLong(this.selectedReservation.arrivalDate) || ''));
      result = result.replace(/\{\{departureDate\}\}/g, this.getUnderlinedFillValue(this.formatterService.formatDateStringLong(this.selectedReservation.departureDate) || ''));
      result = result.replace(/\{\{numberOfPeople\}\}/g, this.getUnderlinedFillValue((this.selectedReservation.numberOfPeople || 0).toString()));
      result = result.replace(/\{\{billingType\}\}/g, this.getUnderlinedFillValue(this.getBillingTypeText()));
      result = result.replace(/\{\{billingTypeDay\}\}/g, this.getUnderlinedFillValue(this.getBillingDayText()));
      result = result.replace(/\{\{billingTypeLower\}\}/g, this.getUnderlinedFillValue(this.getBillingTypeLowerText()));
      result = result.replace(/\{\{billingRate\}\}/g, this.getUnderlinedFillValue((this.selectedReservation.billingRate || 0).toFixed(2)));
      result = result.replace(/\{\{deposit\}\}/g, this.getUnderlinedFillValue((this.selectedReservation.deposit || 0).toFixed(2)));
      result = result.replace(/\{\{securityText\}\}/g, this.getUnderlinedFillValue(this.getSecurityDepositText()));      
      result = result.replace(/\{\{securityProrateText\}\}/g, this.getUnderlinedFillValue(this.getSecurityProrateText()));
      result = result.replace(/\{\{letterOfResponsibilityText\}\}/g, this.getUnderlinedFillValue(this.getLetterOfResponsibilityText()));
      result = result.replace(/\{\{partialMonthText\}\}/g, this.getUnderlinedFillValue(this.getPartialMonthText()));
      result = result.replace(/\{\{depositLabel\}\}/g, this.getUnderlinedFillValue(this.getDepositLabel()));      
      result = result.replace(/\{\{depositText\}\}/g, this.getUnderlinedFillValue(this.getDepositRequirementText()));
      result = result.replace(/\{\{depositText2\}\}/g, this.getUnderlinedFillValue(this.getDepositRequirementText2()));
      result = result.replace(
        /\{\{reservationDate\}\}/g,
        this.getUnderlinedFillValue(this.formatterService.formatDateStringLong(this.utilityService.todayAsCalendarDateString()) || '')
      );
      result = result.replace(/\{\{checkInTime\}\}/g, this.getUnderlinedFillValue(getCheckInTime(this.selectedReservation.checkInTimeId) || ''));
      result = result.replace(/\{\{checkOutTime\}\}/g, this.getUnderlinedFillValue(getCheckOutTime(this.selectedReservation.checkOutTimeId) || ''));
      result = result.replace(/\{\{reservationNotice\}\}/g, this.getUnderlinedFillValue(this.getReservationNoticeText()));
      result = result.replace(/\{\{reservationNoticeDay\}\}/g, this.getUnderlinedFillValue(this.getReservationDayNotice()));
      result = result.replace(/\{\{departureFee\}\}/g, this.getUnderlinedFillValue((this.selectedReservation.departureFee || 0).toFixed(2)));
      result = result.replace(/\{\{tenantPets\}\}/g, this.getUnderlinedFillValue(this.getPetText()));
      result = result.replace(/\{\{extensionsPossible\}\}/g, this.getUnderlinedFillValue(this.getExtensionsPossible()));
    }

    // Replace property placeholders
    if (this.property) {
      result = result.replace(/\{\{complex\}\}/g, this.getUnderlinedFillValue(this.getComplex()));
      result = result.replace(/\{\{propertyCode\}\}/g, this.getUnderlinedFillValue(this.property.propertyCode || ''));
      result = result.replace(/\{\{communityAddress\}\}/g, this.getUnderlinedFillValue(this.getCommunityAddress() || ''));
      result = result.replace(/\{\{apartmentAddress\}\}/g, this.getUnderlinedFillValue(this.getApartmentAddress() || ''));
      result = result.replace(/\{\{noticeToVacatePropertyAddress\}\}/g, this.getNoticeToVacatePropertyAddress());
      result = result.replace(/\{\{creditAuthorizationPropertyAddress\}\}/g, this.getCreditAuthorizationPropertyAddress());
      result = result.replace(/\{\{propertyPhone\}\}/g, this.getUnderlinedFillValue(this.formatterService.phoneNumber(this.property.phone) || 'N/A'));
      result = result.replace(/\{\{propertyAddress1\}\}/g, this.getUnderlinedFillValue(this.property.address1 || ''));
      result = result.replace(/\{\{propertyCity\}\}/g, this.getUnderlinedFillValue(this.property.city || ''));
      result = result.replace(/\{\{propertyState\}\}/g, this.getUnderlinedFillValue(this.property.state || ''));
      result = result.replace(/\{\{propertyZip\}\}/g, this.getUnderlinedFillValue(this.property.zip || ''));
      result = result.replace(/\{\{propertyBedrooms\}\}/g, this.getUnderlinedFillValue((this.property.bedrooms || 0).toString()));
      result = result.replace(/\{\{propertyBathrooms\}\}/g, this.getUnderlinedFillValue((this.property.bathrooms || 0).toString()));
      result = result.replace(/\{\{propertyFixedExp\}\}/g, this.getUnderlinedFillValue((this.selectedReservation?.departureFee || 0).toFixed(2)));
      result = result.replace(/\{\{propertyParking\}\}/g, this.getUnderlinedFillValue(this.property.parkingNotes || ''));
    }

    if (this.selectedOffice) {
      result = result.replace(/\{\{officeDescription\}\}/g, this.getUnderlinedFillValue(this.selectedOffice.name || ''));
      result = result.replace(/\{\{officePhone\}\}/g, this.getUnderlinedFillValue(this.formatterService.phoneNumber(this.selectedOffice.phone) || 'N/A'));
      result = result.replace(/\{\{officeFax\}\}/g, this.getUnderlinedFillValue(this.formatterService.phoneNumber(this.selectedOffice.fax) || 'N/A'));
      result = result.replace(/\{\{utilityPenaltyFee\}\}/g, this.getUnderlinedFillValue(this.getDefaultUtilityFeeText()));
      result = result.replace(/\{\{maidServicePenaltyFee\}\}/g, this.getUnderlinedFillValue(this.getDefaultMaidServiceFeeText()));
      result = result.replace(/\{\{defaultKeyFee\}\}/g, this.getUnderlinedFillValue('$' + this.selectedOffice.defaultKeyFee.toFixed(2)));
      result = result.replace(/\{\{undisclosedPetFee\}\}/g, this.getUnderlinedFillValue('$' + this.selectedOffice.undisclosedPetFee.toFixed(2)));
      result = result.replace(/\{\{minimumSmokingFee\}\}/g, this.getUnderlinedFillValue('$' + this.selectedOffice.minimumSmokingFee.toFixed(2)));
      result = result.replace(/\{\{parkingPenaltyLow\}\}/g, this.getUnderlinedFillValue('$' + this.selectedOffice.parkingLowEnd.toFixed(2)));
      result = result.replace(/\{\{parkingPenaltyHigh\}\}/g, this.getUnderlinedFillValue('$' + this.selectedOffice.parkingHighEnd.toFixed(2)));
      result = result.replace(/\{\{maintenanceEmail\}\}/g, this.getUnderlinedFillValue(this.selectedOffice.maintenanceEmail || ''));
      const afterHoursPhonePlain = this.escapeHtml(this.formatterService.phoneNumber(this.selectedOffice.afterHoursPhone) || '');
      result = result.replace(/\{\{afterHoursPhone\}\}/g, afterHoursPhonePlain);
      const afterHoursInstructionsPlain = this.escapeHtml(this.selectedOffice.afterHoursInstructions || '');
      result = result.replace(/\{\{afterHoursInstructions\}\}/g, afterHoursInstructionsPlain);
      result = result.replace(/\{\{daysToRefundDeposit\}\}/g, this.getUnderlinedFillValue(this.selectedOffice.daysToRefundDeposit.toString() || '0'));
   
      // Get office logo - construct dataUrl if needed
      let officeLogoDataUrl = this.selectedOffice?.fileDetails?.dataUrl;
      if (!officeLogoDataUrl && this.selectedOffice?.fileDetails?.file) {
        const fileDetails = this.selectedOffice.fileDetails;
        const contentType = fileDetails.contentType || 'image/png';
        // Check if file already includes data URL prefix
        if (fileDetails.file.startsWith('data:')) {
          officeLogoDataUrl = fileDetails.file;
        } else {
          // Construct dataUrl from base64 string
          officeLogoDataUrl = `data:${contentType};base64,${fileDetails.file}`;
        }
      }
      
      // Fallback to organization logo if office logo is not available
      if (!officeLogoDataUrl && this.organization?.fileDetails?.dataUrl) {
        officeLogoDataUrl = this.organization.fileDetails.dataUrl;
      }
      
      if (officeLogoDataUrl) {
        result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoDataUrl);
      }
    }

    // Replace organization placeholders
    if (this.organization) {
      result = result.replace(/\{\{organization-office\}\}/g, this.getUnderlinedFillValue(this.getOrganizationName()));
      result = result.replace(/\{\{organization-office-caps\}\}/g, this.getUnderlinedFillValue(this.getOrganizationNameUpper()));
      result = result.replace(/\{\{organizationPhone\}\}/g, this.getUnderlinedFillValue(this.formatterService.phoneNumber(this.organization.phone) || ''));
      result = result.replace(/\{\{organizationAddress\}\}/g, this.getUnderlinedFillValue(this.getOrganizationAddress()));
      result = result.replace(/\{\{organizationWebsiteDisplay\}\}/g, this.getUnderlinedFillValue(this.getOrganizationWebsite()));
      result = result.replace(/\{\{organizationWebsite\}\}/g, this.getOrganizationWebsite());
      result = result.replace(/\{\{organizationHref\}\}/g, this.getWebsiteWithProtocol());

      const orgLogoDataUrl = this.organization?.fileDetails?.dataUrl;
      if (orgLogoDataUrl) {
        result = result.replace(/\{\{orgLogoBase64\}\}/g, orgLogoDataUrl);
      }
    }

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }
  //#endregion

  //#region Html Processing
  generatePreviewIframe(): void {
    const formReservationId = this.form.get('selectedReservationId')?.value;
    const shouldMerge = !!formReservationId;

    this.syncIncludeFlagsFromForm();

    if (this.shouldBypassStoredDraft()) {
      this.clearStoredLeaseDraft();
    }

    if (shouldMerge) {
      this.syncSelectedOfficeFromContext();
    }

    if (shouldMerge && !this.selectedReservation) {
      const pendingReservationId = this.form.get('selectedReservationId')?.value || this.reservationId;
      if (pendingReservationId && pendingReservationId !== 'new') {
        return;
      }
    }

    if (shouldMerge && !this.selectedOffice) {
      if (this.officeId != null && this.offices.length === 0) {
        return;
      }
      if (!this.syncSelectedOfficeFromContext()) {
        return;
      }
    }

    const renderFromHtmlFiles = (htmlFiles: {
      lease: string;
      letterOfResponsibility: string;
      noticeToVacate: string;
      creditAuthorization: string;
      creditApplication: string;
      rentalCreditApplication: string;
    }) => {
      this.cachedPropertyHtmlFiles = htmlFiles;
      const selectedDocuments = this.collectSelectedDocumentsInListOrder(htmlFiles);
      const selectionKey = this.getDocumentSelectionKey();

      if (selectedDocuments.length === 0) {
        this.clearLeasePreviewDisplay();
        return;
      }

      try {
        const combinedHtml = this.buildCombinedPreviewHtml(selectedDocuments, shouldMerge);
        this.baseTemplateHtml = combinedHtml;
        const canUseDraft = !this.shouldBypassStoredDraft() && this.lastDocumentSelectionKey === selectionKey;
        const draftHtml = canUseDraft ? this.loadStoredLeaseDraft() : null;
        this.lastDocumentSelectionKey = selectionKey;
        this.renderLeasePreviewHtml(draftHtml || this.baseTemplateHtml);
      } catch (error) {
        console.error('[LeasePreview] processing error', error);
        this.clearLeasePreviewDisplay();
      }
    };

    if (this.cachedPropertyHtmlFiles) {
      renderFromHtmlFiles(this.cachedPropertyHtmlFiles);
      return;
    }

    this.loadHtmlFiles().pipe(take(1)).subscribe({
      next: (htmlFiles) => renderFromHtmlFiles(htmlFiles),
      error: (error) => {
        console.error('[LeasePreview] loadHtmlFiles:error', error);
        this.clearLeasePreviewDisplay();
      }
    });
  }

  invalidateCachedPropertyHtmlFiles(): void {
    this.cachedPropertyHtmlFiles = null;
  }

  /** Keep component include flags aligned with checkbox form controls. */
  syncIncludeFlagsFromForm(): void {
    this.includeLease = !!this.form.get('includeLease')?.value;
    this.includeLetterOfResponsibility = !!this.form.get('includeLetterOfResponsibility')?.value;
    this.includeNoticeToVacate = !!this.form.get('includeNoticeToVacate')?.value;
    this.includeCreditCardAuthorization = !!this.form.get('includeCreditCardAuthorization')?.value;
    this.includeBusinessCreditApplication = !!this.form.get('includeBusinessCreditApplication')?.value;
    this.includeRentalCreditApplication = !!this.form.get('includeRentalCreditApplication')?.value;
  }

  /** Checked forms only, always in the same order as the Include list in the template. */
  collectSelectedDocumentsInListOrder(htmlFiles: {
    lease: string;
    letterOfResponsibility: string;
    noticeToVacate: string;
    creditAuthorization: string;
    creditApplication: string;
    rentalCreditApplication: string;
  }): string[] {
    const documents: string[] = [];
    const add = (controlName: string, html: string | undefined) => {
      if (!!this.form.get(controlName)?.value && html?.trim()) {
        documents.push(html);
      }
    };

    add('includeLease', htmlFiles.lease);
    add('includeLetterOfResponsibility', htmlFiles.letterOfResponsibility);
    add('includeNoticeToVacate', htmlFiles.noticeToVacate);
    add('includeCreditCardAuthorization', htmlFiles.creditAuthorization);
    if (this.isCompanyRental) {
      add('includeBusinessCreditApplication', htmlFiles.creditApplication);
    } else {
      add('includeRentalCreditApplication', htmlFiles.rentalCreditApplication);
    }

    return documents;
  }

  buildCombinedPreviewHtml(selectedDocuments: string[], shouldMerge: boolean): string {
    const processDocument = (html: string) => (shouldMerge ? this.replacePlaceholders(html) : html);

    if (selectedDocuments.length === 1) {
      return processDocument(selectedDocuments[0]);
    }

    let combinedHtml = processDocument(selectedDocuments[0]);
    const allExtractedStyles: string[] = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match: RegExpExecArray | null;

    const extractStyles = (html: string) => {
      styleRegex.lastIndex = 0;
      while ((match = styleRegex.exec(html)) !== null) {
        if (match[1]) {
          let styleContent = match[1].trim();
          styleContent = styleContent.replace(/color:\s*#ccc\s*;/gi, 'color: #000 !important;');
          styleContent = styleContent.replace(/color:\s*#999\s*;/gi, 'color: #000 !important;');
          allExtractedStyles.push(styleContent);
        }
      }
    };

    extractStyles(combinedHtml);

    for (let i = 1; i < selectedDocuments.length; i++) {
      const processed = processDocument(selectedDocuments[i]);
      extractStyles(processed);
      combinedHtml += this.stripAndReplace(processed);
    }

    combinedHtml = combinedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    if (allExtractedStyles.length > 0) {
      const combinedStyles = allExtractedStyles.join('\n\n');
      if (combinedHtml.includes('<head>')) {
        combinedHtml = combinedHtml.replace(/<head[^>]*>/i, `$&<style>${combinedStyles}</style>`);
      } else if (combinedHtml.includes('<body>')) {
        combinedHtml = combinedHtml.replace(/<body[^>]*>/i, `<head><style>${combinedStyles}</style></head>$&`);
      } else {
        combinedHtml = `<head><style>${combinedStyles}</style></head>${combinedHtml}`;
      }
    }

    return combinedHtml;
  }

  clearLeasePreviewDisplay(): void {
    this.lastDocumentSelectionKey = this.getDocumentSelectionKey();
    this.baseTemplateHtml = '';
    this.editableHtml = null;
    const emptyPreviewHtml = this.documentHtmlService.buildHtmlDocument('', '', '');
    this.renderLeasePreviewHtml(emptyPreviewHtml);
  }

  stripAndReplace(html: string): string {
    return this.documentHtmlService.stripAndReplace(html);
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    const leaseLogoStyles = `
      #header {
        background-color: #ffffff !important;
      }
      #header .logo-row,
      #header .logo-row td {
        background-color: #ffffff !important;
        padding-bottom: 1px !important;
      }
      #header .title-row,
      #header .title-row td,
      #header h1 {
        background-color: #222222 !important;
        color: #ffffff !important;
      }
      #header td {
        text-align: left !important;
      }
      #header img,
      #header img.logo,
      img.logo {
        width: 25% !important;
        max-width: 25% !important;
        height: auto !important;
        margin: 0 !important;
        display: block !important;
        float: none !important;
      }
    `;
    this.previewIframeStyles = `${result.extractedStyles}\n${leaseLogoStyles}`;
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles);
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(previewHtmlWithStyles);
    this.resolvePreviewLoad();
    this.iframeKey++; // Force iframe refresh
  }

  setEditorHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html || '', true);
    this.editorStyles = result.extractedStyles || '';
    const editableHtmlDocument = this.documentHtmlService.buildHtmlDocument(
      this.documentHtmlService.extractBodyContent(result.processedHtml || ''),
      '',
      this.editorStyles || ''
    );
    this.editableHtml = this.sanitizer.bypassSecurityTrustHtml(editableHtmlDocument);
    setTimeout(() => this.ensureEditorControlsInteractive());
    if (this.pendingOpenInViewMode && this.openInViewOnTabSelect) {
      setTimeout(() => this.switchToViewModeFromTabSelection());
    }
  }

  ensureEditorControlsInteractive(): void {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return;
    }
    editHost.setAttribute('contenteditable', 'false');
    const staticEditableNodes = Array.from(editHost.querySelectorAll('[contenteditable]')) as HTMLElement[];
    staticEditableNodes.forEach(node => {
      const tagName = node.tagName.toLowerCase();
      if (tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select' && tagName !== 'option') {
        node.setAttribute('contenteditable', 'false');
      }
    });
    const controls = Array.from(editHost.querySelectorAll('input, textarea, select, option, button, label'));
    controls.forEach(control => {
      control.setAttribute('contenteditable', 'false');
    });
    const formControls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    formControls.forEach(control => {
      if (control.hasAttribute('disabled')) {
        control.removeAttribute('disabled');
      }
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.readOnly = false;
        if (control.hasAttribute('readonly')) {
          control.removeAttribute('readonly');
        }
      }
      if (control instanceof HTMLInputElement && (control.type === 'checkbox' || control.type === 'radio')) {
        control.style.appearance = 'none';
        (control.style as any).webkitAppearance = 'none';
        control.style.display = 'none';
        control.style.position = 'absolute';
        control.style.opacity = '0';
        control.style.pointerEvents = 'none';
        control.style.width = '0';
        control.style.height = '0';
        control.style.margin = '0';
        control.style.padding = '0';
        control.style.border = '0';
        control.style.background = 'transparent';
        control.style.verticalAlign = 'middle';
      }
    });

    this.ensureChoiceMarkers(editHost);
  }

  ensureChoiceMarkers(editHost: HTMLElement): void {
    const choiceInputs = Array.from(editHost.querySelectorAll('input[type="checkbox"], input[type="radio"]')) as HTMLInputElement[];
    choiceInputs.forEach((input, index) => {
      const existingInputId = String(input.getAttribute('data-choice-input-id') || '').trim();
      const inputId = existingInputId || `lease-choice-${index}`;
      input.setAttribute('data-choice-input-id', inputId);
      input.setAttribute('contenteditable', 'false');
      input.setAttribute('hidden', 'hidden');
      input.setAttribute('aria-hidden', 'true');

      let marker = editHost.querySelector(`span[data-choice-for="${inputId}"]`) as HTMLElement | null;
      if (!marker) {
        marker = editHost.ownerDocument.createElement('span');
        marker.setAttribute('data-choice-marker', 'true');
        marker.setAttribute('data-choice-for', inputId);
        marker.setAttribute('contenteditable', 'false');
        marker.className = 'dynamic-form-choice-marker';
        input.insertAdjacentElement('afterend', marker);
      }

      this.syncChoiceMarker(input, marker);
      if (input.getAttribute('data-choice-wired') === 'true') {
        return;
      }
      input.setAttribute('data-choice-wired', 'true');
      const toggleChoice = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        const inputType = String(input.type || '').toLowerCase();
        if (inputType === 'checkbox') {
          input.checked = !input.checked;
          if (input.checked) {
            input.setAttribute('checked', 'checked');
          } else {
            input.removeAttribute('checked');
          }
          this.syncChoiceMarker(input, marker as HTMLElement);
          return;
        }

        const groupName = String(input.name || '').trim();
        if (!groupName) {
          input.checked = true;
          input.setAttribute('checked', 'checked');
          this.syncChoiceMarker(input, marker as HTMLElement);
          return;
        }
        const radios = Array.from(editHost.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
        radios.filter(radio => String(radio.name || '') === groupName).forEach(radio => {
          radio.checked = radio === input;
          if (radio.checked) {
            radio.setAttribute('checked', 'checked');
          } else {
            radio.removeAttribute('checked');
          }
          const radioId = String(radio.getAttribute('data-choice-input-id') || '').trim();
          if (!radioId) {
            return;
          }
          const radioMarker = editHost.querySelector(`span[data-choice-for="${radioId}"]`) as HTMLElement | null;
          if (radioMarker) {
            this.syncChoiceMarker(radio, radioMarker);
          }
        });
      };
      input.addEventListener('click', toggleChoice);
      input.addEventListener('change', () => this.syncChoiceMarker(input, marker as HTMLElement));
      marker.setAttribute('data-choice-wired', 'true');
      marker.addEventListener('click', toggleChoice);
    });
  }

  syncChoiceMarker(input: HTMLInputElement, marker: HTMLElement): void {
    const inputType = String(input.type || '').toLowerCase();
    if (inputType === 'radio') {
      marker.textContent = input.checked ? '◉' : '○';
    } else {
      marker.textContent = input.checked ? '☒' : '☐';
    }
    marker.style.cursor = 'pointer';
    marker.style.userSelect = 'none';
    marker.style.display = 'inline-block';
    marker.style.width = '18px';
    marker.style.height = '18px';
    marker.style.position = 'relative';
    marker.style.left = '0';
    marker.style.margin = '0 6px 0 0';
    marker.style.top = '0';
    marker.style.pointerEvents = 'auto';
    marker.style.fontSize = '16px';
    marker.style.textAlign = 'center';
    marker.style.color = '#000';
    marker.style.fontWeight = '700';
    marker.style.lineHeight = '18px';
    marker.style.verticalAlign = 'middle';
  }

  captureLiveHtmlSnapshot(): string {
    const editDoc = this.editIframe?.nativeElement?.contentDocument || this.editIframe?.nativeElement?.contentWindow?.document;
    const editHost = editDoc?.body;
    if (!editDoc || !editHost) {
      return '';
    }
    const controls = Array.from(editHost.querySelectorAll('input, textarea, select')) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
    controls.forEach((control, index) => {
      control.setAttribute('data-lease-control-id', String(index));
    });

    const clonedRoot = editHost.cloneNode(true) as HTMLElement;
    controls.forEach(sourceControl => {
      const controlId = sourceControl.getAttribute('data-lease-control-id');
      if (!controlId) {
        return;
      }
      const clonedControl = clonedRoot.querySelector(`[data-lease-control-id="${controlId}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (!clonedControl) {
        return;
      }
      const sourceTag = sourceControl.tagName.toLowerCase();
      const clonedTag = clonedControl.tagName.toLowerCase();

      if (sourceTag === 'input' && clonedTag === 'input') {
        const sourceInput = sourceControl as HTMLInputElement;
        const cloneInput = clonedControl as HTMLInputElement;
        const inputType = String(sourceInput.type || '').toLowerCase();
        if (inputType === 'checkbox' || inputType === 'radio') {
          cloneInput.checked = sourceInput.checked;
          cloneInput.defaultChecked = sourceInput.checked;
          if (sourceInput.checked) {
            cloneInput.setAttribute('checked', 'checked');
          } else {
            cloneInput.removeAttribute('checked');
          }
        } else {
          cloneInput.value = sourceInput.value || '';
          cloneInput.defaultValue = sourceInput.value || '';
          cloneInput.setAttribute('value', sourceInput.value || '');
        }
      } else if (sourceTag === 'textarea' && clonedTag === 'textarea') {
        const sourceTextarea = sourceControl as HTMLTextAreaElement;
        const clonedTextarea = clonedControl as HTMLTextAreaElement;
        clonedTextarea.value = sourceTextarea.value || '';
        clonedTextarea.defaultValue = sourceTextarea.value || '';
        clonedTextarea.textContent = sourceTextarea.value || '';
      } else if (sourceTag === 'select' && clonedTag === 'select') {
        const sourceSelect = sourceControl as HTMLSelectElement;
        const clonedSelect = clonedControl as HTMLSelectElement;
        clonedSelect.selectedIndex = sourceSelect.selectedIndex;
        Array.from(sourceSelect.options).forEach((sourceOption, optionIndex) => {
          const clonedOption = clonedSelect.options[optionIndex];
          if (!clonedOption) {
            return;
          }
          clonedOption.selected = sourceOption.selected;
          clonedOption.defaultSelected = sourceOption.selected;
          if (sourceOption.selected) {
            clonedOption.setAttribute('selected', 'selected');
          } else {
            clonedOption.removeAttribute('selected');
          }
        });
      }
    });

    controls.forEach(control => control.removeAttribute('data-lease-control-id'));
    Array.from(clonedRoot.querySelectorAll('[data-lease-control-id]')).forEach(control => control.removeAttribute('data-lease-control-id'));
    Array.from(clonedRoot.querySelectorAll('[data-choice-marker="true"]')).forEach(marker => marker.remove());
    const clonedChoiceInputs = Array.from(clonedRoot.querySelectorAll('input[data-choice-input-id]')) as HTMLInputElement[];
    clonedChoiceInputs.forEach(input => {
      input.removeAttribute('data-choice-input-id');
      input.removeAttribute('data-choice-wired');
      input.removeAttribute('hidden');
      input.removeAttribute('aria-hidden');
      input.style.removeProperty('display');
      input.style.removeProperty('position');
      input.style.removeProperty('opacity');
      input.style.removeProperty('pointer-events');
      input.style.removeProperty('width');
      input.style.removeProperty('height');
      input.style.removeProperty('margin');
      input.style.removeProperty('padding');
      input.style.removeProperty('border');
      input.style.removeProperty('background');
      input.style.removeProperty('vertical-align');
      input.style.removeProperty('appearance');
      (input.style as any).webkitAppearance = '';
    });
    const bodyContent = clonedRoot.innerHTML;
    return this.documentHtmlService.buildHtmlDocument(bodyContent, '', this.editorStyles || '');
  }

   resolvePreviewLoad(): void {
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
  }

  loadHtmlFiles(): Observable<{ lease: string; letterOfResponsibility: string; noticeToVacate: string; creditAuthorization: string; creditApplication: string; rentalCreditApplication: string }> {
    if (this.debuggingHtml) {
      return forkJoin({
        lease: this.http.get('assets/reservation-lease.html', { responseType: 'text' }),
        letterOfResponsibility: this.http.get('assets/letter-of-responsibility.html', { responseType: 'text' }),
        noticeToVacate: this.http.get('assets/notice-to-vacate.html', { responseType: 'text' }),
        creditAuthorization: this.http.get('assets/credit-authorization.html', { responseType: 'text' }),
        creditApplication: this.http.get('assets/credit-application-business.html', { responseType: 'text' }),
        rentalCreditApplication: this.http.get('assets/credit-application-individual.html', { responseType: 'text' })
      });
    }

    return of({
      lease: this.propertyHtml?.lease || '',
      letterOfResponsibility: this.propertyHtml?.letterOfResponsibility || '',
      noticeToVacate: this.propertyHtml?.noticeToVacate || '',
      creditAuthorization: this.propertyHtml?.creditAuthorization || '',
      creditApplication: this.propertyHtml?.creditApplicationBusiness || '',
      rentalCreditApplication: this.propertyHtml?.creditApplicationIndividual || ''
    });
  }  
  //#endregion 

  //#region Abstract BaseDocumentComponent
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organization?.organizationId || null,
      selectedOfficeId: this.selectedOffice?.officeId || null,
      selectedOfficeName: this.selectedOffice?.name || '',
      selectedReservationId: this.selectedReservation?.reservationId || null,
      propertyId: this.propertyId || null,
      contacts: this.contacts.length > 0 ? this.contacts : (this.contact ? [this.contact] : []),
      isDownloading: this.isDownloading,
      printStyleOptions: { fontSize: '10pt', includeLeaseStyles: true }
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override async onDownload(): Promise<void> {
    const fileName = this.utilityService.generateDocumentFileName(
      'lease',
      this.property.propertyCode,
      this.utilityService.getReservationDropdownLabel(
        this.selectedReservation,
        this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(this.selectedReservation)) ?? null
      ).trim() || undefined
    );
    const downloadConfig: DownloadConfig = {
      fileName: fileName,
      documentType: DocumentType.ReservationLease,
      noPreviewMessage: 'Please select an office and reservation to generate the lease',
      noSelectionMessage: 'Organization or Office not available'
    };

    await super.onDownload(downloadConfig);
  }

  override onPrint(): void {
    super.onPrint('Please select an office and reservation to generate the lease');
  }

  override async onEmail(): Promise<void> {
    const toEmail = this.contact?.email || '';
    const toName = this.contact?.fullName || `${this.contact?.firstName || ''} ${this.contact?.lastName || ''}`.trim();
    const salutationName = `${this.contact?.firstName|| ''}`.trim();
    const tenantName = `${this.selectedReservation?.tenantName || ''}`.trim();
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const companyName = this.organization?.name;
    const companyPhone = this.formatterService.phoneNumber(this.organization?.phone) || '';
    const plainTextContent = '';
    const attachmentFileName = this.utilityService.generateDocumentFileName(
      'lease',
      this.property.propertyCode,
      this.utilityService.getReservationDropdownLabel(
        this.selectedReservation,
        this.contacts.find(c => c.contactId === this.getPrimaryReservationContactId(this.selectedReservation)) ?? null
      ).trim() || undefined
    );
    const reservationCode = this.selectedReservation?.reservationCode;
    const emailTemplateHtml = (this.contact?.entityTypeId === EntityType.Company) ? (this.emailHtml?.corporateLease || '') : (this.emailHtml?.lease || '');

    const emailSubject = this.emailHtml?.leaseSubject?.trim()
       .replace(/\{\{reservationCode\}\}/g, reservationCode || '');
    const emailBodyHtml = emailTemplateHtml
      .replace(/\{\{salutationName\}\}/g, salutationName)
      .replace(/\{\{tenantName\}\}/g, tenantName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{fromEmail\}\}/g, fromEmail)
      .replace(/\{\{companyName\}\}/g, companyName || '')
      .replace(/\{\{companyPhone\}\}/g, companyPhone || '');

    const emailConfig: EmailConfig = {
      subject: emailSubject,
      toEmail,
      toName,
      fromEmail,
      fromName,
      documentType: DocumentType.ReservationLease,
      emailType: EmailType.ReservationLease,
      plainTextContent,
      htmlContent: emailBodyHtml,
      fileDetails: {
        fileName: attachmentFileName,
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

