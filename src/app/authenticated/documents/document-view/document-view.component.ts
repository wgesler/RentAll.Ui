import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { hasInspectorRole } from '../../shared/access/role-access';
import { DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';

@Component({
    standalone: true,
    selector: 'app-document-view',
    imports: [CommonModule, MaterialModule],
    templateUrl: './document-view.component.html',
    styleUrls: ['./document-view.component.scss']
})
export class DocumentViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private documentService = inject(DocumentService);
  private toastr = inject(ToastrService);
  private sanitizer = inject(DomSanitizer);
  private utilityService = inject(UtilityService);
  private authService = inject(AuthService);

  @ViewChild('documentIframe', { static: false }) iframeRef!: ElementRef<HTMLIFrameElement>;
  
  documentId: string;
  document: DocumentResponse | null = null;
  iframeSrc: SafeResourceUrl | null = null;
  imageSrc: string | null = null;
  iframeKey: number = 0;
  isServiceError: boolean = false;
  canViewInBrowser: boolean = false;
  
  // Return context
  returnTo?: string;
  propertyId?: string;
  reservationId?: string;
  documentTypeId?: number;
  contactTab?: string;
  contactOfficeId?: string;
  shouldPrint: boolean = false; // Flag to trigger print after document loads
iframeLoadHandler?: () => void;
  private objectUrl: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['document']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  //#region Document-View
  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParams;
    this.returnTo = queryParams['returnTo'];
    this.propertyId = queryParams['propertyId'];
    this.reservationId = queryParams['reservationId'];
    this.documentTypeId = queryParams['documentTypeId'] ? Number(queryParams['documentTypeId']) : undefined;
    this.contactTab = queryParams['tab'];
    this.contactOfficeId = queryParams['officeId'];
    this.shouldPrint = queryParams['print'] === 'true';

    const inlineDocument = this.getInlineDocumentFromState();
    if (inlineDocument?.dataUrl) {
      this.document = this.buildInlineDocumentResponse(inlineDocument);
      this.loadDocumentContent();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'document');
      return;
    }

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
    this.utilityService.addLoadItem(this.itemsToLoad$, 'document');

    this.documentService.getDocumentByGuid(this.documentId).pipe(
      take(1),
      finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'document'); })
    ).subscribe({
      next: (document) => {
        this.document = document;
        this.loadDocumentContent();
        // Print will be triggered via iframe load event if shouldPrint is true
      },
      error: () => {
        this.isServiceError = true;
      }
    });
  }

  setupIframeLoadListener(): void {
    // Clear any existing handler first
    if (this.iframeLoadHandler) {
      const existingIframe = document.querySelector('iframe.document-iframe') as HTMLIFrameElement;
      if (existingIframe) {
        existingIframe.removeEventListener('load', this.iframeLoadHandler);
      }
    }

    // Wait for the iframe element to be available in the DOM
    const checkForIframe = (attempts: number = 0, maxAttempts: number = 20) => {
      const iframe = document.querySelector('iframe.document-iframe') as HTMLIFrameElement;
      if (iframe) {
        this.iframeLoadHandler = () => {
          // Wait for PDF viewer to fully initialize
          setTimeout(() => {
            this.attemptClickPrintButton(iframe);
          }, 1500);
        };
        iframe.addEventListener('load', this.iframeLoadHandler);
        
        // If iframe is already loaded, trigger immediately
        if (iframe.contentDocument?.readyState === 'complete') {
          setTimeout(() => {
            this.iframeLoadHandler!();
          }, 1500);
        }
      } else if (attempts < maxAttempts) {
        // Iframe not found yet, retry
        setTimeout(() => checkForIframe(attempts + 1, maxAttempts), 100);
      }
    };
    
    checkForIframe();
  }
  //#endregion

  //#region Form Response Methods
  loadDocumentContent(): void {
    if (!this.document) {
      return;
    }

    // Check if document type can be viewed in browser
    this.canViewInBrowser = this.isViewableInBrowser(this.document.contentType, this.document.fileExtension);

    // If not viewable, don't try to load in iframe
    if (!this.canViewInBrowser) {
      return;
    }

    // Use FileDetails.dataUrl if available, otherwise fall back to download endpoint
    const embeddedSrc = this.getEmbeddedDocumentSrc(this.document);
    if (embeddedSrc) {
      const renderSrc = this.toRenderableObjectUrl(embeddedSrc);
      if (this.isImageDocument(this.document.contentType, this.document.fileExtension)) {
        this.imageSrc = renderSrc;
        this.iframeSrc = null;
        return;
      }

      this.imageSrc = null;
      // Use embedded file details first (same behavior style as inventory/embedded viewers).
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(renderSrc);
      this.iframeKey++; // Force iframe refresh
      // Set up load listener if printing is needed
      if (this.shouldPrint) {
        setTimeout(() => this.setupIframeLoadListener(), 200);
      }
    } else {
      this.loadDocumentContentFromDownloadEndpoint();
    }
  }

  getEmbeddedDocumentSrc(document: DocumentResponse): string | null {
    const dataUrl = (document.fileDetails?.dataUrl || '').trim();
    if (dataUrl.startsWith('data:')) {
      return dataUrl;
    }

    const file = (document.fileDetails?.file || '').trim();
    const contentType = (document.fileDetails?.contentType || document.contentType || '').trim();
    if (!file || !contentType) {
      return null;
    }

    // Some payloads already return a full data URL in file.
    if (file.startsWith('data:')) {
      return file;
    }

    // Basic sanity check to avoid rendering obviously invalid/empty content.
    if (file.length < 16) {
      return null;
    }

    return `data:${contentType};base64,${file}`;
  }

  loadDocumentContentFromDownloadEndpoint(): void {
    this.documentService.downloadDocument(this.documentId).pipe(take(1)).subscribe({
      next: (blob: Blob) => {
        this.releaseObjectUrl();
        const blobUrl = URL.createObjectURL(blob);
        this.objectUrl = blobUrl;
        if (this.document && this.isImageDocument(this.document.contentType, this.document.fileExtension)) {
          this.imageSrc = blobUrl;
          this.iframeSrc = null;
        } else {
          this.imageSrc = null;
          this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
          this.iframeKey++;
        }
        if (this.shouldPrint) {
          setTimeout(() => this.setupIframeLoadListener(), 200);
        }
      },
      error: () => {}
    });
  }

  isImageDocument(contentType: string, fileExtension: string): boolean {
    const ext = fileExtension?.toLowerCase() || '';
    const mimeType = contentType?.toLowerCase() || '';
    return mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  }

  toRenderableObjectUrl(source: string): string {
    const value = String(source || '').trim();
    if (!value.startsWith('data:')) {
      return value;
    }
    this.releaseObjectUrl();
    const blob = this.dataUrlToBlob(value);
    this.objectUrl = URL.createObjectURL(blob);
    return this.objectUrl;
  }

  dataUrlToBlob(dataUrl: string): Blob {
    const [header, base64 = ''] = dataUrl.split(',');
    const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  releaseObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  isViewableInBrowser(contentType: string, fileExtension: string): boolean {
    if (!contentType && !fileExtension) {
      return false;
    }

    const ext = fileExtension?.toLowerCase() || '';
    const mimeType = contentType?.toLowerCase() || '';

    // PDFs - always viewable
    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return true;
    }

    // Images - viewable
    if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return true;
    }

    // HTML - viewable
    if (mimeType === 'text/html' || ext === 'html' || ext === 'htm') {
      return true;
    }

    // Text files - viewable
    if (mimeType.startsWith('text/') || ext === 'txt') {
      return true;
    }

    // Office documents and other binary formats - not viewable in browser
    return false;
  }

  attemptClickPrintButton(iframe: HTMLIFrameElement, attempts: number = 0, maxAttempts: number = 15): void {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      const iframeWin = iframe.contentWindow;
      
      if (iframeDoc && iframeDoc.readyState === 'complete' && iframeWin) {
        // Check if body exists
        if (!iframeDoc.body) {
          if (attempts < maxAttempts) {
            setTimeout(() => {
              this.attemptClickPrintButton(iframe, attempts + 1, maxAttempts);
            }, 300);
            return;
          }
        }
        
        // Try injecting a script into the iframe to click the button from within that context
        const script = iframeDoc.createElement('script');
        script.textContent = `
          (function() {
            function findAndClickPrintButton() {
              const selectors = [
                '#print',
                'button#print',
                'button[title*="Print" i]',
                'button[title*="print" i]',
                'button[aria-label*="Print" i]',
                'button[aria-label*="print" i]',
                '.toolbar .print',
                '.toolbar button[title*="Print" i]',
                '[data-l10n-id="print"]',
                'button.print',
                'a#print',
                'a[title*="Print" i]',
                'button[data-l10n-id="print"]',
                '#secondaryToolbarPrint',
                '#secondaryPrint'
              ];
              
              let printButton = null;
              for (const selector of selectors) {
                try {
                  printButton = document.querySelector(selector);
                  if (printButton) {
                    break;
                  }
                } catch (e) {}
              }
              
              if (!printButton) {
                const allElements = document.querySelectorAll('button, a, [role="button"]');
                for (let i = 0; i < allElements.length; i++) {
                  const elem = allElements[i];
                  const title = (elem.getAttribute('title') || '').toLowerCase();
                  const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
                  const id = (elem.id || '').toLowerCase();
                  const className = (elem.className || '').toLowerCase();
                  
                  if (title.includes('print') || ariaLabel.includes('print') || 
                      id.includes('print') || className.includes('print')) {
                    printButton = elem;
                    break;
                  }
                }
              }
              
              if (printButton) {
                printButton.focus();
                printButton.click();
                
                // Also try mouse events
                try {
                  const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                  const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
                  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
                  printButton.dispatchEvent(mouseDown);
                  printButton.dispatchEvent(mouseUp);
                  printButton.dispatchEvent(click);
                } catch {
                }
                
                return true;
              }
              return false;
            }
            
            // Try immediately
            if (findAndClickPrintButton()) {
              return;
            }
            
            // If not found, wait a bit and retry
            let retries = 0;
            const maxRetries = 15;
            const interval = setInterval(function() {
              retries++;
              if (findAndClickPrintButton()) {
                clearInterval(interval);
              } else if (retries >= maxRetries) {
                clearInterval(interval);
              }
            }, 300);
          })();
        `;
        
        iframeDoc.body.appendChild(script);
        return;
      }
    } catch {
    }

    // If script injection failed and haven't exceeded max attempts, retry
    if (attempts < maxAttempts) {
      setTimeout(() => {
        this.attemptClickPrintButton(iframe, attempts + 1, maxAttempts);
      }, 500);
    } else {
      // Fallback: use iframe's print method
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        window.print();
      }
    }
  }

  //#region Utility Methods
  getInlineDocumentFromState(): { dataUrl: string; contentType?: string; fileName?: string } | null {
    const state = history.state as { inlineDocument?: { dataUrl?: string; contentType?: string; fileName?: string } };
    const dataUrl = String(state?.inlineDocument?.dataUrl || '').trim();
    if (!dataUrl) {
      return null;
    }
    return {
      dataUrl,
      contentType: state.inlineDocument?.contentType,
      fileName: state.inlineDocument?.fileName
    };
  }

  buildInlineDocumentResponse(inline: { dataUrl: string; contentType?: string; fileName?: string }): DocumentResponse {
    const inferredContentType = this.getContentTypeFromDataUrl(inline.dataUrl) || inline.contentType || 'application/octet-stream';
    const fileNameWithExtension = this.ensureFileNameWithExtension(inline.fileName || 'Document', inferredContentType);
    const splitAt = fileNameWithExtension.lastIndexOf('.');
    const fileName = splitAt > 0 ? fileNameWithExtension.substring(0, splitAt) : fileNameWithExtension;
    const fileExtension = splitAt > 0 ? fileNameWithExtension.substring(splitAt + 1) : this.getFileExtensionFromContentType(inferredContentType);
    const inlineResponse: Partial<DocumentResponse> = {
      documentId: 'inline-preview',
      fileName,
      fileExtension,
      contentType: inferredContentType,
      fileDetails: {
        fileName: fileNameWithExtension,
        contentType: inferredContentType,
        file: '',
        dataUrl: inline.dataUrl
      }
    };
    return inlineResponse as DocumentResponse;
  }

  getContentTypeFromDataUrl(dataUrl: string): string | null {
    const match = String(dataUrl || '').trim().match(/^data:([^;]+);/i);
    return match?.[1]?.toLowerCase() || null;
  }

  getFileExtensionFromContentType(contentType: string): string {
    const normalized = (contentType || '').toLowerCase().trim();
    if (normalized === 'application/pdf') return 'pdf';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/gif') return 'gif';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/svg+xml') return 'svg';
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    return 'bin';
  }

  ensureFileNameWithExtension(fileName: string, contentType: string): string {
    const trimmed = String(fileName || '').trim() || 'Document';
    if (trimmed.includes('.')) {
      return trimmed;
    }
    const extension = this.getFileExtensionFromContentType(contentType);
    return `${trimmed}.${extension}`;
  }

   getMaintenanceShellDocumentsTabIndex(): number {
    const isInspector = hasInspectorRole(this.authService.getUser()?.userGroups as Array<string | number> | undefined);
    const showWorkOrdersTab = !isInspector;
    return showWorkOrdersTab ? 5 : 4;
  }

  back(): void {
    if (this.returnTo === 'reservationTab' && this.reservationId) {
      const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [this.reservationId]);
      const params: string[] = ['tab=documents', `reservationId=${this.reservationId}`];
      if (this.propertyId) {
        params.push(`propertyId=${this.propertyId}`);
      }
      this.router.navigateByUrl(`${reservationUrl}?${params.join('&')}`);
      return;
    }

    if (this.returnTo === 'accountingTab') {
      const params: string[] = ['tab=3'];
      const queryParams = this.route.snapshot.queryParams;
      const officeId = queryParams['officeId'];
      const reservationId = queryParams['reservationId'];
      const companyId = queryParams['companyId'];
      if (officeId !== null && officeId !== undefined && officeId !== '') {
        params.push(`officeId=${officeId}`);
      }
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }
      if (companyId) {
        params.push(`companyId=${companyId}`);
      }
      this.router.navigateByUrl(`${RouterUrl.AccountingList}?${params.join('&')}`);
      return;
    }

    if (this.returnTo === 'propertyTab' && this.propertyId) {
      const queryParams = this.route.snapshot.queryParams;
      const params: string[] = ['tab=documents'];
      const reservationId = queryParams['reservationId'];
      const officeId = queryParams['officeId'];
      if (reservationId) {
        params.push(`reservationId=${reservationId}`);
      }
      if (officeId !== null && officeId !== undefined && officeId !== '') {
        params.push(`officeId=${officeId}`);
      }
      const propertyUrl = RouterUrl.replaceTokens(RouterUrl.Property, [this.propertyId]);
      this.router.navigateByUrl(`${propertyUrl}?${params.join('&')}`);
      return;
    }

    if (this.returnTo === 'documentList') {
      this.router.navigateByUrl(RouterUrl.DocumentList);
      return;
    }

    if (this.returnTo === 'propertyAgreement' && this.propertyId) {
      const params: string[] = [];
      const tab = this.route.snapshot.queryParams['tab'];
      const officeId = this.route.snapshot.queryParams['officeId'];
      if (tab !== null && tab !== undefined && tab !== '') {
        params.push(`tab=${tab}`);
      }
      if (officeId !== null && officeId !== undefined && officeId !== '') {
        params.push(`officeId=${officeId}`);
      }
      const propertyUrl = RouterUrl.replaceTokens(RouterUrl.Property, [this.propertyId]);
      if (params.length > 0) {
        this.router.navigateByUrl(`${propertyUrl}?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(propertyUrl);
      }
      return;
    }

    if (this.returnTo === 'contacts') {
      const params: string[] = [];
      if (this.contactTab !== null && this.contactTab !== undefined && this.contactTab !== '') {
        params.push(`tab=${this.contactTab}`);
      }
      if (this.contactOfficeId !== null && this.contactOfficeId !== undefined && this.contactOfficeId !== '') {
        params.push(`officeId=${this.contactOfficeId}`);
      }
      if (params.length > 0) {
        this.router.navigateByUrl(`${RouterUrl.ContactList}?${params.join('&')}`);
      } else {
        this.router.navigateByUrl(RouterUrl.ContactList);
      }
      return;
    }

    if (this.returnTo === 'email') {
      this.router.navigateByUrl(RouterUrl.EmailList);
      return;
    }

    if (this.returnTo === 'leads') {
      this.router.navigateByUrl(RouterUrl.Leads);
      return;
    }

    // If we came from Maintenance > Documents tab
    if (this.returnTo === 'maintenance' && this.propertyId) {
      const maintenanceUrl = RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.propertyId]);
      const documentsTabIndex = this.getMaintenanceShellDocumentsTabIndex();
      this.router.navigateByUrl(`${maintenanceUrl}?tab=${documentsTabIndex}`);
      return;
    }

    // If we came from a tab, navigate back to that tab
    if (this.returnTo === 'tab' && this.propertyId && this.documentTypeId !== undefined) {
      if (this.documentTypeId === 2 && this.reservationId) {
        // Return to reservation Documents tab
        const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [this.reservationId]);
        this.router.navigateByUrl(reservationUrl + '?tab=documents');
      } else if (this.documentTypeId === 1) {
        // Return to property Documents tab
        const propertyUrl = RouterUrl.replaceTokens(RouterUrl.Property, [this.propertyId]);
        this.router.navigateByUrl(propertyUrl + '?tab=documents');
      } else {
        // Fallback to document list
        this.router.navigateByUrl(RouterUrl.DocumentList);
      }
    } else {
      // Default: return to sidebar document list
      this.router.navigateByUrl(RouterUrl.DocumentList);
    }
  }
  
  ngOnDestroy(): void {
    // Remove iframe load listener if it exists
    if (this.iframeLoadHandler) {
      const iframe = document.querySelector('iframe.document-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.removeEventListener('load', this.iframeLoadHandler);
      }
    }
    
    this.releaseObjectUrl();
    this.itemsToLoad$.complete();
  }
  //#endregion

}

