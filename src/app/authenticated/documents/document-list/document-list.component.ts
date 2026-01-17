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


  documentsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'propertyCode': { displayAs: 'Property', maxWidth: '20ch', sortType: 'natural' },
    'reservationCode': { displayAs: 'Reservation', maxWidth: '20ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Document Type', maxWidth: '25ch'},
    'fileName': { displayAs: 'File Name', maxWidth: '30ch'},
    'fileExtension': { displayAs: 'Extension', maxWidth: '15ch'},
    'createdOn': { displayAs: 'Created On', maxWidth: '30ch' },
   };
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['documents']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService
  ) {
  }

  //#region Document-List
  ngOnInit(): void {
    // Only load if propertyId and documentTypeId are already available
    if (this.propertyId && this.documentTypeId !== undefined) {
      this.getDocuments();
    } else if (!this.propertyId && this.documentTypeId === undefined) {
      // Only load all documents if no filters are provided
      this.getDocuments();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload documents when propertyId or documentTypeId changes
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const documentTypeIdChanged = changes['documentTypeId'] && 
      (changes['documentTypeId'].previousValue !== changes['documentTypeId'].currentValue);
    
    if (propertyIdChanged || documentTypeIdChanged) {
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

  getDocuments(): void {
    // If propertyId and documentTypeId are provided, use getByPropertyType
    if (this.propertyId && this.documentTypeId !== undefined) {
      this.documentService.getByPropertyType(this.propertyId, this.documentTypeId)
        .pipe(take(1), finalize(() => { this.removeLoadItem('documents'); }))
        .subscribe({
          next: (documents) => {
            this.allDocuments = this.mappingService.mapDocuments(documents);
            this.documentsDisplay = this.allDocuments;
          },
          error: (err: HttpErrorResponse) => {
            this.isServiceError = true;
            if (err.status !== 400 && err.status !== 404) {
              this.toastr.error('Could not load documents at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
            }
          }
        });
    } else {
      // Otherwise, get all documents
      this.documentService.getDocuments().pipe(take(1), finalize(() => { this.removeLoadItem('documents'); })).subscribe({
        next: (documents) => {
          this.allDocuments = this.mappingService.mapDocuments(documents);
          this.documentsDisplay = this.allDocuments;
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          if (err.status === 404) {
            // Handle not found error if business logic requires
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
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.DocumentView, [event.documentId]));
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

