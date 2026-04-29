import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, skip, take } from 'rxjs';
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
import { ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { getDocumentTypes } from '../models/document.enum';
import { DocumentListDisplay, DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';
import { ContactResponse } from "../../contacts/models/contact.model";
import { ContactService } from "../../contacts/services/contact.service";

@Component({
    selector: 'app-document-list',
    standalone: true,
    templateUrl: './document-list.component.html',
    styleUrls: ['./document-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective]
})

export class DocumentListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() propertyId?: string;
  @Input() propertyCode: string | null = null;
  @Input() documentTypeId?: number;
  @Input() hideHeader: boolean = false;
  @Input() hideFilters: boolean = false;
  @Input() source: 'property' | 'reservation' | 'invoice' | 'documents' | 'maintenance' | null = null;
  @Input() organizationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() companyId: string | null = null;
  @Input() reservationId: string | null = null;
  @Input() activeOnly: boolean = false;
  @Input() showReservationFilterOnly: boolean = false;
  @Input() reservations: ReservationListResponse[] = [];
  @Output() organizationIdChange = new EventEmitter<string | null>();
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() companyIdChange = new EventEmitter<string | null>();
  @Output() reservationIdChange = new EventEmitter<string | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];
  
  showOfficeDropdown: boolean = false;
  preferredOfficeId: number | null = null;
  offices: OfficeResponse[] = [];
  selectedOfficeId: number | null = null;
  officesSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  queryParamsSubscription?: Subscription;
  navigationSubscription?: Subscription;
  officeScopeResolved: boolean = false;

  selectedReservationId: string | null = null;
  availableReservations: { value: ReservationListResponse, label: string }[] = [];

  selectedCompany: ContactResponse | null = null;
  companies: ContactResponse[] = [];
  availableCompanies: { value: ContactResponse, label: string }[] = [];
  
  selectedPropertyId: string | null = null;
  properties: PropertyListDisplay[] = [];
  availableProperties: { value: PropertyListDisplay, label: string }[] = [];
  
  selectedDocumentTypeId: number | null = null;
  documentTypes: { value: number, label: string }[] = [];

  sidebarColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '20ch'},
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'fileName': { displayAs: 'File Name', maxWidth: '60ch'},
    'createdOn': { displayAs: 'Created', maxWidth: '35ch', alignment: 'center' },
  };

  tabColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Property', maxWidth: '15ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '20ch'},
    'reservationCode': { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    'fileName': { displayAs: 'File Name', maxWidth: '60ch'},
    'createdOn': { displayAs: 'Created', maxWidth: '35ch', alignment: 'center' },
  };
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set());
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

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
    private contactService: ContactService) {
  }

  //#region Document-List
  ngOnInit(): void {
     this.organizationId = this.organizationId || this.authService.getUser()?.organizationId?.trim() || null;
     this.preferredOfficeId = this.authService.getUser()?.defaultOfficeId ?? null;
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
    
    if (this.source === 'property' && this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '') {
      this.selectedPropertyId = this.propertyId;
    }

    if (this.source === 'documents') {
      // Sidebar documents view always starts unfiltered by reservation/type.
      this.selectedReservationId = null;
      this.selectedDocumentTypeId = null;
      this.navigationSubscription = this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe(event => {
        const currentPath = event.urlAfterRedirects.split('?')[0];
        if (currentPath.endsWith('/documents')) {
          this.selectedReservationId = null;
          this.selectedDocumentTypeId = null;
          this.applyFilters();
        }
      });
    }
    
    this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
    this.utilityService.addLoadItem(this.itemsToLoad$, 'officeScope');
    this.loadOffices();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId, true);
      }
    });

    if (this.source === 'reservation' || this.source === 'invoice' || this.source === 'documents' || this.source === 'property' || this.source === 'maintenance') {
      if (this.useParentProvidedReservationList) {
        this.filterReservations();
      } else {
        this.loadReservations();
      }
    }

    if (this.source === 'invoice') {
      this.loadCompanies();
    }

    if (this.source === 'documents' || this.source === 'reservation' || this.source === 'property' || this.source === 'invoice' || this.source === 'maintenance') {
      this.initializeDocumentTypes();
    }
    
    this.getDocuments();
  }
  
  isInAddReservationMode(): boolean {
    if (this.source === 'reservation') {
      return false;
    }

    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isTypeOnlyFiltered = !hasPropertyId && this.documentTypeId !== undefined; // Filter by documentTypeId only
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
    
    if (changes['propertyId']) {
      const newPropertyId = changes['propertyId'].currentValue;
      const previousPropertyId = changes['propertyId'].previousValue;
      
      if (newPropertyId && (!previousPropertyId || newPropertyId !== previousPropertyId)) {
        if (this.useParentProvidedReservationList) {
          this.filterReservations();
        } else {
          this.loadReservations();
        }
      }
    }
    
    const currentHasPropertyId = this.propertyId && this.propertyId !== '';
    const previousHasPropertyId = changes['propertyId']?.previousValue && changes['propertyId'].previousValue !== '';
    const wasFiltered = previousHasPropertyId && changes['documentTypeId']?.previousValue !== undefined;
    const isFiltered = currentHasPropertyId && this.documentTypeId !== undefined;
    
    const wasTypeOnlyFiltered = !previousHasPropertyId && changes['documentTypeId']?.previousValue !== undefined;
    const isTypeOnlyFiltered = !currentHasPropertyId && this.documentTypeId !== undefined;
    
    const wasUnfiltered = !previousHasPropertyId && changes['documentTypeId']?.previousValue === undefined;
    const isUnfiltered = !currentHasPropertyId && this.documentTypeId === undefined;
    
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const documentTypeIdChanged = changes['documentTypeId'] && 
      (changes['documentTypeId'].previousValue !== changes['documentTypeId'].currentValue);
    
    const modeChanged = (wasFiltered !== isFiltered) || (wasUnfiltered !== isUnfiltered) || (wasTypeOnlyFiltered !== isTypeOnlyFiltered);
    
    if (propertyIdChanged || documentTypeIdChanged || modeChanged) {
      this.allDocuments = [];
      this.documentsDisplay = [];
      
      this.utilityService.addLoadItem(this.itemsToLoad$, 'documents');
      this.getDocuments();
    }
  }

  /** Property shell passes a loaded list when non-empty; maintenance shell always passes the list (may be empty). */
  private get useParentProvidedReservationList(): boolean {
    const hasPropertyId = !!this.propertyId && this.propertyId !== '';
    if (this.source === 'property' && hasPropertyId) {
      return (this.reservations?.length ?? 0) > 0;
    }
    if (this.source === 'maintenance' && hasPropertyId) {
      return true;
    }
    return false;
  }

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

    this.applyFilters();
  }

  onTitleBarReservationsUpdate(): void {
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
      queryParams.tab = '4';
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
    this.allDocuments = [];
    this.documentsDisplay = [];
    
    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isTypeOnlyFiltered = !hasPropertyId && this.documentTypeId !== undefined;
    const isPropertyDocuments = this.source === 'property' && hasPropertyId;
    const isMaintenanceDocuments = this.source === 'maintenance' && hasPropertyId;
    const isReservationSource = this.source === 'reservation';
    const isInAddReservationMode = this.source !== 'reservation' && !isFiltered && !isUnfiltered && !isTypeOnlyFiltered && !isPropertyDocuments && !isMaintenanceDocuments;
    
    if (isInAddReservationMode) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents');
      return;
    }
    
    if (isFiltered) {
      this.documentService.getByPropertyType(this.propertyId, this.documentTypeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
          next: (documents) => {
            const filteredDocuments = documents.filter(doc => doc.documentTypeId === this.documentTypeId);
            this.allDocuments = this.enrichReservationCodes(this.mappingService.mapDocuments(filteredDocuments));
            this.applyFilters();
          },
          error: () => {
            this.isServiceError = true;
          }
        });
    } else if (isTypeOnlyFiltered) {
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
        next: (documents) => {
          const filteredDocuments = documents.filter(doc => doc.documentTypeId === this.documentTypeId);
          this.allDocuments = this.enrichReservationCodes(this.mappingService.mapDocuments(filteredDocuments));
          this.applyFilters();
        },
        error: () => {
          this.isServiceError = true;
        }
      });
    } else if (isUnfiltered || isReservationSource || isPropertyDocuments || isMaintenanceDocuments) {
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'documents'); })).subscribe({
        next: (documents) => {
          this.allDocuments = this.enrichReservationCodes(this.mappingService.mapDocuments(documents));
          this.applyFilters();
        },
        error: () => {
          this.isServiceError = true;
        }
      });
    }
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

  goToDocument(event: DocumentListDisplay): void {
    const queryParams: any = {};
    const reservationIdToUse = this.selectedReservationId || this.reservationId || event.reservationId || null;

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
      queryParams.tab = '4';
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
      if (reservationIdToUse) {
        queryParams.reservationId = reservationIdToUse;
      }
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.Document, [event.documentId])],
      { queryParams }
    );
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
      queryParams.tab = '4';
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
    this.globalSelectionService.ensureOfficeScope(this.organizationId || '', this.preferredOfficeId).pipe(take(1)).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, disableSingleOfficeRule: this.source === 'invoice', requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.resolveOfficeScope(uiState.selectedOfficeId, this.officeId === null || this.officeId === undefined);
            if (this.selectedOfficeId !== null && !this.offices.some(o => o.officeId === this.selectedOfficeId)) {
              this.resolveOfficeScope(null, true);
            }
            this.showOfficeDropdown = uiState.showOfficeDropdown;
          }
        });
      },
      error: () => {
        this.offices = [];
        this.resolveOfficeScope(null, false);
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
            this.resolveOfficeScope(matchingOffice.officeId, true);
          }
        }
      } else {
        if (this.officeId === null || this.officeId === undefined) {
          this.resolveOfficeScope(this.globalSelectionService.getSelectedOfficeIdValue(), true);
        }
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
      },
      error: () => {
        this.reservations = [];
        this.availableReservations = [];
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
          },
          error: () => {
            this.companies = [];
            this.availableCompanies = [];
          }
        });
      },
      error: () => {
        this.companies = [];
        this.availableCompanies = [];
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
      },
      error: () => {
        this.properties = [];
        this.availableProperties = [];
      }
    });
  }
  //#endregion

  //#region Filter Helpers
  get isOfficeDisabled(): boolean {
    if (this.source === 'invoice' || this.source === 'documents' || this.source === 'maintenance') {
      return false;
    }
    return (this.reservationId !== null && this.reservationId !== undefined && this.reservationId !== '') ||
           (this.propertyId !== null && this.propertyId !== undefined && this.propertyId !== '');
  }
    
  get isReservationDisabled(): boolean {
    return false;
  }

  compareReservationId(a: string | null, b: string | null): boolean {
    return String(a ?? '') === String(b ?? '');
  }
  
  filterReservations(): void {
    if (!this.selectedOfficeId) {
      if (this.source === 'documents') {
        this.availableReservations = this.reservations.map(r => ({
          value: r,
          label: this.utilityService.getReservationDropdownLabel(r, this.companies.find(c => c.contactId === r.contactId) ?? null)
        }));
        return;
      }
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
    const sourceFilteredReservations = ((this.source === 'property' || this.source === 'maintenance') && this.propertyId)
      ? filteredReservations.filter(r => r.propertyId === this.propertyId)
      : filteredReservations;
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

  onDocumentTypeDropdownChange(value: string | number | null): void {
    this.selectedDocumentTypeId = value == null || value === '' ? null : Number(value);
    this.onDocumentTypeChange();
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
    this.globalSelectionService.setSelectedOfficeId(this.selectedOfficeId);
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
      if (this.selectedReservationId !== null && this.selectedReservationId !== undefined && this.selectedReservationId !== '') {
        filtered = filtered.filter(doc => doc.reservationId === this.selectedReservationId);
      }
    }

    const documentTypeToFilter = this.selectedDocumentTypeId ?? this.documentTypeId ?? null;
    if (documentTypeToFilter !== null && documentTypeToFilter !== undefined) {
      filtered = filtered.filter(doc => doc.documentTypeId === documentTypeToFilter);
    }

    const activeReservationsOnly = this.activeOnly;
    if (activeReservationsOnly && this.reservations && this.reservations.length > 0) {
      const activeReservationIds = new Set(
        this.reservations
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
    const reservationCodeById = new Map<string, string>(
      (this.reservations ?? [])
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
  //#endregion

  //#region Utility Methods
  get useRouteQueryParams(): boolean {   
    return this.source === 'documents';
  }

  get documentsDisplayedColumns(): ColumnSet {
    const useTabColumns = (this.propertyId && this.documentTypeId !== undefined) || this.source === 'maintenance';
    return useTabColumns ? this.tabColumns : this.sidebarColumns;
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.queryParamsSubscription?.unsubscribe();
    this.navigationSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
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
    } else if (this.source === 'documents') {
      this.filterReservations();
      this.selectedReservationId = null;
    } else if (this.source === 'property' || this.source === 'maintenance') {
      this.filterReservations();
      this.selectedReservationId = null;
      this.reservationIdChange.emit(this.selectedReservationId);
    }
    this.applyFilters();
  }
  //#endregion
}

