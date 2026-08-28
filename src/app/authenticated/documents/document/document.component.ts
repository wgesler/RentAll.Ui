import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { UtilityService } from '../../../services/utility.service';
import { hasInspectorRole } from '../../shared/access/role-access';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { FileDetails } from '../../../shared/models/fileDetails';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyCodeResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DocumentType, getDocumentTypes } from '../models/document.enum';
import { DocumentRequest, DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';

@Component({
    standalone: true,
    selector: 'app-document',
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule,
        ReactiveFormsModule,
        TitleBarSelectComponent
    ],
    templateUrl: './document.component.html',
    styleUrls: ['./document.component.scss']
})
export class DocumentComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  documentService = inject(DocumentService);
  router = inject(Router);
  fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);
  private officeService = inject(OfficeService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private utilityService = inject(UtilityService);
  private pdfThumbnailService = inject(PdfThumbnailService);

  isServiceError: boolean = false;
  documentId: string;
  document: DocumentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  saveAttempted: boolean = false;
  selectedFile: File | null = null;
  filePreview: string | null = null;
  pdfThumbnailUrl: string | null = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  offices: OfficeResponse[] = [];
  properties: PropertyCodeResponse[] = [];
  reservations: ReservationCodeResponse[] = [];
  organizationId: string = '';

  documentTypes: { value: DocumentType, label: string }[] = getDocumentTypes();

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isPageReady = false;
  destroy$ = new Subject<void>();

  //#region Documents
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';

    this.loadOffices();
    this.loadPropertyCodes();
    this.loadReservationCodes();

    this.route.paramMap.pipe(take(1)).subscribe(params => {
      const id = params.get('id');
      this.isAddMode = id === 'new';
      if (this.isAddMode) {
        this.buildForm();
        return;
      }

      if (!id) {
        return;
      }

      this.documentId = id;
      const currentSet = this.itemsToLoad$.value;
      const newSet = new Set(currentSet);
      newSet.add('document');
      this.itemsToLoad$.next(newSet);
      this.loadDocument();
    });
  }

  loadDocument(): void {
    this.documentService.getDocumentByGuid(this.documentId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'document'); })).subscribe({
      next: (document) => {
        this.document = document;
        this.buildForm();
        this.populateForm(document);
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  saveDocument(): void {
    if (!this.form) {
      return;
    }

    this.saveAttempted = true;
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity({ emitEvent: false });

    const rawValue = this.form.getRawValue();
    if (!this.form.valid || rawValue.officeId == null || rawValue.documentType == null || !rawValue.fileName || !rawValue.fileExtension || !rawValue.contentType) {
      this.toastr.error('Please correct the highlighted fields before saving.', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const documentTypeId = Number(rawValue.documentType);
    const documentRequest: DocumentRequest = {
      documentId: this.isAddMode ? undefined : rawValue.documentId,
      organizationId: rawValue.organizationId,
      officeId: rawValue.officeId,
      propertyId: rawValue.propertyId || null,
      reservationId: rawValue.reservationId || null,
      documentTypeId: documentTypeId,
      fileName: rawValue.fileName,
      fileExtension: rawValue.fileExtension,
      contentType: rawValue.contentType,
      documentPath: '',
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      isDeleted: rawValue.isDeleted
    };

    const saveOperation = this.isAddMode
      ? this.documentService.createDocument(documentRequest)
      : this.documentService.updateDocument(documentRequest);

    saveOperation.pipe(
      take(1),
      finalize(() => { this.isSubmitting = false })
    ).subscribe({
      next: (response) => {
        this.toastr.success(
          `Document ${this.isAddMode ? 'created' : 'updated'} successfully`,
          CommonMessage.Success
        );
        this.back();
      },
      error: () => {}
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      return;
    }

    this.selectedFile = file;
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop() || '';
    const contentType = file.type || this.utilityService.getContentTypeFromPath(file.name) || '';
    this.form.patchValue({
      fileName: fileName.replace('.' + fileExtension, ''),
      fileExtension: fileExtension,
      contentType: contentType
    });
    this.hasNewFileUpload = true;

    try {
      const payload = await this.utilityService.buildUploadPayloadFromFile(file, contentType || 'application/octet-stream');
      this.fileDetails = payload.fileDetails;
      this.filePreview = payload.fileDetails.contentType?.startsWith('image/') ? payload.fileDetails.dataUrl : null;
      this.setPdfThumbnail(payload.fileDetails.dataUrl, payload.fileDetails.contentType || contentType);
    } catch {
      this.fileDetails = null;
      this.filePreview = null;
      this.pdfThumbnailUrl = null;
      this.hasNewFileUpload = false;
    }

    const inputElement = event.target as HTMLInputElement | null;
    if (inputElement) {
      inputElement.value = '';
    }
    this.markViewForCheck();
  }

  removeFile(): void {
    this.selectedFile = null;
    this.filePreview = null;
    this.pdfThumbnailUrl = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false;
    
    // Clear file-related form fields
    this.form.patchValue({
      fileName: '',
      fileExtension: '',
      contentType: ''
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.applySingleOfficeDefault();
        this.markViewForCheck();
      });
    });
  }

  loadPropertyCodes(): void {
    this.propertyService.ensurePropertyCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.propertyService.getAllPropertyCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: properties => {
            this.properties = properties || [];
            this.markViewForCheck();
          },
          error: () => {
            this.properties = [];
            this.markViewForCheck();
          }
        });
      }
    });
  }

  loadReservationCodes(): void {
    this.reservationService.ensureReservationCodesLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.reservationService.getAllReservationCodes().pipe(takeUntil(this.destroy$)).subscribe({
          next: reservations => {
            this.reservations = reservations || [];
            this.markViewForCheck();
          },
          error: () => {
            this.reservations = [];
            this.markViewForCheck();
          }
        });
      }
    });
  }
  //#endregion

  //#region Build Form
  buildForm(): void {
    this.form = this.fb.group({
      documentId: new FormControl(''),
      organizationId: new FormControl(this.organizationId, [Validators.required]),
      officeId: new FormControl<number | null>(null, [Validators.required]),
      propertyId: new FormControl<string | null>(null),
      reservationId: new FormControl<string | null>(null),
      documentType: new FormControl<DocumentType | null>(null, [Validators.required]),
      fileName: new FormControl({ value: '', disabled: true }, [Validators.required]),
      fileExtension: new FormControl({ value: '', disabled: true }, [Validators.required]),
      contentType: new FormControl({ value: '', disabled: true }, [Validators.required]),
      isDeleted: new FormControl(false)
    });
    if (this.isAddMode) {
      this.applyAddContextFromQuery();
      this.applySingleOfficeDefault();
    }
  }

  populateForm(document: DocumentResponse): void {
    if (!this.form) return;

    // Convert documentTypeId (number) to DocumentType enum for form
    const documentTypeValue = Number(document.documentTypeId) as DocumentType;

    // Load fileDetails from API response if present
    if (document.fileDetails && document.fileDetails.file) {
      // Convert document model FileDetails to shared FileDetails format
      this.fileDetails = {
        fileName: document.fileDetails.fileName || document.fileName || '',
        contentType: document.fileDetails.contentType || document.contentType || '',
        file: document.fileDetails.file,
        dataUrl: document.fileDetails.dataUrl || (document.fileDetails.file
          ? `data:${document.fileDetails.contentType || document.contentType || 'application/pdf'};base64,${document.fileDetails.file}`
          : '')
      };
      this.hasNewFileUpload = false;
      if (document.contentType?.startsWith('image/')) {
        this.filePreview = this.fileDetails.dataUrl || `data:${this.fileDetails.contentType};base64,${this.fileDetails.file}`;
      } else {
        this.filePreview = null;
      }
    } else {
      this.fileDetails = null;
      this.filePreview = null;
      this.pdfThumbnailUrl = null;
    }

    this.form.patchValue({
      documentId: document.documentId,
      organizationId: document.organizationId,
      officeId: document.officeId,
      propertyId: document.propertyId ?? null,
      reservationId: document.reservationId ?? null,
      documentType: documentTypeValue as DocumentType,
      fileName: document.fileName,
      fileExtension: document.fileExtension,
      contentType: document.contentType,
      isDeleted: document.isDeleted
    });
    if (this.fileDetails?.dataUrl) {
      this.setPdfThumbnail(this.fileDetails.dataUrl, this.fileDetails.contentType || document.contentType);
    }
  }

  applyAddContextFromQuery(): void {
    if (!this.form) {
      return;
    }

    const queryParams = this.route.snapshot.queryParams;
    const officeIdRaw = queryParams['officeId'];
    const propertyId = queryParams['propertyId'] || null;
    const reservationId = queryParams['reservationId'] || null;
    let officeId: number | null = null;
    if (officeIdRaw !== null && officeIdRaw !== undefined && officeIdRaw !== '') {
      const parsed = Number(officeIdRaw);
      if (Number.isFinite(parsed)) {
        officeId = parsed;
      }
    }

    this.form.patchValue({
      officeId,
      propertyId,
      reservationId
    });
  }
  //#endregion

  //#region Utility Methods
  get hasUploadedFile(): boolean {
    return !!(this.fileDetails && this.fileDetails.file);
  }

  get isPdfFile(): boolean {
    const contentType = this.fileDetails?.contentType || '';
    const extension = this.form?.getRawValue()?.fileExtension || '';
    return contentType === 'application/pdf' || extension === 'pdf';
  }

  get fileNameDisplay(): string {
    return this.form?.getRawValue()?.fileName || '';
  }

  get fileExtensionDisplay(): string {
    return this.form?.getRawValue()?.fileExtension || '';
  }

  get contentTypeDisplay(): string {
    return this.form?.getRawValue()?.contentType || '';
  }

  setPdfThumbnail(dataUrl: string | null, contentType: string | null): void {
    const extension = (this.form?.getRawValue()?.fileExtension || '').toLowerCase();
    const isPdf = (contentType || '').toLowerCase().includes('pdf') || extension === 'pdf';
    if (!dataUrl || !isPdf) {
      this.pdfThumbnailUrl = null;
      return;
    }
    this.pdfThumbnailUrl = null;
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => {
      this.pdfThumbnailUrl = url;
      this.markViewForCheck();
    });
  }

  get officeOptions(): SearchableSelectOption[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get propertyOptions(): SearchableSelectOption[] {
    const officeId = this.form?.get('officeId')?.value ?? null;
    const filteredProperties = officeId == null
      ? this.properties
      : this.properties.filter(property => property.officeId === officeId);
    return filteredProperties.map(property => ({
      value: property.propertyId,
      label: property.propertyCode
    }));
  }

  get reservationOptions(): SearchableSelectOption[] {
    const officeId = this.form?.get('officeId')?.value ?? null;
    const propertyId = this.form?.get('propertyId')?.value ?? null;
    const officeFilteredReservations = officeId == null
      ? this.reservations
      : this.reservations.filter(reservation => reservation.officeId === officeId);
    const filteredReservations = propertyId == null
      ? officeFilteredReservations
      : officeFilteredReservations.filter(reservation => reservation.propertyId === propertyId);
    return filteredReservations.map(reservation => ({
      value: reservation.reservationId,
      label: this.utilityService.getReservationDropdownLabel(reservation, null)
    }));
  }

  get documentTypeOptions(): SearchableSelectOption[] {
    return this.documentTypes.map(type => ({
      value: type.value,
      label: type.label
    }));
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.form.patchValue({ officeId: Number.isFinite(officeId) ? officeId : null });
    this.clearOutOfScopeSelections();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    const propertyId = value == null || value === '' ? null : String(value);
    this.form.patchValue({ propertyId });
    this.clearOutOfScopeSelections();
  }

  onReservationDropdownChange(value: string | number | null): void {
    const reservationId = value == null || value === '' ? null : String(value);
    const reservation = this.reservations.find(item => item.reservationId === reservationId) || null;
    this.form.patchValue({
      reservationId,
      propertyId: reservation?.propertyId ?? this.form.get('propertyId')?.value ?? null,
      officeId: reservation?.officeId ?? this.form.get('officeId')?.value ?? null
    });
  }

  onDocumentTypeDropdownChange(value: string | number | null): void {
    const documentType = value == null || value === '' ? null : Number(value);
    this.form.patchValue({ documentType });
  }

  applySingleOfficeDefault(): void {
    if (!this.isAddMode || !this.form || this.form.get('officeId')?.value != null || this.offices.length !== 1) {
      return;
    }
    this.form.patchValue({ officeId: this.offices[0].officeId });
  }

  get showOfficeValidationError(): boolean {
    return this.saveAttempted && !!this.form?.get('officeId')?.invalid;
  }

  get showDocumentTypeValidationError(): boolean {
    return this.saveAttempted && !!this.form?.get('documentType')?.invalid;
  }

  clearOutOfScopeSelections(): void {
    const officeId = this.form.get('officeId')?.value ?? null;
    const propertyId = this.form.get('propertyId')?.value ?? null;
    const reservationId = this.form.get('reservationId')?.value ?? null;
    const property = this.properties.find(item => item.propertyId === propertyId);
    if (propertyId && (!property || (officeId != null && property.officeId !== officeId))) {
      this.form.patchValue({ propertyId: null, reservationId: null });
      return;
    }

    const reservation = this.reservations.find(item => item.reservationId === reservationId);
    if (reservationId && (!reservation || (officeId != null && reservation.officeId !== officeId) || (propertyId && reservation.propertyId !== propertyId))) {
      this.form.patchValue({ reservationId: null });
    }
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
   getMaintenanceShellDocumentsTabIndex(): number {
    const isInspector = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    const showWorkOrdersTab = !isInspector;
    return showWorkOrdersTab ? 5 : 4;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  back(): void {
    const queryParams = this.route.snapshot.queryParams;
    const returnTo = queryParams['returnTo'];

    if (returnTo === 'reservationTab') {
      const reservationId = queryParams['reservationId'];
      if (reservationId) {
        const params: string[] = ['tab=documents', `reservationId=${reservationId}`];
        const officeId = queryParams['officeId'];
        if (officeId !== null && officeId !== undefined && officeId !== '') {
          params.push(`officeId=${officeId}`);
        }
        const reservationUrl = `${RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])}?${params.join('&')}`;
        this.router.navigateByUrl(reservationUrl);
        return;
      }
    }

    if (returnTo === 'accountingTab') {
      const params: string[] = ['tab=3'];
      const officeId = queryParams['officeId'];
      const reservationId = queryParams['reservationId'];
      const companyId = queryParams['companyId'];
      if (officeId !== null && officeId !== undefined && officeId !== '') {
        params.push(`officeId=${officeId}`);
      }
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }
      if (companyId) {
        params.push(`companyId=${companyId}`);
      }
      this.router.navigateByUrl(`${RouterUrl.AccountingList}?${params.join('&')}`);
      return;
    }

    if (returnTo === 'propertyTab') {
      this.router.navigateByUrl(RouterUrl.DocumentList);
      return;
    }

    if ((returnTo === 'maintenanceTab' || returnTo === 'maintenance')) {
      const propertyId = queryParams['propertyId'];
      if (propertyId) {
        const params: string[] = [`tab=${this.getMaintenanceShellDocumentsTabIndex()}`];
        const reservationId = queryParams['reservationId'];
        const officeId = queryParams['officeId'];
        if (reservationId) {
          params.push(`reservationId=${reservationId}`);
        }
        if (officeId !== null && officeId !== undefined && officeId !== '') {
          params.push(`officeId=${officeId}`);
        }
        const maintenanceUrl = `${RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId])}?${params.join('&')}`;
        this.router.navigateByUrl(maintenanceUrl);
        return;
      }
    }

    if (returnTo === 'documentList') {
      this.router.navigateByUrl(RouterUrl.DocumentList);
      return;
    }

    this.router.navigateByUrl(RouterUrl.DocumentList);
  }
  //#endregion
}

