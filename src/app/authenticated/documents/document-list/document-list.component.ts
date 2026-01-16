import { OnInit, Component, OnDestroy } from '@angular/core';
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
  allDocuments: DocumentListDisplay[] = [];
  documentsDisplay: DocumentListDisplay[] = [];


  documentsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
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
    this.getDocuments();
  }

  addDocument(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Document, ['new']));
  }

  getDocuments(): void {
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

