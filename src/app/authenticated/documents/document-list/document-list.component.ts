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
import { DocumentType } from '../models/document.model';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';

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
    'fileName': { displayAs: 'File Name', maxWidth: '30ch', sortType: 'natural' },
    'documentType': { displayAs: 'Type', maxWidth: '20ch' },
    'fileExtension': { displayAs: 'Extension', maxWidth: '15ch' },
    'createdOn': { displayAs: 'Created On', maxWidth: '20ch' },
    'isDeleted': { displayAs: 'Is Deleted', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
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
    private officeService: OfficeService
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
  
  downloadDocument(doc: DocumentListDisplay): void {
    this.documentService.downloadDocument(doc.documentId).pipe(take(1)).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
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
    return {
      ...doc,
      documentTypeName: DocumentType[doc.documentType] || 'Unknown'
    };
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

