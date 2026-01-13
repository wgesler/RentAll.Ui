import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, Router } from '@angular/router';
import { DocumentService } from '../services/document.service';
import { DocumentResponse } from '../models/document.model';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { BehaviorSubject, Observable, map, take, finalize } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-document-view',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './document-view.component.html',
  styleUrls: ['./document-view.component.scss']
})
export class DocumentViewComponent implements OnInit, OnDestroy {
  documentId: string;
  document: DocumentResponse | null = null;
  iframeSrc: SafeResourceUrl | null = null;
  iframeKey: number = 0;
  isServiceError: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['document']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private documentService: DocumentService,
    private toastr: ToastrService,
    private sanitizer: DomSanitizer
  ) {
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(take(1)).subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.documentId = id;
        this.loadDocument();
      } else {
        this.toastr.error('Invalid document ID', CommonMessage.Error);
        this.back();
      }
    });
  }

  loadDocument(): void {
    const currentSet = this.itemsToLoad$.value;
    const newSet = new Set(currentSet);
    newSet.add('document');
    this.itemsToLoad$.next(newSet);

    this.documentService.getDocumentByGuid(this.documentId).pipe(
      take(1),
      finalize(() => { this.removeLoadItem('document'); })
    ).subscribe({
      next: (document) => {
        this.document = document;
        this.loadDocumentContent();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.removeLoadItem('document');
      }
    });
  }

  loadDocumentContent(): void {
    if (!this.document) {
      return;
    }

    // Use FileDetails.dataUrl if available, otherwise fall back to download endpoint
    if (this.document.fileDetails?.dataUrl) {
      // Use the dataUrl directly from FileDetails
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(this.document.fileDetails.dataUrl);
      this.iframeKey++; // Force iframe refresh
    } else if (this.document.fileDetails?.file && this.document.fileDetails?.contentType) {
      // Construct dataUrl from base64 file and contentType
      const dataUrl = `data:${this.document.fileDetails.contentType};base64,${this.document.fileDetails.file}`;
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
      this.iframeKey++; // Force iframe refresh
    } else {
      // Fallback to download endpoint if FileDetails doesn't have the data
      this.documentService.downloadDocument(this.documentId).pipe(take(1)).subscribe({
        next: (blob: Blob) => {
          // Create a blob URL for the document
          const blobUrl = URL.createObjectURL(blob);
          // Sanitize the URL for use in iframe
          this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
          this.iframeKey++; // Force iframe refresh
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error('Could not load document content. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      });
    }
  }

  onDownload(): void {
    if (!this.document) return;

    // Use FileDetails.dataUrl if available for download
    if (this.document.fileDetails?.dataUrl) {
      const link = document.createElement('a');
      link.href = this.document.fileDetails.dataUrl;
      link.download = this.document.fileName + '.' + this.document.fileExtension || 'document';
      link.click();
      this.toastr.success('Document downloaded successfully', CommonMessage.Success);
    } else if (this.document.fileDetails?.file && this.document.fileDetails?.contentType) {
      // Convert base64 to blob and download
      const byteCharacters = atob(this.document.fileDetails.file);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: this.document.fileDetails.contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.document.fileName + '.' + this.document.fileExtension || 'document';
      link.click();
      window.URL.revokeObjectURL(url);
      this.toastr.success('Document downloaded successfully', CommonMessage.Success);
    } else {
      // Fallback to download endpoint
      this.documentService.downloadDocument(this.documentId).pipe(take(1)).subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = this.document?.fileName + '.' + this.document?.fileExtension || 'document';
          link.click();
          window.URL.revokeObjectURL(url);
          this.toastr.success('Document downloaded successfully', CommonMessage.Success);
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error('Could not download document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      });
    }
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.DocumentList);
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
    // Clean up blob URL if it exists
    if (this.iframeSrc) {
      const url = this.iframeSrc.toString();
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    this.itemsToLoad$.complete();
  }
}

