import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, Subject, finalize, skip, take, takeUntil} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListDisplay } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationCodeResponse, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { getDocumentTypes } from '../models/document.enum';
import { DocumentGetRequest, DocumentListDisplay, DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';
import { ContactResponse } from "../../contacts/models/contact.model";
import { ContactService } from "../../contacts/services/contact.service";

@Component({
    selector: 'app-document-list',
    standalone: true,
    templateUrl: './document-list.component.html',
    styleUrls: ['./document-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class DocumentListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId?: string;
  @Input() propertyCode: string | null = null;
  @Input() documentTypeId?: number;
  @Input() documentTypeIds?: number[];
  @Input() documentRequest?: DocumentGetRequest | null;
  @Input() hideHeader: boolean = false;
  @Input() hideFilters: boolean = false;
  @Input() source: 'property' | 'reservation' | 'invoice' | 'documents' | 'maintenance' | null = null;
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() companyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() activeOnly: boolean = false;
  @Input() showReservationFilterOnly: boolean = false;
  @Input() reservations: (ReservationListResponse | ReservationCodeResponse)[] = [];
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() companyIdChange = new EventEmitter<string | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  
  isServiceError: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];
  
  showOfficeDropdown: boolean = false;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  officeScopeResolved: boolean = false;

  selectedReservationId: string | null = null;
  availableReservations: { value: ReservationListResponse | ReservationCodeResponse, label: string }[] = [];

  selectedCompany: ContactResponse | null = null;
  companies: ContactResponse[] = [];
  availableCompanies: { value: ContactResponse, label: string }[] = [];

  selectedPropertyId: string | null = null;
  properties: PropertyListDisplay[] = [];
  availableProperties: { value: PropertyListDisplay, label: string }[] = [];
  
  selectedDocumentTypeId: number | null = null;
  documentTypes: { value: number, label: string }[] = [];

  sidebarColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '20ch'},
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'fileName': { displayAs: 'File Name', maxWidth: '60ch'},
    'createdOn': { displayAs: 'Created', maxWidth: '35ch', alignment: 'center' },
  };

  tabColumns: ColumnSet = {
    no: { displayAs: 'No', maxWidth: '5ch', sort: false, wrap: false },
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '20ch'},
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'fileName': { displayAs: 'File Name', maxWidth: '60ch'},
    'createdOn': { displayAs: 'Created', maxWidth: '35ch', alignment: 'center' },
  };
  
  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  destroy$ = new Subject<void>();

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private cdr: ChangeDetectorRef) {
  }

  private markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  //#region Document-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

     this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
      if(this.isInAddReservationMode())
      return;
    
    if (!this.source) {
      this.source = 'documents';
    }
    
    if (this.officeId !== null && this.officeId !== undefined) {
      this.selectedOfficeId = this.officeId;
    }
    
    if (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') {
      this.selectedReservationId = this.reservationId;
    }
    
    this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
    this.utilityService.addLoadItem(this.itemsToLoad$, 'officeScope');
    this.loadOffices();

    if (this.source !== 'documents') {
      this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.offices.length > 0 && (this.officeId === null || this.officeId === undefined)) {
          this.resolveOfficeScope(officeId, true);
        }
        this.markViewForCheck();
      });
    }

    if (this.source === 'reservation' || this.source === 'invoice' || this.source === 'property' || this.source === 'maintenance') {
      if (this.useParentProvidedReservationList) {
        this.filterReservations();
      } else {
        this.loadReservations();
      }
    }

    if (this.source === 'invoice') {
      this.loadCompanies();
    }

    if (this.source === 'documents') {
      this.initializeDocumentTypes();
    }
    
    this.getDocuments();
  }
  
  isInAddReservationMode(): boolean {
    if (this.source === 'reservation' || this.source === 'documents') {
      return false;
    }

    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const hasTypeFilter = this.hasFixedDocumentTypeFilter();
    const isFiltered = hasPropertyId && hasTypeFilter;
    const isUnfiltered = !hasPropertyId && !hasTypeFilter;
    const isTypeOnlyFiltered = !hasPropertyId && hasTypeFilter;
    const isPropertyDocuments = this.source === 'property' && hasPropertyId;
    const isMaintenanceDocuments = this.source === 'maintenance' && hasPropertyId;
    const isInAddReservationMode = !isFiltered && !isUnfiltered && !isTypeOnlyFiltered && !isPropertyDocuments && !isMaintenanceDocuments;
    
    if (isInAddReservationMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
      return true;
    }
    return false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isInAddReservationMode()) {
      return;
    }
    
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.onTitleBarOfficeIdUpdate(newOfficeId);
      }
    }

    if (changes['reservations'] && !changes['reservations'].firstChange) {
      this.onTitleBarReservationsUpdate();
    }

    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      const previousReservationId = changes['reservationId'].previousValue;
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        this.onTitleBarReservationIdUpdate(newReservationId);
      }
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      const previousCompanyId = changes['companyId'].previousValue;
      if (previousCompanyId === undefined || newCompanyId !== previousCompanyId) {
        if (newCompanyId && this.companies.length > 0) {
          this.selectedCompany = this.companies.find(c => c.contactId === newCompanyId &&
            (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)) || null;
        } else {
          this.selectedCompany = null;
        }
        this.filterReservations();
        this.applyFilters();
      }
    }

    if (changes['activeOnly'] && !changes['activeOnly'].firstChange) {
      this.applyFilters();
    }

    if (changes['documentRequest']) {
      const request = changes['documentRequest'].currentValue as DocumentGetRequest | null | undefined;
      if ((this.source === 'invoice' || this.source === 'documents' || this.source === 'maintenance') && request?.startDate && request?.endDate && this.canLoadDocumentsFromApi()) {
        this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
        this.getDocuments();
      }
    }
    
    if (changes['propertyId']) {
      const newPropertyId = changes['propertyId'].currentValue;
      const previousPropertyId = changes['propertyId'].previousValue;

      if (this.source === 'documents') {
        if (!changes['propertyId'].firstChange) {
          this.allDocuments = this.enrichReservationCodes(this.allDocuments);
          this.applyFilters();
        }
      } else if (newPropertyId && (!previousPropertyId || newPropertyId !== previousPropertyId)) {
        if (this.useParentProvidedReservationList) {
          this.filterReservations();
        } else {
          this.loadReservations();
        }
      }
    }
    
    const currentHasPropertyId = this.source !== 'documents' && this.propertyId && this.propertyId !== '';
    const previousHasPropertyId = changes['propertyId']?.previousValue && changes['propertyId'].previousValue !== '';
    const wasFiltered = previousHasPropertyId && this.hadDocumentTypeFilterChange(changes, true);
    const isFiltered = currentHasPropertyId && this.hasFixedDocumentTypeFilter();
    
    const wasTypeOnlyFiltered = !previousHasPropertyId && this.hadDocumentTypeFilterChange(changes, true);
    const isTypeOnlyFiltered = !currentHasPropertyId && this.hasFixedDocumentTypeFilter();
    
    const wasUnfiltered = !previousHasPropertyId && !this.hadDocumentTypeFilterChange(changes, true);
    const isUnfiltered = !currentHasPropertyId && !this.hasFixedDocumentTypeFilter();
    
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const documentTypeFilterChanged = this.hadDocumentTypeFilterChange(changes, false);
    
    const modeChanged = (wasFiltered !== isFiltered) || (wasUnfiltered !== isUnfiltered) || (wasTypeOnlyFiltered !== isTypeOnlyFiltered);
    
    if (this.source !== 'documents' && (propertyIdChanged || documentTypeFilterChanged || modeChanged)) {
      this.allDocuments = [];
      this.documentsDisplay = [];
      
      this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
      this.getDocuments();
    }
  }

  /** Property shell passes a loaded list when non-empty; maintenance shell always passes the list (may be empty). */
   get useParentProvidedReservationList(): boolean {
    const hasPropertyId = !!this.propertyId && this.propertyId !== '';
    if (this.source === 'property' && hasPropertyId) {
      return (this.reservations?.length ?? 0) > 0;
    }
    if (this.source === 'maintenance' && hasPropertyId) {
      return true;
    }
    return false;
  }


  addDocument(): void {
    const queryParams: any = {};
    const reservationIdToUse = this.selectedReservationId || this.reservationId || null;

    if (this.source === 'reservation' && reservationIdToUse) {
      queryParams.returnTo = 'reservationTab';
      queryParams.tab = 'documents';
      queryParams.reservationId = reservationIdToUse;
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      if (this.propertyId) {
        queryParams.propertyId = this.propertyId;
      }
    } else if (this.source === 'property' && this.propertyId) {
      queryParams.returnTo = 'propertyTab';
      queryParams.tab = 'documents';
      queryParams.propertyId = this.propertyId;
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'maintenance' && this.propertyId) {
      queryParams.returnTo = 'maintenanceTab';
      queryParams.propertyId = this.propertyId;
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'invoice') {
      queryParams.returnTo = 'accountingTab';
      queryParams.tab = '3';
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedCompany?.contactId) {
        queryParams.companyId = this.selectedCompany.contactId;
      } else if (this.companyId) {
        queryParams.companyId = this.companyId;
      }
    } else if (this.source === 'documents') {
      queryParams.returnTo = 'documentList';
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      const propertyFilterId = this.propertyId || this.selectedPropertyId;
      if (propertyFilterId) {
        queryParams.propertyId = propertyFilterId;
      }
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.Document, ['new'])],
      { queryParams }
    );
  }

  reload(): void {
    this.getDocuments();
  }

  getDocuments(): void {
    if (this.isInAddReservationMode()) {
      this.allDocuments = [];
      this.documentsDisplay = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
      return;
    }

    if (!this.canLoadDocumentsFromApi()) {
      return;
    }

    if (this.usesShellDocumentSearch() && !this.hasShellDocumentSearchDates()) {
      return;
    }

    this.allDocuments = [];
    this.documentsDisplay = [];

    this.documentService.getDocuments(this.buildDocumentRequest()).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
    })).subscribe({
      next: (documents) => {
        this.allDocuments = this.enrichReservationCodes(this.mappingService.mapDocuments(documents));
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.isServiceError = true;
        this.markViewForCheck();
      }
    });
  }

  private buildDocumentRequest(): DocumentGetRequest {
    const officeIds = this.resolveOfficeIdsForRequest();
    const request: DocumentGetRequest = (this.source === 'documents' || this.source === 'invoice' || this.source === 'maintenance') && this.documentRequest
      ? { ...this.documentRequest, officeIds }
      : { officeIds };

    const propertyId = this.source === 'documents' || this.source === 'maintenance'
      ? (request.propertyId ?? this.propertyId ?? this.selectedPropertyId ?? undefined)
      : (this.propertyId && this.propertyId !== '' ? this.propertyId : undefined);
    if (propertyId) {
      request.propertyId = propertyId;
    }

    const typeIds = this.resolveDocumentTypeIdsForRequest();
    if (typeIds.length > 0) {
      request.documentTypeIds = typeIds;
    }

    return request;
  }

  private hasFixedDocumentTypeFilter(): boolean {
    return this.resolveDocumentTypeIdsForRequest().length > 0;
  }

  private resolveDocumentTypeIdsForRequest(): number[] {
    if (this.source === 'documents') {
      return this.selectedDocumentTypeId != null ? [this.selectedDocumentTypeId] : [];
    }
    if (this.documentTypeIds?.length) {
      return this.documentTypeIds;
    }
    if (this.documentTypeId != null && this.documentTypeId !== undefined) {
      return [this.documentTypeId];
    }
    return [];
  }

  private hadDocumentTypeFilterChange(changes: SimpleChanges, previousOnly: boolean): boolean {
    const docTypeIdsChange = changes['documentTypeIds'];
    const docTypeIdChange = changes['documentTypeId'];
    if (previousOnly) {
      const hadTypeIds = (docTypeIdsChange?.previousValue as number[] | undefined)?.length;
      const hadTypeId = docTypeIdChange?.previousValue !== undefined;
      return !!hadTypeIds || hadTypeId;
    }
    if (docTypeIdsChange && docTypeIdsChange.previousValue !== docTypeIdsChange.currentValue) {
      return true;
    }
    if (docTypeIdChange && docTypeIdChange.previousValue !== docTypeIdChange.currentValue) {
      return true;
    }
    return false;
  }

  private canLoadDocumentsFromApi(): boolean {
    return this.resolveOfficeIdsForRequest().length > 0;
  }

  private usesShellDocumentSearch(): boolean {
    return (this.source === 'documents' || this.source === 'invoice' || this.source === 'maintenance') && this.documentRequest != null;
  }

  private hasShellDocumentSearchDates(): boolean {
    return !!(this.documentRequest?.startDate && this.documentRequest?.endDate);
  }

  private resolveOfficeIdsForRequest(): number[] {
    if ((this.source === 'documents' || this.source === 'maintenance') && this.documentRequest?.officeIds?.length) {
      return this.documentRequest.officeIds.filter(id => id > 0);
    }

    const selectedOfficeId = this.officeId ?? this.selectedOfficeId;
    if (selectedOfficeId != null) {
      return [selectedOfficeId];
    }

    return this.offices.map(office => office.officeId).filter(id => id > 0);
  }

  deleteDocument(document: DocumentListDisplay): void {
    this.documentService.deleteDocument(document.documentId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Document deleted successfully', CommonMessage.Success);
        this.getDocuments();
      },
      error: () => {}
    });
  }

  //#endregion

  //#region Title Bar Updates
  onTitleBarOfficeIdUpdate(newOfficeId: number | null): void {
    this.selectedOfficeId = newOfficeId;

    if (this.source === 'invoice' || this.source === 'reservation') {
      this.loadReservations();
    } else if (this.source === 'property') {
      this.loadProperties();
    } else if (this.source === 'maintenance' && this.useParentProvidedReservationList) {
      this.filterReservations();
    }

    if (this.canLoadDocumentsFromApi()) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
      this.getDocuments();
      return;
    }

    this.applyFilters();
  }

  onTitleBarReservationsUpdate(): void {
    if (this.source === 'documents') {
      this.allDocuments = this.enrichReservationCodes(this.allDocuments);
      this.applyFilters();
      return;
    }
    if (this.reservations && this.reservations.length > 0) {
      this.filterReservations();
    }
  }

  onTitleBarReservationIdUpdate(newReservationId: string | null): void {
    this.selectedReservationId = newReservationId;
    if ((this.source === 'invoice' || this.propertyId || newReservationId) && !this.useParentProvidedReservationList) {
      this.loadReservations();
    }
    this.applyFilters();
  }
  //#endregion

  //#region Document Buttons
  viewDocument(event: DocumentListDisplay): void {
    const queryParams: any = {};
    const reservationIdToUse = this.selectedReservationId || this.reservationId || event.reservationId || null;
    
    if (this.source === 'reservation' && reservationIdToUse) {
      queryParams.returnTo = 'reservationTab';
      queryParams.tab = 'documents';
      queryParams.reservationId = reservationIdToUse;
      if (this.propertyId) {
        queryParams.propertyId = this.propertyId;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'property' && this.propertyId) {
      queryParams.returnTo = 'propertyTab';
      queryParams.tab = 'documents';
      queryParams.propertyId = this.propertyId;
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
    } else if (this.source === 'invoice') {
      queryParams.returnTo = 'accountingTab';
      queryParams.tab = '3';
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
      if (this.selectedCompany?.contactId) {
        queryParams.companyId = this.selectedCompany.contactId;
      } else if (this.companyId) {
        queryParams.companyId = this.companyId;
      }
    } else if (this.propertyId && this.documentTypeId !== undefined) {
      queryParams.returnTo = 'tab';
      queryParams.propertyId = this.propertyId;
      queryParams.documentTypeId = this.documentTypeId;
      
      if (this.documentTypeId === 2) { // ReservationLease
        queryParams.reservationId = event.reservationId || null;
      }
    } else if (this.source === 'maintenance' && this.propertyId) {
      queryParams.returnTo = 'maintenance';
      queryParams.propertyId = this.propertyId;
    } else if (this.source === 'documents') {
      queryParams.returnTo = 'documentList';
      if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
        queryParams.officeId = this.selectedOfficeId;
      }
      const propertyFilterId = this.propertyId || this.selectedPropertyId;
      if (propertyFilterId) {
        queryParams.propertyId = propertyFilterId;
      }
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
    } else {
      queryParams.returnTo = 'sidebar';
    }
    
    this.router.navigate([RouterUrl.replaceTokens(RouterUrl.DocumentView, [event.documentId])],{ queryParams });
  }
  
  downloadDocument(doc: DocumentListDisplay): void {
    this.documentService.getDocumentByGuid(doc.documentId).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        if (documentResponse.fileDetails?.dataUrl) {
          const link = window.document.createElement('a');
          link.href = documentResponse.fileDetails.dataUrl;
          link.download = doc.fileName + '.' + doc.fileExtension;
          link.click();
          this.toastr.success('Document downloaded successfully', CommonMessage.Success);
        } else if (documentResponse.fileDetails?.file && documentResponse.fileDetails?.contentType) {
          const byteCharacters = atob(documentResponse.fileDetails.file);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: documentResponse.fileDetails.contentType });
          const url = window.URL.createObjectURL(blob);
          const link = window.document.createElement('a');
          link.href = url;
          link.download = doc.fileName + '.' + doc.fileExtension;
          link.click();
          window.URL.revokeObjectURL(url);
          this.toastr.success('Document downloaded successfully', CommonMessage.Success);
        } else {
          this.documentService.downloadDocument(doc.documentId).pipe(take(1)).subscribe({
            next: (blob: Blob) => {
              const url = window.URL.createObjectURL(blob);
              const link = window.document.createElement('a');
              link.href = url;
              link.download = doc.fileName + '.' + doc.fileExtension;
              link.click();
              window.URL.revokeObjectURL(url);
              this.toastr.success('Document downloaded successfully', CommonMessage.Success);
            },
            error: () => {}
          });
        }
      },
      error: () => {
        this.documentService.downloadDocument(doc.documentId).pipe(take(1)).subscribe({
          next: (blob: Blob) => {
            const url = window.URL.createObjectURL(blob);
            const link = window.document.createElement('a');
            link.href = url;
            link.download = doc.fileName + '.' + doc.fileExtension;
            link.click();
            window.URL.revokeObjectURL(url);
            this.toastr.success('Document downloaded successfully', CommonMessage.Success);
          },
          error: () => {}
        });
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    if (this.source === 'documents') {
      this.officeService.ensureOfficesLoaded(this.organizationId || '').pipe(take(1)).subscribe({
        next: () => {
          this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
            this.offices = offices || [];
            this.applyDocumentsListOfficeScope();
            this.markViewForCheck();
          });
        },
        error: () => {
          this.offices = [];
          this.resolveOfficeScope(null, false);
          this.markViewForCheck();
        }
      });
      return;
    }

    this.globalSelectionService.ensureOfficeScope(this.organizationId || '').pipe(take(1)).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, disableSingleOfficeRule: this.source === 'invoice', requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
            next: uiState => {
              this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
              if (this.selectedOfficeId !== null && !this.offices.some(o => o.officeId === this.selectedOfficeId)) {
                this.resolveOfficeScope(null, true);
              }
              this.showOfficeDropdown = uiState.showOfficeDropdown;
              this.markViewForCheck();
            }
          });
          this.markViewForCheck();
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(null, false);
        this.markViewForCheck();
      }
    });
  }
  
  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        this.filterReservations();
        if (this.reservationId) {
          this.selectedReservationId = this.reservationId;
        }
        this.allDocuments = this.enrichReservationCodes(this.allDocuments);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
        this.markViewForCheck();
      }
    });
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1)).subscribe({
      next: (properties) => {
        this.properties = this.mappingService.mapProperties(properties) || [];
        this.filterProperties();
        if (this.propertyId && this.selectedOfficeId) {
          const matchingProperty = this.availableProperties.find(p => p.value.propertyId === this.propertyId);
          if (matchingProperty) {
            this.selectedPropertyId = this.propertyId;
          }
        }
        this.markViewForCheck();
      },
      error: () => {
        this.properties = [];
        this.availableProperties = [];
        this.markViewForCheck();
      }
    });
  }

  loadCompanies(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllCompanyContacts().pipe(take(1)).subscribe({
          next: (contacts) => {
            this.companies = contacts || [];
            this.filterCompanies();
            this.markViewForCheck();
          },
          error: () => {
            this.companies = [];
            this.availableCompanies = [];
            this.markViewForCheck();
          }
        });
      },
      error: () => {
        this.companies = [];
        this.availableCompanies = [];
        this.markViewForCheck();
      }
    });
  }

  //#endregion

  //#region Filter Helpers
  get isOfficeDisabled(): boolean {
    if (this.source === 'invoice' || this.source === 'maintenance') {
      return false;
    }
    return (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') ||
           (this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '');
  }
    
  get isReservationDisabled(): boolean {
    return false;
  }

  filterReservations(): void {
    if (!this.selectedOfficeId) {
      if ((this.source === 'property' || this.source === 'maintenance') && this.propertyId) {
        const propertyReservations = this.reservations.filter(r => r.propertyId === this.propertyId);
        this.availableReservations = propertyReservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationDropdownLabel(r, this.companies.find(c => c.contactId === r.contactId) ?? null)
        }));
        return;
      }
      if (this.source === 'invoice') {
        const companyFilteredReservations = this.selectedCompany?.contactId
          ? this.reservations.filter(r => {
              const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null; contactId?: string };
              const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
              return reservationEntityId === this.selectedCompany!.contactId;
            })
          : this.reservations;
        this.availableReservations = companyFilteredReservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationDropdownLabel(r, this.companies.find(c => c.contactId === r.contactId) ?? null)
        }));
        return;
      }
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    let sourceFilteredReservations = filteredReservations;
    if ((this.source === 'property' || this.source === 'maintenance') && this.propertyId) {
      sourceFilteredReservations = filteredReservations.filter(r => r.propertyId === this.propertyId);
    }
    const companyFilteredReservations = (this.source === 'invoice' && this.selectedCompany?.contactId)
      ? sourceFilteredReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null; contactId?: string };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? reservationAny.contactId ?? null;
          return reservationEntityId === this.selectedCompany!.contactId;
        })
      : sourceFilteredReservations;
    this.availableReservations = companyFilteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationDropdownLabel(r, this.companies.find(c => c.contactId === r.contactId) ?? null)
    }));

    if (this.selectedReservationId && !companyFilteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }
  }

  filterProperties(): void {
    if (!this.selectedOfficeId) {
      this.availableProperties = this.properties.map(p => ({
        value: p,
        label: p.propertyCode || ''
      }));
      return;
    }

    const filteredProperties = this.properties.filter(p => p.officeId === this.selectedOfficeId);
    this.availableProperties = filteredProperties.map(p => ({
      value: p,
      label: p.propertyCode || ''
    }));

    if (this.selectedPropertyId && !filteredProperties.some(p => p.propertyId === this.selectedPropertyId)) {
      this.selectedPropertyId = null;
    }
  }

  filterCompanies(): void {
    const filteredCompanies = this.selectedOfficeId
      ? this.companies.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companies.filter(c => c.isActive);

    this.availableCompanies = filteredCompanies.map(c => ({
      value: c,
      label: this.utilityService.getCompanyDropdownLabel(c)
    }));

    if (this.selectedCompany && !filteredCompanies.some(c => c.contactId === this.selectedCompany?.contactId)) {
      this.selectedCompany = null;
      this.companyIdChange.emit(null);
    }

    if (this.companyId && !this.selectedCompany) {
      const matchingCompany = filteredCompanies.find(c => c.contactId === this.companyId) || null;
      if (matchingCompany) {
        this.selectedCompany = matchingCompany;
      }
    }
  }
  
  initializeDocumentTypes(): void {
    this.documentTypes = getDocumentTypes();
  }

  get documentTypeOptions(): { value: number, label: string }[] {
    return this.documentTypes;
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get reservationOptions(): { value: string, label: string }[] {
    return this.availableReservations.map(reservation => ({
      value: reservation.value.reservationId,
      label: reservation.label
    }));
  }

  onDocumentTypeDropdownChange(value: string | number | null): void {
    this.selectedDocumentTypeId = value == null || value === '' ? null : Number(value);
    if (this.source === 'documents') {
      this.getDocuments();
      return;
    }
    this.applyFilters();
  }

  onPropertyDropdownChange(value: string | number | null): void {
    this.selectedPropertyId = value == null || value === '' ? null : String(value);
    this.onPropertyChange();
  }

  onPropertyChange(): void {
    this.filterReservations();
    this.applyFilters();
  }

  get propertyOptions(): { value: string, label: string }[] {
    return this.availableProperties.map(property => ({
      value: property.value.propertyId,
      label: property.label
    }));
  }

  onOfficeDropdownChange(value: string | number | null): void {
    this.selectedOfficeId = value == null || value === '' ? null : Number(value);
    this.onOfficeChange();
  }

  onReservationDropdownChange(value: string | number | null): void {
    this.selectedReservationId = value == null || value === '' ? null : String(value);
    this.onReservationChange();
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompany?.contactId || null);
    this.filterReservations();
    this.selectedReservationId = null;
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOfficeId);
    if (this.source === 'invoice') {
      this.filterCompanies();
    }
    if (this.source === 'reservation' || this.source === 'invoice') {
      if (!this.reservationId) {
        this.filterReservations();
      }
    } else if (this.source === 'property' || this.source === 'maintenance') {
      this.filterReservations();
      this.selectedReservationId = null;
      this.reservationIdChange.emit(this.selectedReservationId);
    }
    this.applyFilters();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = [...this.allDocuments];
    
    if (this.source !== 'reservation' && this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(doc => doc.officeId === this.selectedOfficeId);
    }
    
    const reservationIdToFilter = this.selectedReservationId || this.reservationId || null;
    const propertyIdToFilter = this.propertyId || null;
    const useShellScopeFilter = this.source === 'reservation' || this.source === 'property' || this.source === 'maintenance' || this.source === 'invoice';
    if (useShellScopeFilter) {
      if (reservationIdToFilter) {
        filtered = filtered.filter(doc => doc.reservationId === reservationIdToFilter);
      } else if (propertyIdToFilter) {
        filtered = filtered.filter(doc => doc.propertyId === propertyIdToFilter);
      }
    } else if (this.source === 'documents') {
      const documentsPropertyFilter = this.propertyId || this.selectedPropertyId || null;
      const documentsReservationFilter = this.reservationId || this.selectedReservationId || null;
      if (documentsPropertyFilter) {
        filtered = filtered.filter(doc => doc.propertyId === documentsPropertyFilter);
      }
      if (documentsReservationFilter) {
        filtered = filtered.filter(doc => doc.reservationId === documentsReservationFilter);
      }
    }

    const documentTypeToFilter = this.selectedDocumentTypeId ?? this.documentTypeId ?? null;
    if (documentTypeToFilter !== null && documentTypeToFilter !== undefined) {
      filtered = filtered.filter(doc => doc.documentTypeId === documentTypeToFilter);
    }

    const activeReservationsOnly = this.activeOnly;
    const reservationScopeList = this.reservations;
    if (activeReservationsOnly && reservationScopeList && reservationScopeList.length > 0) {
      const activeReservationIds = new Set(
        reservationScopeList
          .filter(r => r.isActive)
          .map(r => r.reservationId)
      );
      filtered = filtered.filter(doc => !doc.reservationId || activeReservationIds.has(doc.reservationId));
    }
    
    this.documentsDisplay = filtered;
  }

  enrichReservationCodes(documents: DocumentListDisplay[]): DocumentListDisplay[] {
    if (!documents?.length) {
      return documents ?? [];
    }
    const reservationCodeSource = this.reservations;
    const reservationCodeById = new Map<string, string>(
      (reservationCodeSource ?? [])
        .filter(r => !!r.reservationId)
        .map(r => [r.reservationId, r.reservationCode || ''])
    );
    return documents.map(doc => {
      if (doc.reservationCode && doc.reservationCode.trim() !== '') {
        return doc;
      }
      const fallbackCode = doc.reservationId ? (reservationCodeById.get(doc.reservationId) || '') : '';
      return { ...doc, reservationCode: fallbackCode };
    });
  }

  /** Documents shell parent office: page filter only; does not write global. */
  private applyDocumentsListOfficeScope(): void {
    this.showOfficeDropdown = false;
    let officeIdToUse = this.officeId ?? this.selectedOfficeId;
    if (officeIdToUse != null && !this.offices.some(o => o.officeId === officeIdToUse)) {
      officeIdToUse = null;
    }
    if (this.offices.length === 1) {
      officeIdToUse = this.offices[0].officeId;
    }
    this.resolveOfficeScope(officeIdToUse, false);
  }

  get documentsDisplayedColumns(): ColumnSet {
    const useTabColumns = (this.source !== 'documents' && this.propertyId && this.hasFixedDocumentTypeFilter()) || this.source === 'maintenance';
    return useTabColumns ? this.tabColumns : this.sidebarColumns;
  }

  resolveOfficeScope(officeId: number | null, emitChange: boolean): void {
    this.selectedOfficeId = this.utilityService.resolveSelectedOfficeById(this.offices, officeId)?.officeId ?? officeId ?? null;
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    if (emitChange) {
      this.officeIdChange.emit(this.selectedOfficeId);
    }
    if (this.source === 'invoice') {
      this.filterCompanies();
    }
    if (this.source === 'reservation' || this.source === 'invoice') {
      this.filterReservations();
    } else if (this.source === 'property' || this.source === 'maintenance') {
      this.filterReservations();
      this.selectedReservationId = null;
      this.reservationIdChange.emit(this.selectedReservationId);
    }
    this.applyFilters();
    if (this.canLoadDocumentsFromApi()) {
      if (this.usesShellDocumentSearch() && !this.hasShellDocumentSearchDates()) {
        return;
      }
      this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
      this.getDocuments();
    }
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

