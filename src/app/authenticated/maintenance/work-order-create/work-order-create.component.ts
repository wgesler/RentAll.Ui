import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, filter, finalize, firstValueFrom, forkJoin, of, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentReloadService } from '../../documents/services/document-reload.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailService } from '../../email/services/email.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { EmailHtmlResponse } from '../../email/models/email-html.model';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { getWorkOrderType, WorkOrderType } from '../models/maintenance-enums';
import { ReceiptResponse, Split } from '../models/receipt.model';
import { WorkOrderItemResponse, WorkOrderResponse } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationListResponse, ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { OrganizationService } from '../../organizations/services/organization.service';
import { getBillingMethod } from '../../reservations/models/reservation-enum';

@Component({
  standalone: true,
  selector: 'app-work-order-create',
  imports: [CommonModule, MaterialModule],
  templateUrl: './work-order-create.component.html',
  styleUrl: './work-order-create.component.scss'
})
export class WorkOrderCreateComponent extends BaseDocumentComponent implements OnInit, OnDestroy {
  workOrderId: string | null = null;
  propertyId: string | null = null;
  returnTo: string | null = null;

  templateHtml = '';
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isSubmitting = false;
  isPageReady = false;
  organizationId = '';

  workOrder: WorkOrderResponse | null = null;
  property: PropertyResponse | null = null;
  selectedReservation: ReservationResponse | null = null;
  propertyReservations: ReservationListResponse[] = [];
  selectedContact: ContactResponse | null = null;
  contacts: ContactResponse[] = [];
  companyContacts: ContactResponse[] = [];
  additionalContactRows: { contactId: string | null }[] = [];

  propertyReceipts: ReceiptResponse[] = [];
  emailHtml: EmailHtmlResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  accountingOfficeLogo = '';
  organization: OrganizationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'workOrder', 'costCode', 'propertyAgreement', 'propertyReceipts', 'propertyReservations', 'workOrderNumber', 'contacts', 'organization', 'logo', 'previewHtml']));
  logoSourcesLoaded = { organization: false, accountingOffice: false };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workOrderService: WorkOrderService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private receiptService: ReceiptService,
    private emailHtmlService: EmailHtmlService,
    private http: HttpClient,
    private formatter: FormatterService,
    private utilityService: UtilityService,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private emailCreateDraftService: EmailCreateDraftService,
    private documentReloadService: DocumentReloadService,
    private accountingOfficeService: AccountingOfficeService,
    private organizationService: OrganizationService,
    private formatterService: FormatterService,
    documentService: DocumentService,
    documentExportService: DocumentExportService,
    documentHtmlService: DocumentHtmlService,
    emailService: EmailService,
    public override toastr: ToastrService
  ) {
    super(documentService, documentExportService, documentHtmlService, toastr, emailService);
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml('');
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() || '';

    this.itemsToLoad$.pipe(
      filter(items => items.size === 0 || (items.size === 1 && items.has('previewHtml'))),
      take(1)
    ).subscribe(() => {
      this.isPageReady = true;
      this.loadClientPartyData();
      this.tryGeneratePreview();
    });

    this.route.queryParams.pipe(take(1)).subscribe(params => {
      const workOrderId = (params['workOrderId'] ?? '').toString().trim();
      const propertyId = (params['propertyId'] ?? '').toString().trim();
      this.workOrderId = workOrderId || null;
      this.propertyId = propertyId || null;
      this.returnTo = params['returnTo'] ?? null;

      if (!this.workOrderId || !this.propertyId) {
        this.toastr.error('workOrderId and propertyId are required.', 'Missing Parameters');
        this.itemsToLoad$.next(new Set());
        return;
      }

      this.loadTemplate();
      this.loadEmailHtml();
      this.loadWorkOrder();
      this.loadContacts();
      this.loadOrganization();
      this.loadProperty();
      this.loadPropertyReservations();
     });
  }
  
  //#region Data Load Methods
  loadTemplate(): void {
    this.http.get('assets/work-order.html', { responseType: 'text' }).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'costCode'); })).subscribe({
      next: html => {
        this.templateHtml = html || '';
      },
      error: () => this.toastr.error('Unable to load work order HTML template.', 'Template Error')
    });
  }

  loadEmailHtml(): void {
    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyAgreement'); })).subscribe({
      next: html => this.emailHtml = html,
      error: () => this.emailHtml = null
    });
  }

  loadWorkOrder(): void {
    this.workOrderService.getWorkOrderById(this.workOrderId!).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder'); })).subscribe({
      next: wo => {
        this.workOrder = wo;
        this.loadPropertyReceipts();
        this.loadAccountingOffice();
        this.loadReservation(wo.reservationId);
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber');
        this.markLogoSourceLoaded('accountingOffice');
        this.toastr.error('Unable to load work order.', 'Error');
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.contacts = contacts || [];
        this.companyContacts = this.contacts.filter(c => c.entityTypeId === EntityType.Company);
        if (this.additionalContactRows.length > 0) {
          this.buildAdditionalContactRows(this.getSelectedContactIdsFromForm());
        }
      },
      error: () => {
        this.contacts = [];
        this.companyContacts = [];
        this.additionalContactRows = [];
      }
    });
  }

  loadOrganization(): void {
    if (!this.organizationId) {
      this.organization = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.markLogoSourceLoaded('organization');
      return;
    }

    this.organizationService.getOrganizationByGuid(this.organizationId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      this.markLogoSourceLoaded('organization');
    })).subscribe({
      next: organization => {
        this.organization = organization;
      },
      error: () => {
        this.organization = null;
      }
    });
  }

  loadAccountingOffice(): void {
    const officeId = this.workOrder?.officeId ?? this.property?.officeId ?? null;
    if (!officeId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber');
      this.markLogoSourceLoaded('accountingOffice');
      return;
    }
    this.accountingOfficeService.getAccountingOfficeById(officeId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrderNumber');
      this.markLogoSourceLoaded('accountingOffice');
    })).subscribe({
      next: office => {
        this.selectedAccountingOffice = office;
        this.updateAccountingOfficeLogo();
      },
      error: () => {
        this.selectedAccountingOffice = null;
        this.accountingOfficeLogo = '';
      }
    });
  }

  markLogoSourceLoaded(source: 'organization' | 'accountingOffice'): void {
    this.logoSourcesLoaded[source] = true;
    if (this.logoSourcesLoaded.organization && this.logoSourcesLoaded.accountingOffice) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'logo');
    }
  }

  updateAccountingOfficeLogo(): void {
    if (this.selectedAccountingOffice?.fileDetails?.dataUrl) {
      this.accountingOfficeLogo = this.selectedAccountingOffice.fileDetails.dataUrl;
      return;
    }
    if (this.selectedAccountingOffice?.fileDetails?.file && this.selectedAccountingOffice?.fileDetails?.contentType) {
      this.accountingOfficeLogo = `data:${this.selectedAccountingOffice.fileDetails.contentType};base64,${this.selectedAccountingOffice.fileDetails.file}`;
      return;
    }
    this.accountingOfficeLogo = '';
  }

  loadProperty(): void {
    if (!this.propertyId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: p => {
        this.property = p;
      },
      error: () => {
        this.property = null;
      }
    });
  }

  loadPropertyReceipts(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'propertyReceipts');
    if (!this.propertyId) {
      this.propertyReceipts = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
      return;
    }

    this.receiptService.getReceiptsByPropertyId(this.propertyId).pipe(take(1)).subscribe({
      next: receipts => {
        const baseReceipts = receipts ?? [];
        const includedReceiptIds = this.getIncludedReceiptIds();
        const organizationId = this.organizationId;
        if (!includedReceiptIds.length) {
          this.propertyReceipts = baseReceipts.map(receipt => this.withReceiptDataUrl(receipt));
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
          return;
        }

        const detailRequests = includedReceiptIds.map(receiptId => {
          const detail$ = organizationId? this.receiptService.getReceipt(organizationId, receiptId) : this.receiptService.getReceiptById(receiptId);
          return detail$.pipe(take(1), catchError(() => of(null)));
        });
        forkJoin(detailRequests).pipe(take(1)).subscribe({
          next: detailedReceipts => {
            const detailsById = new Map<number, ReceiptResponse>();
            detailedReceipts.forEach(receipt => {
              if (receipt?.receiptId != null) {
                detailsById.set(receipt.receiptId, receipt);
              }
            });

            const mergedReceipts = baseReceipts.map(receipt => detailsById.get(receipt.receiptId) ?? receipt);
            detailsById.forEach((receipt, receiptId) => {
              if (!mergedReceipts.some(existing => existing.receiptId === receiptId)) {
                mergedReceipts.push(receipt);
              }
            });

            this.propertyReceipts = mergedReceipts.map(receipt => this.withReceiptDataUrl(receipt));
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
          },
          error: () => {
            this.propertyReceipts = baseReceipts.map(receipt => this.withReceiptDataUrl(receipt));
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
          }
        });
      },
      error: () => {
        this.propertyReceipts = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReceipts');
      }
    });
  }

  loadPropertyReservations(): void {
    if (!this.propertyId) {
      this.propertyReservations = [];
      this.selectedReservation = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReservations');
      return;
    }

    this.reservationService.getReservationsByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyReservations'); })).subscribe({
      next: reservations => {
        this.propertyReservations = (reservations ?? []).filter(r => r.isActive !== false);
      },
      error: () => {
        this.propertyReservations = [];
        this.selectedReservation = null;
      }
    });
  }

  loadReservation(reservationId?: string): void {
    if(!reservationId)
      return;
    
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservation');
    this.reservationService.getReservationByGuid(reservationId).pipe(take(1),finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservation'); })).subscribe({
      next: (response: ReservationResponse) => {
        this.selectedReservation = response;
      },
      error: () => {
        this.selectedReservation = null;
      }
    });
  }
    
  loadClientPartyData(): void {
    if (!this.workOrder) return;

    switch(this.workOrder.workOrderTypeId)
    {
      case WorkOrderType.Tenant:
        this.selectedContact = this.getPrimaryResponsibleContact();
        break;
     case WorkOrderType.Owner:
        this.selectedContact = this.contacts.find(c => c.contactId === this.property?.owner1Id) ?? null;
        break;
     default:
        return null;
    }
  }

  buildAdditionalContactRows(_selectedContactIds: string[]): void {
  }
  //#endregion

  //#region Html to Image(s)
  tryGeneratePreview(): void {
    if (!this.templateHtml || !this.workOrder) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
      return;
    }
    const processedHtml = this.replacePlaceholders(this.templateHtml);
    const processed = this.documentHtmlService.processHtml(processedHtml, true);
    this.previewIframeHtml = processed.processedHtml;
    this.previewIframeStyles = processed.extractedStyles;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(processed.processedHtml);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'previewHtml');
    this.iframeKey++;
  }

  isPreviewHtmlPending(): boolean {
    return this.itemsToLoad$.value.has('previewHtml');
  }

  replacePlaceholders(html: string): string {
    if (!this.workOrder) {
      return html;
    }

    const total = this.workOrder.workOrderItems?.reduce((sum, item) => sum + (Number(item.itemAmount) || 0), 0) ?? 0;
    const suite = (this.property?.suite || '').trim();
    const propertyAddressLine1 = this.property
      ? [this.property.address1 || '', suite ? `#${suite}` : ''].filter(part => part.trim().length > 0).join(' ')
      : '';
    const propertyAddressLine2 = this.property
      ? `${[this.property.city || '', this.property.state || ''].filter(part => part.trim().length > 0).join(', ')}${this.property.zip ? ` ${this.property.zip}` : ''}`.trim()
      : '';
    const propertyAddress = [propertyAddressLine1, propertyAddressLine2].filter(part => part.length > 0).join(' ');
    const officeName = this.selectedAccountingOffice?.name || this.workOrder.officeName || this.property?.officeName || '';
    const typeLabel = getWorkOrderType(this.workOrder.workOrderTypeId);
    const workOrderDateDisplay = this.formatter.formatDateString(this.workOrder.workOrderDate) || '';
    const workOrderItemCount = this.workOrder.workOrderItems?.length ?? 0;
    const isTenantWorkOrder = this.workOrder.workOrderTypeId === WorkOrderType.Tenant;
    const tenantSpacingClass = isTenantWorkOrder ? (workOrderItemCount >= 6 ? 'tenant-extra-compact' : (workOrderItemCount >= 2 ? 'tenant-compact' : '')) : '';
    const accountingOfficeRemitTo = this.getAccountingOfficeRemitToLine(isTenantWorkOrder && workOrderItemCount >= 6);
    const chargeSections = this.generateWorkOrderChargeSections();
    const organizationLogoDataUrl = this.getOrganizationLogoDataUrl();
    const preferredLogoDataUrl = this.accountingOfficeLogo || organizationLogoDataUrl;

    let result = html;
    result = result.replace(/\{\{invoiceName\}\}/g, this.workOrder.workOrderId || '');
     
    // Replace responsible parties block.
    const isOrganizationWorkOrder = this.workOrder.workOrderTypeId === WorkOrderType.Organization;
    if (isOrganizationWorkOrder || this.selectedReservation || this.selectedContact) {
      result = result.replace(/\{\{responsiblePartiesBlock\}\}/g, this.getResponsiblePartiesBlock() || '');
    }

    // Replace property placeholders
    if (this.property) {
       result = result.replace(/\{\{propertySideBlock\}\}/g, this.getPropertySideBlock() || '');
    }
   
    result = result.replace(/\{\{workOrderCode\}\}/g, this.workOrder.workOrderCode ?? '');
    result = result.replace(/\{\{workOrderDateDisplay\}\}/g, workOrderDateDisplay);
    result = result.replace(/\{\{workOrderDescription\}\}/g, (this.workOrder.description ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    result = result.replace(/\{\{workOrderChargeSections\}\}/g, chargeSections);
    result = result.replace(/\{\{workOrderItems\}\}/g, chargeSections);
    result = result.replace(/\{\{workOrderItemRows\}\}/g, chargeSections);
    result = result.replace(/\{\{totalDue\}\}/g, this.formatter.currencyUsd(total));
    result = result.replace(/\{\{tenantSpacingClass\}\}/g, tenantSpacingClass);
    result = result.replace(/\{\{accountingOfficeRemitTo\}\}/g, accountingOfficeRemitTo);

    // Owner work orders should not show the Company Name row.
    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner) {
      result = result.replace(/<span class="label">Company Name:<\/span>\s*\{\{companyName\}\}<br>\s*/g, '');
    }
    // Organization work orders should not show the Client Name row.
    if (this.workOrder.workOrderTypeId === WorkOrderType.Organization) {
      result = result.replace(/<span class="label">Client Name:<\/span>\s*\{\{contactName\}\}<br>\s*/g, '');
    }
    // Owner and Company/Organization work orders should not show Payment Information section.
    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner || this.workOrder.workOrderTypeId === WorkOrderType.Organization) {
      result = result.replace(
        /<tr valign="top">\s*<td colspan="2" style="padding: 5px;">\s*<div class="border">\s*<h3 style="text-align: left; padding-left: 15px;">Payment Information<\/h3>[\s\S]*?<\/div>\s*<\/td>\s*<\/tr>/i,
        ''
      );
      result = result.replace(
        /<div class="border charges-border">/i,
        '<div class="border charges-border charges-border-fill">'
      );
    }

    result = result.replace(/\{\{officeLogoBase64\}\}/g, preferredLogoDataUrl || '');
    result = result.replace(/\{\{orgLogoBase64\}\}/g, preferredLogoDataUrl || '');
    result = result.replace(/\{\{accountingOfficeName\}\}/g, this.selectedAccountingOffice?.name || '');
    result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.getAccountingOfficeAddress() || '');
    result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, `${this.selectedAccountingOffice?.city || ''}, ${this.selectedAccountingOffice?.state || ''} ${this.selectedAccountingOffice?.zip || ''}`.trim());
    result = result.replace(/\{\{accountingOfficeEmail\}\}/g, this.selectedAccountingOffice?.email || '');
    result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatter.phoneNumber(this.selectedAccountingOffice?.phone) || '');
    result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, this.selectedAccountingOffice?.website || '');
    result = result.replace(/\{\{accountingOfficeBank\}\}/g, this.selectedAccountingOffice?.bankName || '');
    result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, this.selectedAccountingOffice?.bankRouting || '');
    result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, this.selectedAccountingOffice?.bankAccount || '');
    result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, this.selectedAccountingOffice?.bankSwiftCode || '');
    result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, this.selectedAccountingOffice?.bankAddress || '');
    result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, this.formatter.phoneNumber(this.selectedAccountingOffice?.bankPhone) || '');
    result = result.replace(/\{\{thankYou\}\}/g, this.getThankYou());

    if (!preferredLogoDataUrl) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    const receiptPagesHtml = this.generateIncludedReceiptPagesHtml();
    if (receiptPagesHtml) {
      if (/<\/body>/i.test(result)) {
        result = result.replace(/<\/body>/i, `${receiptPagesHtml}</body>`);
      } else {
        result += receiptPagesHtml;
      }
    }

    // Remove any unresolved placeholders.
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }

  generateWorkOrderChargeSections(): string {
    if (!this.workOrder?.workOrderItems?.length) {
      return '';
    }

    const usedSplitIndexesByReceipt = new Map<number, Set<number>>();
    const receiptRows: string[] = [];
    const laborRows: string[] = [];

    this.workOrder.workOrderItems.forEach(item => {
      const resolvedSplit = this.resolveSplitForWorkOrderItem(item, usedSplitIndexesByReceipt);
      const itemDescription = (resolvedSplit?.description || item.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const receiptAmountValue = this.getReceiptAmountForWorkOrderItem(item);
      const laborHours = Math.floor(Number(item.laborHours)) || 0;
      const laborCost = Number(item.laborCost) || 0;

      if (item.receiptId != null || Math.abs(receiptAmountValue) > 0.000001) {
        receiptRows.push(`              <tr class="ledger-line-row">
                <td>${itemDescription}</td>
                <td class="text-center"></td>
                <td class="text-right">${this.formatter.currencyUsd(receiptAmountValue)}</td>
                <td class="text-right">${this.formatter.currencyUsd(receiptAmountValue)}</td>
              </tr>`);
      }

      if (laborHours > 0) {
        const laborTotal = laborHours * laborCost;
        laborRows.push(`              <tr class="ledger-line-row">
                <td>${itemDescription}</td>
                <td class="text-center">${laborHours}</td>
                <td class="text-right">${this.formatter.currencyUsd(laborCost)}</td>
                <td class="text-right">${this.formatter.currencyUsd(laborTotal)}</td>
              </tr>`);
      }
    });

    const receiptsTable = `
            <h4 class="charges-section-title">Receipts</h4>
            <table class="charges-table">
              <colgroup>
                <col class="charges-col-description">
                <col class="charges-col-hours">
                <col class="charges-col-cost">
                <col class="charges-col-total">
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-center"></th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${receiptRows.length > 0 ? receiptRows.join('\n') : '<tr class="ledger-line-row"><td colspan="4">No receipt charges.</td></tr>'}
              </tbody>
            </table>`;

    const laborTable = `
            <h4 class="charges-section-title charges-section-title-labor">Labor</h4>
            <table class="charges-table">
              <colgroup>
                <col class="charges-col-description">
                <col class="charges-col-hours">
                <col class="charges-col-cost">
                <col class="charges-col-total">
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th class="text-center">Hours</th>
                  <th class="text-right">Labor Cost</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${laborRows.length > 0 ? laborRows.join('\n') : '<tr class="ledger-line-row"><td colspan="4">No labor charges.</td></tr>'}
              </tbody>
            </table>`;

    return `${receiptsTable}\n${laborTable}`;
  }

  resolveSplitForWorkOrderItem(
    item: WorkOrderItemResponse,
    usedSplitIndexesByReceipt: Map<number, Set<number>>
  ): { description: string; amount: number } | null {
    const receiptId = Number(item.receiptId);
    if (!Number.isFinite(receiptId) || receiptId <= 0) {
      return null;
    }

    const receipt = this.propertyReceipts.find(r => r.receiptId === receiptId);
    if (!receipt) {
      return null;
    }

    const currentWorkOrderCode = (this.workOrder?.workOrderCode || '').trim();
    const candidateSplits = this.getReceiptSplitsForWorkOrder(receipt, currentWorkOrderCode);
    if (!candidateSplits.length) {
      return null;
    }

    const usedIndexes = usedSplitIndexesByReceipt.get(receiptId) ?? new Set<number>();
    const availableSplits = candidateSplits.filter(candidate => !usedIndexes.has(candidate.index));
    const targetAmount = this.getReceiptAmountForWorkOrderItem(item);
    const targetDescription = (item.description || '').trim().toLowerCase();

    const findBy = (
      predicate: (candidate: { split: Split; index: number }) => boolean
    ): { split: Split; index: number } | null => availableSplits.find(predicate) ?? null;

    const amountMatches = (value: number): boolean => Math.abs(this.roundCurrency(value) - this.roundCurrency(targetAmount)) < 0.005;
    const descriptionMatches = (value: string | undefined): boolean => (value || '').trim().toLowerCase() === targetDescription;

    const chosen =
      findBy(candidate => amountMatches(Number(candidate.split.amount) || 0) && descriptionMatches(candidate.split.description)) ||
      findBy(candidate => amountMatches(Number(candidate.split.amount) || 0)) ||
      findBy(candidate => descriptionMatches(candidate.split.description)) ||
      (availableSplits[0] ?? null);

    if (!chosen) {
      return null;
    }

    usedIndexes.add(chosen.index);
    usedSplitIndexesByReceipt.set(receiptId, usedIndexes);

    return {
      description: (chosen.split.description || '').trim() || (item.description || ''),
      amount: this.roundCurrency(Number(chosen.split.amount) || 0)
    };
  }

  getReceiptSplitsForWorkOrder(receipt: ReceiptResponse, workOrderCode: string): { split: Split; index: number }[] {
    const normalizedSplits = (receipt.splits && receipt.splits.length > 0)
      ? receipt.splits
      : [{
          amount: Number(receipt.amount) || 0,
          description: receipt.description || '',
          workOrder: ''
        }];

    return normalizedSplits
      .map((split, index) => ({ split, index }))
      .filter(({ split }) => {
        const assignedCode = (split.workOrder || '').trim();
        return !assignedCode || (!!workOrderCode && assignedCode === workOrderCode);
      });
  }

  getReceiptAmountForWorkOrderItem(item: WorkOrderItemResponse): number {
    const laborHours = Math.floor(Number(item.laborHours)) || 0;
    const laborCost = Number(item.laborCost) || 0;
    const itemAmount = Number(item.itemAmount) || 0;
    return this.roundCurrency(itemAmount - laborHours * laborCost);
  }

  roundCurrency(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  generateIncludedReceiptPagesHtml(): string {
    if (!this.workOrder?.workOrderItems?.length || !this.propertyReceipts?.length) {
      return '';
    }

    const includedReceiptIds = this.getIncludedReceiptIds();
    if (!includedReceiptIds.length) {
      return '';
    }

    const receiptBlocks = includedReceiptIds.map(receiptId => {
      const receipt = this.propertyReceipts.find(r => r.receiptId === receiptId);
      if (!receipt) {
        return '';
      }

      const description = this.escapeHtml(this.getShortReceiptDescription(receipt.description));
      const amount = this.escapeHtml(this.formatter.currencyUsd(receipt.amount ?? 0));
      const imageSrc = this.getReceiptImageSrc(receipt);
      const pdfSrc = this.getReceiptPdfSrc(receipt);
      const receiptSummaryLine = `<p style="text-align: left; margin: 0 0 8px; font-size: 10pt; line-height: 1.4;">
      <span style="font-weight: 700;">Receipt Description:</span>
      <span style="font-weight: 400;">${description}</span>
      <span style="font-weight: 700; margin-left: 8px;">Amount:</span>
      <span style="font-weight: 400;">${amount}</span>
    </p>`;
      const imageHtml = imageSrc
        ? `<img src="${imageSrc}" alt="Receipt #${receipt.receiptId}" style="max-width: 100%; max-height: 3.8in; display: block; margin-top: 6px; border: 1px solid #ddd;">`
        : (pdfSrc
          ? `<embed src="${pdfSrc}" type="application/pdf" style="width: 100%; height: 3.8in; display: block; margin-top: 6px; border: 1px solid #ddd;" />`
          : '<div style="margin-top: 12px; padding: 12px; border: 1px dashed #ccc; color: #666; font-size: 10pt;">No uploaded receipt image available.</div>');

      return `<div style="padding: 8px 10px 10px;">
  ${receiptSummaryLine}
  ${imageHtml}
</div>`;
    }).filter(block => block.length > 0);

    if (!receiptBlocks.length) {
      return '';
    }

    const pages: string[] = [];
    for (let i = 0; i < receiptBlocks.length; i += 2) {
      const firstBlock = receiptBlocks[i] ?? '';
      const secondBlock = receiptBlocks[i + 1] ?? '';
      const secondBlockHtml = secondBlock
        ? `<div style="position: absolute; top: 50%; left: 0; right: 0;">${secondBlock}</div>`
        : '';
      pages.push(`<div class="page" style="position: relative; min-height: 10.5in;"><div style="padding: 0 10px;">${firstBlock}</div>${secondBlockHtml}</div>`);
    }

    return `<p class="breakhere"></p>${pages.join('\n<p class="breakhere"></p>\n')}`;
  }

  getSelectedContactIdsFromForm(): string[] {
    return [];
  }
  
  getIncludedReceiptIds(): number[] {
    if (!this.workOrder?.workOrderItems?.length) {
      return [];
    }

    return [...new Set(
      this.workOrder.workOrderItems
        .map(item => item.receiptId)
        .filter((receiptId): receiptId is number => Number(receiptId) > 0)
    )];
  }

  getShortReceiptDescription(description: string | null | undefined): string {
    const text = (description ?? '').trim();
    if (text.length <= 120) {
      return text;
    }
    return `${text.slice(0, 117)}...`;
  }

  getAccountingOfficeRemitToLine(extraCompactTenantLayout: boolean): string {
    const officeName = (this.selectedAccountingOffice?.name || '').trim();
    const officeAddress = (this.selectedAccountingOffice?.address1 || '').trim();
    const officeCityStateZip = `${this.selectedAccountingOffice?.city || ''}, ${this.selectedAccountingOffice?.state || ''} ${this.selectedAccountingOffice?.zip || ''}`.trim();
    if (extraCompactTenantLayout) {
      const fullAddressLine = [officeAddress, officeCityStateZip]
        .filter(part => part.length > 0)
        .join(', ');
      return [officeName, fullAddressLine]
        .filter(part => part.length > 0)
        .join('<br>');
    }
    return [officeName, officeAddress, officeCityStateZip]
      .filter(part => part.length > 0)
      .join('<br>');
  }

  getReceiptImageSrc(receipt: ReceiptResponse): string {
    const rawSrc = this.getRawReceiptImageSrc(receipt);
    return rawSrc.startsWith('data:image/') ? rawSrc : '';
  }

  getReceiptPdfSrc(receipt: ReceiptResponse): string {
    const rawSrc = this.getRawReceiptImageSrc(receipt);
    return rawSrc.startsWith('data:application/pdf;') ? rawSrc : '';
  }

  getRawReceiptImageSrc(receipt: ReceiptResponse): string {
    const dataUrl = receipt.fileDetails?.dataUrl;
    if (typeof dataUrl === 'string' && dataUrl.trim() !== '') {
      const normalizedDataUrl = this.normalizeImageDataUrl(dataUrl.trim());
      if (normalizedDataUrl) {
        return normalizedDataUrl;
      }
    }
    const file = receipt.fileDetails?.file;
    const contentType = receipt.fileDetails?.contentType;
    if (typeof file === 'string' && file.trim() !== '' && typeof contentType === 'string' && contentType.trim() !== '') {
      if (file.startsWith('data:')) {
        const normalizedEmbeddedFile = this.normalizeImageDataUrl(file);
        return normalizedEmbeddedFile || '';
      }
      const normalizedBase64 = this.normalizeBase64(file);
      if (!normalizedBase64) {
        return '';
      }
      const normalizedDataUrl = this.normalizeImageDataUrl(`data:${contentType};base64,${normalizedBase64}`);
      return normalizedDataUrl || '';
    }

    return '';
  }

  withReceiptDataUrl(receipt: ReceiptResponse): ReceiptResponse {
    const dataUrl = this.getRawReceiptImageSrc(receipt);
    if (!dataUrl.startsWith('data:image/') && !dataUrl.startsWith('data:application/pdf;')) {
      return receipt;
    }
    const base64Payload = dataUrl.split(',')[1] || '';
    const mimeType = (dataUrl.match(/^data:([^;]+);base64,/i)?.[1] || 'image/jpeg').toLowerCase();
    return {
      ...receipt,
      fileDetails: {
        ...(receipt.fileDetails || {}),
        dataUrl,
        file: base64Payload || receipt.fileDetails?.file || '',
        contentType: mimeType
      }
    };
  }

  normalizeImageDataUrl(dataUrl: string): string | null {
    const value = (dataUrl || '').trim();
    const match = value.match(/^data:((?:image\/[a-z0-9.+-]+)|(?:application\/pdf));base64,(.+)$/i);
    if (!match) {
      return null;
    }
    const mimeType = match[1].toLowerCase();
    const normalizedBase64 = this.normalizeBase64(match[2]);
    if (!normalizedBase64) {
      return null;
    }
    try {
      atob(normalizedBase64);
    } catch {
      return null;
    }
    return `data:${mimeType};base64,${normalizedBase64}`;
  }

  normalizeBase64(base64: string): string {
    const normalized = (base64 || '').trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!normalized) {
      return '';
    }
    const remainder = normalized.length % 4;
    if (remainder === 0) {
      return normalized;
    }
    if (remainder === 1) {
      return '';
    }
    return normalized + '='.repeat(4 - remainder);
  }

  getResponsiblePartiesBlock(): string {
    const isOrganizationWorkOrder = this.workOrder?.workOrderTypeId === WorkOrderType.Organization;
    if (isOrganizationWorkOrder || !this.selectedContact) {
      const responsibleParty = this.escapeHtml(this.organization?.name || '');
      return [
        `<span style="font-weight: bold">Client:</span> ${responsibleParty}<br>`,
        ].join('');
    }
    else {
      const pContact = this.contacts.find(c => c.contactId === this.selectedReservation?.companyId) ?? this.selectedContact;
      const responsibleParty = this.escapeHtml(this.utilityService.getResponsibleParty(this.selectedReservation, pContact));
      const responsiblePartyAddress1 = this.escapeHtml(this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, pContact));
      const responsiblePartyAddress2 = this.escapeHtml(this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, pContact));
      const responsiblePartyOccupant = this.escapeHtml(this.selectedReservation?.tenantName || '');
      const responsiblePartyRefNo = this.escapeHtml(this.selectedReservation?.referenceNo || '');
      const useSingleAddressLine = this.utilityService.isAddressSingleLine("Address:", responsiblePartyAddress1, responsiblePartyAddress2);

      return [
        `<span style="font-weight: bold">Client:</span> ${responsibleParty}<br>`,
        useSingleAddressLine
          ? `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}, ${responsiblePartyAddress2}<br>`
          : `<span style="font-weight: bold">Address:</span> ${responsiblePartyAddress1}<br>`,
        ...(responsiblePartyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${responsiblePartyAddress2}<br>`] : []),
        ...(responsiblePartyOccupant ? [`<span style="font-weight: bold">Occupant:</span> ${responsiblePartyOccupant}<br>`] : []),
        ...(responsiblePartyRefNo ? [`<span style="font-weight: bold">Ref No:</span> ${responsiblePartyRefNo}<br>`] : [])
      ].join('');
    }
  }

  getPropertySideBlock(): string {
    if (!this.property) 
      return '';
  
    const propertyAddress1 = this.escapeHtml(this.getPropertyAddress1());
    const propertyAddress2 = this.escapeHtml(this.getPropertyAddress2());
    const propertyCode = this.escapeHtml(this.property.propertyCode || '');
    const billingType = this.escapeHtml(getBillingMethod(this.selectedReservation?.billingMethodId));
    const useSingleAddressLine = this.utilityService.isAddressSingleLine("Address:", propertyAddress1, propertyAddress2);

    return [
      `<span style="font-weight: bold">Property Code:</span> ${propertyCode}<br>`,
      useSingleAddressLine
        ? `<span style="font-weight: bold">Address:</span> ${propertyAddress1}, ${propertyAddress2}<br>`
        : `<span style="font-weight: bold">Address:</span> ${propertyAddress1}<br>`,
      ...(propertyAddress2 ? [`&nbsp;&nbsp;&nbsp;&nbsp;${propertyAddress2}<br>`] : []),
      ...(billingType ? [`<span style="font-weight: bold">Billing Type:</span> ${billingType}<br>`] : [])
    ].join('');
  }

  getResponsibleParty(): string {
    return this.utilityService.getResponsibleParty(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyAddress1() {
    return this.utilityService.getResponsiblePartyAddress1(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyAddress2() {
    return this.utilityService.getResponsiblePartyAddress2(this.selectedReservation, this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyPhone() {
    return this.utilityService.getResponsiblePartyPhone(this.getPrimaryResponsibleContact());
  }

  getResponsiblePartyEmail() {
    return this.utilityService.getResponsiblePartyEmail(this.getPrimaryResponsibleContact());
  }

  getPropertyAddress1() {
    if (!this.property) {
      return '';
    }
    return [this.property.address1, this.property.suite]
      .map(part => String(part ?? '').trim())
      .filter(part => part.length > 0)
      .join(' ');
  }

  getPropertyAddress2() {
    if (!this.property) {
      return '';
    }
    const city = String(this.property.city ?? '').trim();
    const state = String(this.property.state ?? '').trim();
    const zip = String(this.property.zip ?? '').trim();
    const stateZip = [state, zip].filter(part => part.length > 0).join(' ');
    return [city, stateZip].filter(part => part.length > 0).join(', ');
  }

  getThankYou() {
    if (!this.workOrder || this.workOrder.workOrderTypeId !== WorkOrderType.Tenant) {
      return '';
    }
    const officeName = this.selectedAccountingOffice?.name || '';
    return officeName ? `Thank you for staying with ${officeName}.` : '';
  }
  
  getPrimaryResponsibleContact(): ContactResponse | null {
    return this.getResponsibleContacts()[0] || null;
  }

  getResponsibleContacts(): ContactResponse[] {
    const selectedContactIds = this.selectedReservation?.contactIds || [];
    const uniqueContactIds = new Set<string>();
    const contacts: ContactResponse[] = [];

    selectedContactIds.forEach(contactId => {
      const normalizedContactId = String(contactId || '').trim();
      if (!normalizedContactId || uniqueContactIds.has(normalizedContactId)) {
        return;
      }
      const reservationContact = this.contacts.find(c => c.contactId === normalizedContactId);
      if (reservationContact) {
        uniqueContactIds.add(normalizedContactId);
        contacts.push(reservationContact);
      }
    });

    if (contacts.length === 0 && this.selectedContact) {
      contacts.push(this.selectedContact);
    }

    return contacts;
  }

  escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getAccountingOfficeAddress(): string {
    if (!this.selectedAccountingOffice) return '';
    return `${this.selectedAccountingOffice.address1 || ''} ${this.selectedAccountingOffice.suite || ''}`.trim(); 
  }

  getOrganizationLogoDataUrl(): string {
    if (this.organization?.fileDetails?.dataUrl) {
      return this.organization.fileDetails.dataUrl;
    }
    if (this.organization?.fileDetails?.file && this.organization?.fileDetails?.contentType) {
      return `data:${this.organization.fileDetails.contentType};base64,${this.organization.fileDetails.file}`;
    }
    return '';
  }

  getOrganizationAddress1(): string {
    if (!this.organization) return '';

    const address1 = String(this.organization?.address1 ?? '').trim();
    const suite = String(this.organization?.suite ?? '').trim();
    return suite ? `${address1}, ${suite}` : address1;
  }
   
  getOrganizationAddress2(): string {
    if (!this.organization) return '';
    return `${this.organization.city || ''}, ${this.organization.state || ''} ${this.organization.zip || ''}`.trim();
  }

  getEmailRecipientByType(): { email: string; name: string, salutationName: string } {
    if (!this.workOrder) {
      return { email: '', name: '', salutationName: '' };
    }

    return {  
      email: this.selectedContact?.email || '',
      name: this.selectedContact?.fullName || `${this.selectedContact?.firstName || ''} ${this.selectedContact?.lastName || ''}`.trim(),
      salutationName: `${this.selectedContact?.firstName || ''}`.trim()
    };
  }

  getWorkOrderFileName(): string {
    const propertyCode = (this.property?.propertyCode || this.workOrder?.propertyCode || 'Property').replace(/[^a-zA-Z0-9-]/g, '');
    const workOrderCode = (this.workOrder?.workOrderId || 'WorkOrder').replace(/[^a-zA-Z0-9-]/g, '');
    const date = this.utilityService.todayAsCalendarDateString();
    return `WorkOrder_${propertyCode}_${workOrderCode}_${date}.pdf`;
  }
  //#endregion

  //#region Base Class Overrides
  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.organizationId || null,
      selectedOfficeId: this.workOrder?.officeId || this.property?.officeId || null,
      selectedOfficeName: this.workOrder?.officeName || this.property?.officeName || '',
      selectedReservationId: null,
      propertyId: this.workOrder?.propertyId || this.property?.propertyId || null,
      contacts: [] as ContactResponse[],
      isDownloading: this.isDownloading
    };
  }

  protected setDownloading(value: boolean): void {
    this.isDownloading = value;
  }

  override onPrint(): void {
    super.onPrint('No work order preview is available to print.');
  }

  async saveWorkOrderDocument(): Promise<void> {
    if (!this.previewIframeHtml || !this.workOrder) {
      this.toastr.warning('No work order preview is available to save.', 'No Preview');
      return;
    }

    this.isSubmitting = true;
    try {
      const config = this.getDocumentConfig();
      if (!config.organizationId || !config.selectedOfficeId) {
        this.toastr.warning('Work order office/organization is not available.', 'Missing Data');
        return;
      }

      const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
        config.previewIframeHtml,
        config.previewIframeStyles
      );

      const generateDto: GenerateDocumentFromHtmlDto = {
        htmlContent: htmlWithStyles,
        organizationId: config.organizationId,
        officeId: config.selectedOfficeId,
        officeName: config.selectedOfficeName || '',
        propertyId: config.propertyId || null,
        reservationId: this.workOrder.reservationId ?? this.selectedReservation?.reservationId ?? null,
        reservationCode: this.workOrder.reservationCode ?? this.selectedReservation?.reservationCode ?? null,
        documentTypeId: DocumentType.WorkOrder,
        fileName: this.getWorkOrderFileName(),
        generatePdf: true
      };

      await firstValueFrom(this.documentService.generate(generateDto).pipe(take(1)));
      this.toastr.success('Document generated successfully', 'Success');
      this.documentReloadService.triggerReload();
      this.iframeKey++;
    } catch (error) {
      const detail = this.utilityService.extractApiErrorMessage(error);
      this.toastr.error(
        detail ? `Document generation failed. ${detail}` : 'Document generation failed. Please try again.',
        'Error'
      );
      this.iframeKey++;
    } finally {
      this.isSubmitting = false;
    }
  }

  override async onDownload(): Promise<void> {
    if (!this.workOrder) {
      this.toastr.warning('No work order selected.', 'No Work Order');
      return;
    }
    const fileName = this.getWorkOrderFileName();

    const downloadConfig: DownloadConfig = {
      fileName,
      documentType: DocumentType.WorkOrder,
      noPreviewMessage: 'No work order preview is available to download.',
      noSelectionMessage: 'Work order office/organization is not available.'
    };
    await super.onDownload(downloadConfig);
  }

  override async onEmail(): Promise<void> {
    if (!this.workOrder) {
      this.toastr.warning('No work order selected.', 'No Work Order');
      return;
    }
    const currentUser = this.authService.getUser();
    const fromEmail = currentUser?.email || '';
    const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
    const recipient = this.getEmailRecipientByType();
    const accountingName = this.selectedAccountingOffice?.name;
    const accountingPhone = this.formatterService.phoneNumber(this.selectedAccountingOffice?.phone) || '';

    const subject = (this.emailHtml?.invoiceSubject || 'Work Order {{workOrderId}}')
      .replace(/\{\{invoiceCode\}\}/g, this.workOrder.workOrderId || '')
      .replace(/\{\{workOrderId\}\}/g, this.workOrder.workOrderId || '');
    const body = (this.emailHtml?.invoice || '<p>Please find your work order attached.</p>')
      .replace(/\{\{salutationName\}\}/g, recipient.salutationName)
      .replace(/\{\{fromName\}\}/g, fromName)
      .replace(/\{\{fromEmail\}\}/g, fromEmail)
      .replace(/\{\{accountingName\}\}/g, accountingName)
      .replace(/\{\{accountingPhone\}\}/g, accountingPhone);

    const emailConfig: EmailConfig = {
      subject,
      toEmail: recipient.email,
      toName: recipient.name,
      fromEmail,
      fromName,
      documentType: DocumentType.WorkOrder,
      emailType: EmailType.Other,
      plainTextContent: '',
      htmlContent: body,
      fileDetails: {
        fileName: this.getWorkOrderFileName(),
        contentType: 'application/pdf',
        file: ''
      }
    };

    this.emailCreateDraftService.setDraft({
      emailConfig,
      documentConfig: this.getDocumentConfig(),
      returnUrl: this.router.url
    });
    this.router.navigateByUrl(RouterUrl.EmailCreate);
  }
  //#endregion

  //#region Utility Methods
  goBack(): void {
    const workOrderId = this.workOrder?.workOrderId ?? this.workOrderId;
    const propertyId = this.property?.propertyId || this.workOrder?.propertyId || this.propertyId;
    if (this.returnTo === 'work-order' && workOrderId) {
      if (propertyId) {
        const path = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
        this.router.navigate([path], {
          queryParams: {
            tab: 3,
            workOrderId
          }
        });
        return;
      }
      const fallbackPath = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [workOrderId]);
      this.router.navigate([fallbackPath]);
      return;
    }
    if (this.returnTo === 'work-order-list' && propertyId) {
      const path = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
      this.router.navigate([path], { queryParams: { tab: 3 } });
      return;
    }
    if (workOrderId && propertyId) {
      const path = '/' + RouterUrl.replaceTokens(RouterUrl.Maintenance, [propertyId]);
      this.router.navigate([path], {
        queryParams: {
          tab: 3,
          workOrderId
        }
      });
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

