import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { ToastrService } from 'ngx-toastr';
import { DocumentType } from '../../documents/models/document.enum';
import { DocumentResponse } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';

@Component({
  standalone: true,
  selector: 'app-mobile-document-view-page',
  imports: [MaterialModule],
  templateUrl: './mobile-document-view-page.component.html',
  styleUrl: './mobile-document-view-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileDocumentViewPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private mappingService = inject(MappingService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private destroy$ = new Subject<void>();
  private objectUrl: string | null = null;
  documentId = '';
  document: DocumentResponse | null = null;
  title = 'Document';
  isPageReady = false;
  isServiceError = false;
  canViewInBrowser = false;
  imageSrc: string | null = null;
  iframeSrc: SafeResourceUrl | null = null;

  //#region Mobile-Document-View
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const documentId = (params.get('id') || '').trim();
      if (!documentId || documentId === this.documentId) {
        return;
      }
      this.documentId = documentId;
      this.loadDocument();
    });
  }

  ngOnDestroy(): void {
    this.releaseObjectUrl();
    this.destroy$.next();
    this.destroy$.complete();
  }

  back(): void {
    void this.router.navigate(['/mobile', 'documents']);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  get canEmailDocument(): boolean {
    return this.isPageReady && !this.isServiceError && !!this.document;
  }

  emailDocument(): void {
    if (!this.canEmailDocument || !this.document) {
      return;
    }
    const user = this.authService.getUser();
    const fromEmail = (user?.email || '').trim();
    const fromName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    if (!fromEmail || !fromName) {
      this.toastr.warning('Current user email sender information is not available.', CommonMessage.Error);
      return;
    }
    const file = this.attachmentFileContent(this.document);
    if (!file) {
      this.toastr.error('This document has no file to attach.', CommonMessage.Error);
      return;
    }
    this.emailCreateDraftService.setDraft({
      returnUrl: this.router.url,
      attachmentDocumentId: this.documentId,
      emailConfig: {
        subject: this.title,
        toEmail: '',
        toName: '',
        fromEmail,
        fromName,
        documentType: this.document.documentTypeId as DocumentType,
        emailType: EmailType.Other,
        plainTextContent: 'Please see the attached document.',
        htmlContent: '',
        fileDetails: {
          fileName: this.title,
          contentType: this.document.contentType || this.document.fileDetails?.contentType || 'application/pdf',
          file
        },
        errorMessage: 'Error sending email. Please try again.'
      },
      documentConfig: {
        previewIframeHtml: ' ',
        previewIframeStyles: '',
        organizationId: this.document.organizationId,
        selectedOfficeId: this.document.officeId,
        selectedOfficeName: this.document.officeName || '',
        propertyId: this.document.propertyId || null,
        selectedReservationId: this.document.reservationId || null,
        isDownloading: false
      }
    });
    void this.router.navigateByUrl(RouterUrl.MobileEmailCreate);
  }
  //#endregion

  //#region Data Loading Methods
  loadDocument(): void {
    this.isPageReady = false;
    this.isServiceError = false;
    this.canViewInBrowser = false;
    this.imageSrc = null;
    this.iframeSrc = null;
    this.document = null;
    this.releaseObjectUrl();
    this.markViewForCheck();
    this.documentService.getDocumentByGuid(this.documentId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: document => {
        this.document = document;
        this.title = this.buildTitle(document);
        this.canViewInBrowser = this.mappingService.isViewableInBrowser(document.contentType, document.fileExtension);
        if (!this.canViewInBrowser) {
          this.isPageReady = true;
          this.markViewForCheck();
          return;
        }
        const embeddedSrc = this.getEmbeddedDocumentSrc(document);
        if (embeddedSrc) {
          this.applyRenderSrc(this.toRenderableObjectUrl(embeddedSrc));
          this.isPageReady = true;
          this.markViewForCheck();
          return;
        }
        this.loadDocumentContentFromDownload();
      },
      error: () => {
        this.isServiceError = true;
        this.isPageReady = true;
        this.markViewForCheck();
      }
    });
  }

  loadDocumentContentFromDownload(): void {
    this.documentService.downloadDocument(this.documentId).pipe(take(1), takeUntil(this.destroy$), finalize(() => {
      this.isPageReady = true;
      this.markViewForCheck();
    })).subscribe({
      next: blob => {
        this.releaseObjectUrl();
        this.objectUrl = URL.createObjectURL(blob);
        this.applyRenderSrc(this.objectUrl);
        this.markViewForCheck();
      },
      error: () => {
        this.iframeSrc = null;
        this.imageSrc = null;
        this.markViewForCheck();
      }
    });
  }
  //#endregion

  //#region Utility Methods
  private applyRenderSrc(renderSrc: string): void {
    if (this.document && this.isImageDocument(this.document.contentType, this.document.fileExtension)) {
      this.imageSrc = renderSrc;
      this.iframeSrc = null;
      return;
    }
    this.imageSrc = null;
    const viewSrc = this.isPdfDocument(this.document?.contentType || '', this.document?.fileExtension || '')
      ? `${renderSrc}#toolbar=0&navpanes=0`
      : renderSrc;
    this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(viewSrc);
  }

  private buildTitle(document: DocumentResponse): string {
    const extension = (document.fileExtension || '').trim().replace(/^\./, '');
    const name = (document.fileName || '').trim() || 'Document';
    if (extension && !name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
      return `${name}.${extension}`;
    }
    return name;
  }

  private isPdfDocument(contentType: string, fileExtension: string): boolean {
    const ext = (fileExtension || '').toLowerCase();
    const mimeType = (contentType || '').toLowerCase();
    return mimeType === 'application/pdf' || ext === 'pdf';
  }

  private attachmentFileContent(document: DocumentResponse): string {
    const raw = (document.fileDetails?.file || document.fileDetails?.dataUrl || '').trim();
    if (!raw) {
      return '';
    }
    if (raw.toLowerCase().startsWith('data:')) {
      const commaIndex = raw.indexOf(',');
      return commaIndex >= 0 ? raw.slice(commaIndex + 1) : '';
    }
    return raw;
  }

  private isImageDocument(contentType: string, fileExtension: string): boolean {
    const ext = (fileExtension || '').toLowerCase();
    const mimeType = (contentType || '').toLowerCase();
    return mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  }

  private getEmbeddedDocumentSrc(document: DocumentResponse): string | null {
    const dataUrl = (document.fileDetails?.dataUrl || '').trim();
    if (dataUrl.startsWith('data:')) {
      return dataUrl;
    }
    const file = (document.fileDetails?.file || '').trim();
    const contentType = (document.fileDetails?.contentType || document.contentType || '').trim();
    if (!file || !contentType) {
      return null;
    }
    if (file.startsWith('data:')) {
      return file;
    }
    if (file.length < 16) {
      return null;
    }
    return `data:${contentType};base64,${file}`;
  }

  private toRenderableObjectUrl(source: string): string {
    const value = String(source || '').trim();
    if (!value.startsWith('data:')) {
      return value;
    }
    this.releaseObjectUrl();
    this.objectUrl = URL.createObjectURL(this.dataUrlToBlob(value));
    return this.objectUrl;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64 = ''] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  private releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
  //#endregion
}
