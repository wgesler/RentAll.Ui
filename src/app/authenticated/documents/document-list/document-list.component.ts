import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyListDisplay } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { DocumentType, getDocumentType } from '../models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';
import { CompanyResponse } from '../../companies/models/company.model';
import { CompanyService } from '../../companies/services/company.service';

@Component({
    selector: 'app-document-list',
    templateUrl: './document-list.component.html',
    styleUrls: ['./document-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class DocumentListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId?: string;
  @Input() propertyCode: string | null = null;
  @Input() documentTypeId?: number;
  @Input() hideHeader: boolean = false;
  @Input() hideFilters: boolean = false;
  @Input() source: 'property' | 'reservation' | 'invoice' | 'documents' | null = null; // Source component where document-list is embedded
  @Input() organizationId: string | null = null; // Input to accept organizationId from parent
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() companyId: string | null = null; // Input to accept companyId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Output() organizationIdChange = new EventEmitter<string | null>(); // Emit organization changes to parent
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() companyIdChange = new EventEmitter<string | null>(); // Emit company changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];
  
  // Office selection for filtering
  showOfficeDropdown: boolean = true;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  officesSubscription?: Subscription;
  queryParamsSubscription?: Subscription;
  
  // Reservation selection for filtering (when coming from reservation or invoice)
  selectedReservationId: string | null = null;
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];

  selectedCompany: CompanyResponse | null = null;
  companies: CompanyResponse[] = [];
  availableCompanies: { value: CompanyResponse, label: string }[] = [];
  
  // Property selection for filtering (when coming from property)
  selectedPropertyId: string | null = null;
  properties: PropertyListDisplay[] = [];
  availableProperties: { value: PropertyListDisplay, label: string }[] = [];
  
  // DocumentType selection for filtering (when coming from documents)
  selectedDocumentTypeId: number | null = null;
  documentTypes: { value: number, label: string }[] = [];

  // Column sets for different modes
  sidebarColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '20ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '25ch'},
    'fileName': { displayAs: 'File Name', maxWidth: '40ch'},
  };

  tabColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '18ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '18ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '18ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '30ch'},
    'fileName': { displayAs: 'File Name', maxWidth: '40ch'},
  };
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private route: ActivatedRoute,
    private propertyService: PropertyService,
    private companyService: CompanyService) {
  }

  //#region Document-List
  ngOnInit(): void {
     if(this.isInAddReservationMode())
      return;
    
    // If source is not provided, default to 'documents' (standalone page)
    if (!this.source) {
      this.source = 'documents';
    }
    
    if (this.officeId !== null && this.officeId !== undefined) {
      this.selectedOfficeId = this.officeId;
    }
    
    if (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') {
      this.selectedReservationId = this.reservationId;
    }
    
    if (this.source === 'property' && this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '') {
      this.selectedPropertyId = this.propertyId;
    }
    
    // Add 'documents' to loading set before loading
    this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
    this.loadOffices();
    
    // Load data based on source
    if (this.source === 'reservation' || this.source === 'invoice' || this.source === 'documents' || this.source === 'property') {
      this.loadReservations();
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
    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isTypeOnlyFiltered = !hasPropertyId && this.documentTypeId !== undefined; // Filter by documentTypeId only
    const isInAddReservationMode = !isFiltered && !isUnfiltered && !isTypeOnlyFiltered;
    
    if (isInAddReservationMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
      return true;
    }
    return false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Check if we're in add-reservation mode first
    if (this.isInAddReservationMode()) {
      return;
    }
    
    // Handle officeId changes for client-side filtering and reload data based on source
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Update selectedOfficeId if it changed
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.selectedOfficeId = newOfficeId;
        
        // Reload data when office changes to update dropdown lists based on source
        if (this.source === 'invoice' || this.source === 'reservation') {
          this.loadReservations();
        } else if (this.source === 'property') {
          this.loadProperties();
        }
        
        this.applyFilters();
      }
    }
    
    // Handle reservationId changes - reapply filters when reservationId changes
    if (changes['reservationId']) {
      const newReservationId = changes['reservationId'].currentValue;
      const previousReservationId = changes['reservationId'].previousValue;
      
      // Update selectedReservationId if it changed
      if (previousReservationId === undefined || newReservationId !== previousReservationId) {
        this.selectedReservationId = newReservationId;
        // Reload reservations when reservationId changes (to sync with parent)
        // When coming from Invoice source, always reload to show all reservations filtered by office
        if (this.source === 'invoice' || this.propertyId || newReservationId) {
          this.loadReservations();
        }
        this.applyFilters();
      }
    }

    if (changes['companyId']) {
      const newCompanyId = changes['companyId'].currentValue;
      const previousCompanyId = changes['companyId'].previousValue;
      if (previousCompanyId === undefined || newCompanyId !== previousCompanyId) {
        if (newCompanyId && this.companies.length > 0) {
          this.selectedCompany = this.companies.find(c =>
            c.companyId === newCompanyId &&
            (!this.selectedOfficeId || c.officeId === this.selectedOfficeId)
          ) || null;
        } else {
          this.selectedCompany = null;
        }
        this.filterReservations();
        this.applyFilters();
      }
    }
    
    // Handle propertyId changes - load reservations when propertyId is provided
    if (changes['propertyId']) {
      const newPropertyId = changes['propertyId'].currentValue;
      const previousPropertyId = changes['propertyId'].previousValue;
      
      // Load reservations if propertyId is provided
      if (newPropertyId && (!previousPropertyId || newPropertyId !== previousPropertyId)) {
        this.loadReservations();
      }
    }
    
    // Determine if we're in filtered mode (both propertyId and documentTypeId provided)
    const currentHasPropertyId = this.propertyId && this.propertyId !== '';
    const previousHasPropertyId = changes['propertyId']?.previousValue && changes['propertyId'].previousValue !== '';
    const wasFiltered = previousHasPropertyId && changes['documentTypeId']?.previousValue !== undefined;
    const isFiltered = currentHasPropertyId && this.documentTypeId !== undefined;
    
    // Determine if we're in type-only filtered mode (only documentTypeId provided)
    const wasTypeOnlyFiltered = !previousHasPropertyId && changes['documentTypeId']?.previousValue !== undefined;
    const isTypeOnlyFiltered = !currentHasPropertyId && this.documentTypeId !== undefined;
    
    // Determine if we're in unfiltered mode (neither provided)
    const wasUnfiltered = !previousHasPropertyId && changes['documentTypeId']?.previousValue === undefined;
    const isUnfiltered = !currentHasPropertyId && this.documentTypeId === undefined;
    
    // Reload if switching between filtered/unfiltered/type-only modes or if inputs changed within same mode
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const documentTypeIdChanged = changes['documentTypeId'] && 
      (changes['documentTypeId'].previousValue !== changes['documentTypeId'].currentValue);
    
    const modeChanged = (wasFiltered !== isFiltered) || (wasUnfiltered !== isUnfiltered) || (wasTypeOnlyFiltered !== isTypeOnlyFiltered);
    
    if (propertyIdChanged || documentTypeIdChanged || modeChanged) {
      // Clear existing documents before loading new ones
      this.allDocuments = [];
      this.documentsDisplay = [];
      
      // Reset loading state
      this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
      this.getDocuments();
    }
  }

  addDocument(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Document, ['new']));
  }

  reload(): void {
    this.getDocuments();
  }

  getDocuments(): void {
    // Clear documents first to prevent stale data
    this.allDocuments = [];
    this.documentsDisplay = [];
    
    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isTypeOnlyFiltered = !hasPropertyId && this.documentTypeId !== undefined; // Filter by documentTypeId only
    const isInAddReservationMode = !isFiltered && !isUnfiltered && !isTypeOnlyFiltered;
    
    // If we're in add-reservation mode, stop spinner and return immediately
    if (isInAddReservationMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
      return;
    }
    
    if (isFiltered) {
      // FILTERED MODE: Get documents for specific property and type (used in tabs)
      this.documentService.getByPropertyType(this.propertyId, this.documentTypeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
          next: (documents) => {
            // Double-check filter: ensure they match the requested documentTypeId
            const filteredDocuments = documents.filter(doc => doc.documentTypeId === this.documentTypeId);
            this.allDocuments = this.mappingService.mapDocuments(filteredDocuments);
            this.applyFilters(); // Apply office filter if needed
          },
          error: (err: HttpErrorResponse) => {
            this.isServiceError = true;
            if (err.status !== 400 && err.status !== 404) {
              this.toastr.error('Could not load documents at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
    } else if (isTypeOnlyFiltered) {
      // TYPE-ONLY FILTERED MODE: Get all documents and filter by documentTypeId client-side (used in Accounting tab)
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
        next: (documents) => {
          // Filter documents by documentTypeId
          const filteredDocuments = documents.filter(doc => doc.documentTypeId === this.documentTypeId);
          this.allDocuments = this.mappingService.mapDocuments(filteredDocuments);
          this.applyFilters(); // Apply office filter if needed
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          if (err.status !== 400 && err.status !== 404) {
            this.toastr.error('Could not load documents at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else if (isUnfiltered) {
      // UNFILTERED MODE: Get ALL documents (used in sidebar navigation)
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
        next: (documents) => {
          this.allDocuments = this.mappingService.mapDocuments(documents);
          this.applyFilters(); // Apply office filter if needed
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          if (err.status === 404) {
          }
        }
      });
    }
  }

  deleteDocument(document: DocumentListDisplay): void {
    if (confirm(`Are you sure you want to delete this document?`)) {
      this.documentService.deleteDocument(document.documentId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Document deleted successfully', CommonMessage.Success);
          this.getDocuments(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToDocument(event: DocumentListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Document, [event.documentId]));
  }
  //#endregion

  //#region Document Buttons
  viewDocument(event: DocumentListDisplay): void {
    // Build query parameters to track where we came from
    const queryParams: any = {};
    
    // If we're in filtered mode (tab), pass the context so we can return to the tab
    if (this.propertyId && this.documentTypeId !== undefined) {
      queryParams.returnTo = 'tab';
      queryParams.propertyId = this.propertyId;
      queryParams.documentTypeId = this.documentTypeId;
      
      // Determine if it's a reservation or property tab based on documentTypeId
      if (this.documentTypeId === 2) { // ReservationLease
        queryParams.reservationId = event.reservationId || null;
      }
    } else {
      // Coming from sidebar, no return context needed
      queryParams.returnTo = 'sidebar';
    }
    
    this.router.navigate([RouterUrl.replaceTokens(RouterUrl.DocumentView, [event.documentId])],{ queryParams });
  }
  
  downloadDocument(doc: DocumentListDisplay): void {
    // First get the document to access FileDetails
    this.documentService.getDocumentByGuid(doc.documentId).pipe(take(1)).subscribe({
      next: (documentResponse: DocumentResponse) => {
        // Use FileDetails.dataUrl if available
        if (documentResponse.fileDetails?.dataUrl) {
          const link = window.document.createElement('a');
          link.href = documentResponse.fileDetails.dataUrl;
          link.download = doc.fileName + '.' + doc.fileExtension;
          link.click();
          this.toastr.success('Document downloaded successfully', CommonMessage.Success);
        } else if (documentResponse.fileDetails?.file && documentResponse.fileDetails?.contentType) {
          // Convert base64 to blob and download
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
          // Fallback to download endpoint
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
            error: (err: HttpErrorResponse) => {
              this.toastr.error('Could not download document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        // If getDocumentByGuid fails, fallback to download endpoint
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
          error: (err: HttpErrorResponse) => {
            this.toastr.error('Could not download document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        });
      }
    });
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription?.unsubscribe();
      this.officesSubscription = this.officeService.getAllOffices().subscribe({
        next: (allOffices: OfficeResponse[]) => {
          this.offices = allOffices || [];
          
          if (this.officeId !== null && this.officeId !== undefined) {
            this.selectedOfficeId = this.officeId;
          } else {
            this.selectedOfficeId = null;
          }
          
          // For Accounting Documents (source='invoice'), keep default as All Offices.
          if (this.offices.length === 1 && (this.officeId === null || this.officeId === undefined) && this.source !== 'invoice') {
            this.selectedOfficeId = this.offices[0].officeId;
            this.showOfficeDropdown = false;
          } else {
            this.showOfficeDropdown = true;
          }
          
          if (this.officeId !== null && this.officeId !== undefined && this.offices.length > 0) {
            const matchingOffice = this.offices.find(o => o.officeId === this.officeId);
            if (matchingOffice) {
              this.selectedOfficeId = matchingOffice.officeId;
              this.applyFilters();
            }
          }
        },
        error: () => {
          this.offices = [];
        }
      });
      
      if (!this.useRouteQueryParams) {
        return;
      }

      this.queryParamsSubscription?.unsubscribe();
      this.queryParamsSubscription = this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            const matchingOffice = this.offices.find(o => o.officeId === parsedOfficeId);
            if (matchingOffice) {
              this.selectedOfficeId = matchingOffice.officeId;
              this.officeIdChange.emit(this.selectedOfficeId);
              this.applyFilters();
            }
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            this.selectedOfficeId = null;
            this.applyFilters();
          }
        }
      });
    });
  }
  
  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1)).subscribe({
      next: (reservations) => {
        this.reservations = reservations || [];
        // When coming from Invoice source, show all reservations filtered by office (same as invoice-list)
        if (this.source === 'invoice') {
          // Show all reservations filtered by office when coming from Invoice/Accounting
          this.filterReservations();
          if (this.reservationId) {
            this.selectedReservationId = this.reservationId;
          }
        } else if (this.propertyId) {
          // When coming from Property component, always show all reservations filtered by office
          this.filterReservations();
          if (this.reservationId) {
            this.selectedReservationId = this.reservationId;
          }
        } else if (this.reservationId) {
          // When coming from Reservation component, show office reservations and preselect current reservation
          this.filterReservations();
          this.selectedReservationId = this.reservationId;
        } else {
          // Show all reservations filtered by office if office is selected
          this.filterReservations();
        }
        this.applyFilters();
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
      }
    });
  }

  loadCompanies(): void {
    this.companyService.getCompanies().pipe(take(1)).subscribe({
      next: (companies) => {
        this.companies = companies || [];
        this.filterCompanies();
      },
      error: () => {
        this.companies = [];
        this.availableCompanies = [];
      }
    });
  }
  //#endregion

  //#region Filter Helpers
  get isOfficeDisabled(): boolean {
    // When coming from Invoice or Documents, keep Office enabled
    if (this.source === 'invoice' || this.source === 'documents') {
      return false;
    }
    // Disable when reservationId or propertyId is provided (coming from Reservation or Property)
    return (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') ||
           (this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '');
  }
    
  get isReservationDisabled(): boolean {
    return false;
  }
  
  filterReservations(): void {
    if (!this.selectedOfficeId) {
      if (this.source === 'documents') {
        this.availableReservations = this.reservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationLabel(r)
        }));
        return;
      }
      if (this.source === 'property' && this.propertyId) {
        const propertyReservations = this.reservations.filter(r => r.propertyId === this.propertyId);
        this.availableReservations = propertyReservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationLabel(r)
        }));
        return;
      }
      if (this.source === 'invoice') {
        const companyFilteredReservations = this.selectedCompany?.companyId
          ? this.reservations.filter(r => {
              const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null };
              const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? null;
              return reservationEntityId === this.selectedCompany!.companyId;
            })
          : this.reservations;
        this.availableReservations = companyFilteredReservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationLabel(r)
        }));
        return;
      }
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    const sourceFilteredReservations = (this.source === 'property' && this.propertyId)
      ? filteredReservations.filter(r => r.propertyId === this.propertyId)
      : filteredReservations;
    const companyFilteredReservations = (this.source === 'invoice' && this.selectedCompany?.companyId)
      ? sourceFilteredReservations.filter(r => {
          const reservationAny = r as ReservationListResponse & { entityId?: string | null; EntityId?: string | null };
          const reservationEntityId = reservationAny.entityId ?? reservationAny.EntityId ?? null;
          return reservationEntityId === this.selectedCompany!.companyId;
        })
      : sourceFilteredReservations;
    this.availableReservations = companyFilteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));

    if (this.selectedReservationId && !companyFilteredReservations.some(r => r.reservationId === this.selectedReservationId)) {
      this.selectedReservationId = null;
      this.reservationIdChange.emit(null);
    }
  }

  filterCompanies(): void {
    const filteredCompanies = this.selectedOfficeId
      ? this.companies.filter(c => c.officeId === this.selectedOfficeId && c.isActive)
      : this.companies.filter(c => c.isActive);

    this.availableCompanies = filteredCompanies.map(c => ({
      value: c,
      label: `${c.companyCode || ''} - ${c.name}`.trim()
    }));

    if (this.selectedCompany && !filteredCompanies.some(c => c.companyId === this.selectedCompany?.companyId)) {
      this.selectedCompany = null;
      this.companyIdChange.emit(null);
    }

    if (this.companyId && !this.selectedCompany) {
      const matchingCompany = filteredCompanies.find(c => c.companyId === this.companyId) || null;
      if (matchingCompany) {
        this.selectedCompany = matchingCompany;
      }
    }
  }
  
  initializeDocumentTypes(): void {
    this.documentTypes = [
      { value: DocumentType.Other, label: getDocumentType(DocumentType.Other) },
      { value: DocumentType.PropertyLetter, label: getDocumentType(DocumentType.PropertyLetter) },
      { value: DocumentType.ReservationLease, label: getDocumentType(DocumentType.ReservationLease) },
      { value: DocumentType.Invoice, label: getDocumentType(DocumentType.Invoice) }
    ];
  }

  loadProperties(): void {
    this.propertyService.getPropertyList().pipe(take(1)).subscribe({
      next: (properties) => {
        this.properties = this.mappingService.mapProperties(properties) || [];
        this.filterProperties();
        // If propertyId was provided, ensure it's selected after filtering
        if (this.propertyId && this.selectedOfficeId) {
          const matchingProperty = this.availableProperties.find(p => p.value.propertyId === this.propertyId);
          if (matchingProperty) {
            this.selectedPropertyId = this.propertyId;
          }
        }
      },
      error: () => {
        this.properties = [];
        this.availableProperties = [];
      }
    });
  }

  filterProperties(): void {
    if (!this.selectedOfficeId) {
      this.availableProperties = [];
      return;
    }
    
    const filteredProperties = this.properties.filter(p => p.officeId === this.selectedOfficeId);
    this.availableProperties = filteredProperties.map(p => ({
      value: p,
      label: p.propertyCode || ''
    }));
  }

  onPropertyChange(): void {
    this.applyFilters();
  }

  onDocumentTypeChange(): void {
    this.applyFilters();
  }

  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onCompanyChange(): void {
    this.companyIdChange.emit(this.selectedCompany?.companyId || null);
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
    } else if (this.source === 'documents') {
      this.filterReservations();
      this.selectedReservationId = null;
    } else if (this.source === 'property') {
      this.filterReservations();
      this.selectedReservationId = null;
      this.reservationIdChange.emit(this.selectedReservationId);
    }
    // Apply filters to update displayed documents
    this.applyFilters();
  }

  applyFilters(): void {
    // Start with all documents
    let filtered = [...this.allDocuments];
    
    // Filter by officeId if selected
    if (this.selectedOfficeId !== null && this.selectedOfficeId !== undefined) {
      filtered = filtered.filter(doc => doc.officeId === this.selectedOfficeId);
    }
    
    // Filter based on source
    if (this.source === 'reservation' || this.source === 'invoice') {
      // Filter by reservationId if provided (from input) or selected (from dropdown)
      const reservationIdToFilter = this.selectedReservationId || this.reservationId;
      if (reservationIdToFilter !== null && reservationIdToFilter !== undefined && reservationIdToFilter !== '') {
        filtered = filtered.filter(doc => doc.reservationId === reservationIdToFilter);
      }
    } else if (this.source === 'property') {
      // Filter to current property in Property tab context.
      if (this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '') {
        filtered = filtered.filter(doc => doc.propertyId === this.propertyId);
      }
      // Optional reservation filter from dropdown.
      if (this.selectedReservationId !== null && this.selectedReservationId !== undefined && this.selectedReservationId !== '') {
        filtered = filtered.filter(doc => doc.reservationId === this.selectedReservationId);
      }
    } else if (this.source === 'documents') {
      // Filter by reservationId if selected
      if (this.selectedReservationId !== null && this.selectedReservationId !== undefined && this.selectedReservationId !== '') {
        filtered = filtered.filter(doc => doc.reservationId === this.selectedReservationId);
      }
      // Filter by documentTypeId if selected
      if (this.selectedDocumentTypeId !== null && this.selectedDocumentTypeId !== undefined) {
        filtered = filtered.filter(doc => doc.documentTypeId === this.selectedDocumentTypeId);
      }
    }
    
    this.documentsDisplay = filtered;
  }
  //#endregion

  //#region Utility Methods
  get useRouteQueryParams(): boolean {   
    return this.source === 'documents';
  }

  get documentsDisplayedColumns(): ColumnSet {
    return (this.propertyId && this.documentTypeId !== undefined) 
      ? this.tabColumns 
      : this.sidebarColumns;
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

