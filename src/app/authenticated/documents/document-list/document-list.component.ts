import { OnInit, Component, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { DocumentResponse, DocumentListDisplay } from '../models/document.model';
import { DocumentService } from '../services/document.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MappingService } from '../../../services/mapping.service';
import { DocumentType } from '../models/document.enum';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { UtilityService } from '../../../services/utility.service';

@Component({
  selector: 'app-document-list',
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class DocumentListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId?: string;
  @Input() documentTypeId?: number;
  @Input() hideHeader: boolean = false;
  @Input() officeId: number | null = null; // Input to accept officeId from parent
  @Input() reservationId: string | null = null; // Input to accept reservationId from parent
  @Input() source: 'property' | 'reservation' | 'invoice' | 'documents' | null = null; // Source component where document-list is embedded
  @Output() officeIdChange = new EventEmitter<number | null>(); // Emit office changes to parent
  @Output() reservationIdChange = new EventEmitter<string | null>(); // Emit reservation changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];
  
  // Office selection for filtering
  selectedOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  
  // Reservation selection for filtering (when coming from reservation)
  selectedReservationId: string | null = null;
  reservations: ReservationListResponse[] = [];
  availableReservations: { value: ReservationListResponse, label: string }[] = [];

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

  // Getter that returns the appropriate columns based on mode
  get documentsDisplayedColumns(): ColumnSet {
    return (this.propertyId && this.documentTypeId !== undefined) 
      ? this.tabColumns 
      : this.sidebarColumns;
  }
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService,
    private officeService: OfficeService,
    private reservationService: ReservationService,
    private utilityService: UtilityService) {
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
    
    // Add 'documents' to loading set before loading
    this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
    
    this.loadOffices();
    this.loadReservations();
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
    
    // Handle officeId changes for client-side filtering
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Update selectedOfficeId if it changed
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.selectedOfficeId = newOfficeId;
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
    
    // Handle officeId changes - reload reservations when office changes (especially for invoice source)
    if (changes['officeId'] && this.source === 'invoice') {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;
      
      // Reload reservations when office changes to update the dropdown list
      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        this.loadReservations();
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
    this.officeService.getOffices().subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = offices;
        // After offices load, set selectedOfficeId from officeId input if provided
        if (this.officeId !== null && this.officeId !== undefined) {
          this.selectedOfficeId = this.officeId;
        } else {
          this.selectedOfficeId = null;
        }
      },
      error: () => {
        this.offices = [];
      }
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
        } else if (this.propertyId) {
          // When coming from Property component, always show all reservations filtered by office
          this.filterReservations();
        } else if (this.reservationId) {
          // When coming from Reservation component, only show the selected reservation
          const selectedReservation = this.reservations.find(r => r.reservationId === this.reservationId);
          if (selectedReservation) {
            this.availableReservations = [{
              value: selectedReservation,
              label: this.utilityService.getReservationLabel(selectedReservation)
            }];
          } else {
            this.availableReservations = [];
          }
        } else {
          // Show all reservations filtered by office if office is selected
          this.filterReservations();
        }
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
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
    return this.source === 'reservation';
  }
  
  filterReservations(): void {
    if (!this.selectedOfficeId) {
      this.availableReservations = [];
      return;
    }
    
    const filteredReservations = this.reservations.filter(r => r.officeId === this.selectedOfficeId);
    this.availableReservations = filteredReservations.map(r => ({
      value: r,
      label: this.utilityService.getReservationLabel(r)
    }));
  }
  
  onReservationChange(): void {
    this.reservationIdChange.emit(this.selectedReservationId);
    this.applyFilters();
  }

  onOfficeChange(): void {
    this.officeIdChange.emit(this.selectedOfficeId);
    if (!this.reservationId) {
      this.filterReservations();
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
    
    // Filter by reservationId if provided (from input) or selected (from dropdown)
    const reservationIdToFilter = this.reservationId || this.selectedReservationId;
    if (reservationIdToFilter !== null && reservationIdToFilter !== undefined && reservationIdToFilter !== '') {
      filtered = filtered.filter(doc => doc.reservationId === reservationIdToFilter);
    }
    
    this.documentsDisplay = filtered;
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

