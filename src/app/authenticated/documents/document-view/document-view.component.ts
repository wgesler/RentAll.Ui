import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { UtilityService } from '../../../services/utility.service';
import { DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';

@Component({
  selector: 'app-document-view',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './document-view.component.html',
  styleUrls: ['./document-view.component.scss']
})
export class DocumentViewComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('documentIframe', { static: false }) iframeRef!: ElementRef<HTMLIFrameElement>;
  
  documentId: string;
  document: DocumentResponse | null = null;
  iframeSrc: SafeResourceUrl | null = null;
  iframeKey: number = 0;
  isServiceError: boolean = false;
  canViewInBrowser: boolean = false;
  
  // Return context
  returnTo?: string;
  propertyId?: string;
  reservationId?: string;
  documentTypeId?: number;
  shouldPrint: boolean = false; // Flag to trigger print after document loads
  private iframeLoadHandler?: () => void;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['document']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private documentService: DocumentService,
    private toastr: ToastrService,
    private sanitizer: DomSanitizer,
    private documentExportService: DocumentExportService,
    private documentHtmlService: DocumentHtmlService,
    private utilityService: UtilityService
  ) {
  }

  //#region Document-View
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
    
    // Get query params for return context and print flag
    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      this.returnTo = queryParams['returnTo'];
      this.propertyId = queryParams['propertyId'];
      this.reservationId = queryParams['reservationId'];
      this.documentTypeId = queryParams['documentTypeId'] ? Number(queryParams['documentTypeId']) : undefined;
      this.shouldPrint = queryParams['print'] === 'true';
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
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Document. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'document');
      }
    });
  }

  ngAfterViewInit(): void {
    // This will be called after view init, but iframe might not exist yet
    // The listener will be set up when iframe src is set
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
    if (this.document.fileDetails?.dataUrl) {
      // Use the dataUrl directly from FileDetails
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(this.document.fileDetails.dataUrl);
      this.iframeKey++; // Force iframe refresh
      // Set up load listener if printing is needed
      if (this.shouldPrint) {
        setTimeout(() => this.setupIframeLoadListener(), 200);
      }
    } else if (this.document.fileDetails?.file && this.document.fileDetails?.contentType) {
      // Construct dataUrl from base64 file and contentType
      const dataUrl = `data:${this.document.fileDetails.contentType};base64,${this.document.fileDetails.file}`;
      this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
      this.iframeKey++; // Force iframe refresh
      // Set up load listener if printing is needed
      if (this.shouldPrint) {
        setTimeout(() => this.setupIframeLoadListener(), 200);
      }
    } else {
      // Fallback to download endpoint if FileDetails doesn't have the data
      this.documentService.downloadDocument(this.documentId).pipe(take(1)).subscribe({
        next: (blob: Blob) => {
          // Create a blob URL for the document
          const blobUrl = URL.createObjectURL(blob);
          // Sanitize the URL for use in iframe
          this.iframeSrc = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
          this.iframeKey++; // Force iframe refresh
          // Set up load listener if printing is needed
          if (this.shouldPrint) {
            setTimeout(() => this.setupIframeLoadListener(), 200);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error('Could not load document content. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      });
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
          console.log('Iframe body not ready yet, retrying...');
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
                    console.log('[IFRAME] Found print button:', selector);
                    break;
                  }
                } catch (e) {}
              }
              
              if (!printButton) {
                const allElements = document.querySelectorAll('button, a, [role="button"]');
                console.log('[IFRAME] Searching through', allElements.length, 'elements');
                for (let i = 0; i < allElements.length; i++) {
                  const elem = allElements[i];
                  const title = (elem.getAttribute('title') || '').toLowerCase();
                  const ariaLabel = (elem.getAttribute('aria-label') || '').toLowerCase();
                  const id = (elem.id || '').toLowerCase();
                  const className = (elem.className || '').toLowerCase();
                  
                  if (title.includes('print') || ariaLabel.includes('print') || 
                      id.includes('print') || className.includes('print')) {
                    printButton = elem;
                    console.log('[IFRAME] Found print button by search:', {
                      id: elem.id,
                      title: elem.getAttribute('title'),
                      tagName: elem.tagName
                    });
                    break;
                  }
                }
              }
              
              if (printButton) {
                console.log('[IFRAME] Clicking print button...');
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
                  console.log('[IFRAME] Mouse events dispatched');
                } catch (e) {
                  console.warn('[IFRAME] Mouse events failed:', e);
                }
                
                return true;
              }
              return false;
            }
            
            // Try immediately
            if (findAndClickPrintButton()) {
              console.log('[IFRAME] Print button clicked successfully');
              return;
            }
            
            // If not found, wait a bit and retry
            let retries = 0;
            const maxRetries = 15;
            const interval = setInterval(function() {
              retries++;
              if (findAndClickPrintButton()) {
                clearInterval(interval);
                console.log('[IFRAME] Print button clicked on retry', retries);
              } else if (retries >= maxRetries) {
                clearInterval(interval);
                console.log('[IFRAME] Max retries reached, print button not found');
              }
            }, 300);
          })();
        `;
        
        iframeDoc.body.appendChild(script);
        console.log('Injected script to find and click print button');
        return;
      }
    } catch (error) {
      // Cross-origin or other access error
      console.warn('Cannot access iframe content:', error);
    }

    // If script injection failed and haven't exceeded max attempts, retry
    if (attempts < maxAttempts) {
      setTimeout(() => {
        this.attemptClickPrintButton(iframe, attempts + 1, maxAttempts);
      }, 500);
    } else {
      // Fallback: use iframe's print method
      console.log('Max attempts reached, using fallback print method');
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        window.print();
      }
    }
  }

  triggerPrint(): void {
    if (!this.document) return;

    // Check if document has HTML content that can be printed
    if (this.document.fileDetails?.file && 
        (this.document.contentType?.includes('text/html') || 
         this.document.fileExtension?.toLowerCase() === 'html' ||
         this.document.fileExtension?.toLowerCase() === 'htm')) {
      try {
        // Decode base64 HTML content
        const htmlContent = atob(this.document.fileDetails.file);
        
        // Process HTML to extract styles (same as BaseDocumentComponent approach)
        const processed = this.documentHtmlService.processHtml(htmlContent, true);
        
        // Get HTML with print styles (same as BaseDocumentComponent.onPrint())
        const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(
          processed.processedHtml,
          processed.extractedStyles
        );
        
        // Print using DocumentExportService (same as BaseDocumentComponent)
        this.documentExportService.printHTML(htmlWithStyles);
      } catch (error) {
        this.toastr.error('Could not process document for printing', CommonMessage.ServiceError);
      }
    } else if (this.canViewInBrowser && this.iframeSrc) {
      // For PDFs and other viewable documents, try to click the embedded viewer's print button
      const iframe = document.querySelector('iframe.document-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        // Try to find and click the print button
        this.attemptClickPrintButton(iframe);
      } else {
        // Fallback: use window.print()
        window.print();
      }
    } else {
      // For non-viewable documents, show message
      this.toastr.warning('This document type cannot be printed directly', 'Print Not Available');
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
  //#endregion 

  //#region Utility Methods
  back(): void {
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
    
    // Clean up blob URL if it exists
    if (this.iframeSrc) {
      const url = this.iframeSrc.toString();
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    this.itemsToLoad$.complete();
  }
  //#endregion
}

