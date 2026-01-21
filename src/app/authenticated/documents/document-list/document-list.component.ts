import { OnInit, Component, OnDestroy, OnChanges, SimpleChanges, Input } from '@angular/core';
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
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];

  // Column sets for different modes
  sidebarColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '20ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '30ch'},
    'fileName': { displayAs: 'File Name', maxWidth: '30ch'},
  };

  tabColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '18ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '18ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '18ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '30ch'},
    'fileName': { displayAs: 'File Name', maxWidth: '30ch'},
  };

  // Getter that returns the appropriate columns based on mode
  get documentsDisplayedColumns(): ColumnSet {
    return (this.propertyId && this.documentTypeId !== undefined) 
      ? this.tabColumns 
      : this.sidebarColumns;
  }
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['documents']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService) {
  }

  //#region Document-List
  ngOnInit(): void {
     if(this.isInAddReservationMode())
      return;
    
    this.getDocuments();
  }
  
  isInAddReservationMode(): boolean {
    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isInAddReservationMode = !isFiltered && !isUnfiltered;
    
    if (isInAddReservationMode) {
      this.removeLoadItem('documents');
      return true;
    }
    return false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Check if we're in add-reservation mode first
    if (this.isInAddReservationMode()) {
      return;
    }
    
    // Determine if we're in filtered mode (both propertyId and documentTypeId provided)
    const currentHasPropertyId = this.propertyId && this.propertyId !== '';
    const previousHasPropertyId = changes['propertyId']?.previousValue && changes['propertyId'].previousValue !== '';
    const wasFiltered = previousHasPropertyId && changes['documentTypeId']?.previousValue !== undefined;
    const isFiltered = currentHasPropertyId && this.documentTypeId !== undefined;
    
    // Determine if we're in unfiltered mode (neither provided)
    const wasUnfiltered = !previousHasPropertyId && changes['documentTypeId']?.previousValue === undefined;
    const isUnfiltered = !currentHasPropertyId && this.documentTypeId === undefined;
    
    // Reload if switching between filtered/unfiltered modes or if inputs changed within same mode
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const documentTypeIdChanged = changes['documentTypeId'] && 
      (changes['documentTypeId'].previousValue !== changes['documentTypeId'].currentValue);
    
    const modeChanged = (wasFiltered !== isFiltered) || (wasUnfiltered !== isUnfiltered);
    
    if (propertyIdChanged || documentTypeIdChanged || modeChanged) {
      // Clear existing documents before loading new ones
      this.allDocuments = [];
      this.documentsDisplay = [];
      
      // Reset loading state
      const currentSet = this.itemsToLoad$.value;
      if (!currentSet.has('documents')) {
        const newSet = new Set(currentSet);
        newSet.add('documents');
        this.itemsToLoad$.next(newSet);
      }
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
    
    // STRICT MODE CHECK: Only use filtered API when BOTH propertyId AND documentTypeId are provided
    const hasPropertyId = this.propertyId && this.propertyId !== '';
    const isFiltered = hasPropertyId && this.documentTypeId !== undefined;
    const isUnfiltered = !hasPropertyId && this.documentTypeId === undefined;
    const isInAddReservationMode = !isFiltered && !isUnfiltered;
    
    // If we're in add-reservation mode, stop spinner and return immediately
    if (isInAddReservationMode) {
      this.removeLoadItem('documents');
      return;
    }
    
    if (isFiltered) {
      // FILTERED MODE: Get documents for specific property and type (used in tabs)
      this.documentService.getByPropertyType(this.propertyId, this.documentTypeId).pipe(take(1), finalize(() => { this.removeLoadItem('documents'); })).subscribe({
          next: (documents) => {
            // Double-check filter: ensure they match the requested documentTypeId
            const filteredDocuments = documents.filter(doc => doc.documentTypeId === this.documentTypeId);
            this.allDocuments = this.mappingService.mapDocuments(filteredDocuments);
            this.documentsDisplay = this.allDocuments;
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
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.removeLoadItem('documents'); })).subscribe({
        next: (documents) => {
          this.allDocuments = this.mappingService.mapDocuments(documents);
          this.documentsDisplay = this.allDocuments;
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

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

