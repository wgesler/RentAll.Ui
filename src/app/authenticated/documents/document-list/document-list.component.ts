import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
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
import { DocumentType } from '../models/document.enum';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { FormatterService } from '../../../services/formatter-service';

@Component({
  selector: 'app-document-list',
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class DocumentListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showDeleted: boolean = false;
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];
  offices: OfficeResponse[] = [];
  organizationId: string = '';

  documentsDisplayedColumns: ColumnSet = {
    'fileName': { displayAs: 'File Name', maxWidth: '40ch', sortType: 'natural' },
    'documentTypeName': { displayAs: 'Type', maxWidth: '20ch'},
    'fileExtension': { displayAs: 'Extension', maxWidth: '15ch'},
    'createdOn': { displayAs: 'Created On', maxWidth: '30ch' },
   };
  
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['documents', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    private authService: AuthService,
    private officeService: OfficeService,
    private formatterService: FormatterService
  ) {
  }

  ngOnInit(): void {
    // Get organization ID from auth service
    const user = this.authService.getUser();
    this.organizationId = user?.organizationId || '';

    // Load offices and documents in parallel
    this.loadOffices();
    this.getDocuments();
  }


  addDocument(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Document, ['new']));
  }

  getDocuments(): void {
    if (!this.organizationId) {
      this.toastr.warning('Organization ID not found', CommonMessage.Error);
      this.removeLoadItem('documents');
      return;
    }

    this.documentService.getDocumentsByOrganization(this.organizationId).pipe(
      take(1), 
      finalize(() => { this.removeLoadItem('documents'); })
    ).subscribe({
      next: (documents) => {
        this.allDocuments = documents.map(doc => this.mapToDisplay(doc));
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Documents. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('documents');
      }
    });
  }

  deleteDocument(document: DocumentListDisplay): void {
    if (confirm(`Are you sure you want to delete this document?`)) {
      this.documentService.deleteDocument(document.documentId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Document deleted successfully', CommonMessage.Success);
          this.getDocuments(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete document', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToDocument(event: DocumentListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Document, [event.documentId]));
  }

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

  // Data Loading Methods
  loadOffices(): void {
    this.officeService.getOffices().pipe(
      take(1),
      finalize(() => { this.removeLoadItem('offices'); })
    ).subscribe({
      next: (offices) => {
        this.offices = offices || [];
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('offices');
      }
    });
  }

  // Filter methods
  toggleDeleted(): void {
    this.showDeleted = !this.showDeleted;
    this.applyFilters();
  }
  
  applyFilters(): void {
    this.documentsDisplay = this.showDeleted
      ? this.allDocuments
      : this.allDocuments.filter(doc => !doc.isDeleted);
  }

  // Utility Methods
  mapToDisplay(doc: DocumentResponse): DocumentListDisplay {
    // Convert documentTypeId (number) to DocumentType enum, then get the user-friendly label
    const documentType = doc.documentTypeId as DocumentType;
    const documentTypeName = this.getDocumentTypeLabel(documentType);
    
    // Format createdOn date to human-readable format with time (MM/DD/YYYY hh:mm AM/PM)
    const formattedCreatedOn = this.formatterService.formatDateTimeString(doc.createdOn);
    
    return {
      ...doc,
      documentTypeName: documentTypeName,
      createdOn: formattedCreatedOn
    };
  }

  // Helper method to get DocumentType label as string for display
  getDocumentTypeLabel(documentType: DocumentType): string {
    const typeLabels: { [key in DocumentType]: string } = {
      [DocumentType.Other]: 'Other',
      [DocumentType.PropertyLetter]: 'Property Letter',
      [DocumentType.ReservationLease]: 'Reservation Lease'
    };
    return typeLabels[documentType] || DocumentType[documentType] || 'Other';
  }
  
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
}

