import { AsyncPipe, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, finalize, map, Observable, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { ContactResponse } from '../../contacts/models/contact.model';
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
import { ReceiptResponse } from '../models/receipt.model';
import { WorkOrderResponse } from '../models/work-order.model';
import { ReceiptService } from '../services/receipt.service';
import { WorkOrderService } from '../services/work-order.service';
import { BaseDocumentComponent, DocumentConfig, DownloadConfig, EmailConfig } from '../../shared/base-document.component';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OrganizationService } from '../../organizations/services/organization.service';

@Component({
  standalone: true,
  selector: 'app-work-order-create',
  imports: [CommonModule, MaterialModule, AsyncPipe],
  templateUrl: './work-order-create.component.html',
  styleUrl: './work-order-create.component.scss'
})
export class WorkOrderCreateComponent extends BaseDocumentComponent implements OnInit {
  workOrderId: string | null = null;
  propertyId: string | null = null;

  workOrder: WorkOrderResponse | null = null;
  property: PropertyResponse | null = null;
  reservation: ReservationResponse | null = null;
  reservationContact: ContactResponse | null = null;
  owner1Contact: ContactResponse | null = null;
  organization: OrganizationResponse | null = null;
  /** Property receipts for looking up receipt amount by receiptId in document rows. */
  propertyReceipts: ReceiptResponse[] = [];
  emailHtml: EmailHtmlResponse | null = null;
  selectedAccountingOffice: AccountingOfficeResponse | null = null;
  accountingOfficeLogo = '';

  templateHtml = '';
  previewIframeHtml = '';
  previewIframeStyles = '';
  safePreviewIframeHtml: SafeHtml = '';
  iframeKey = 0;
  isDownloading = false;
  isSubmitting = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['params', 'template', 'workOrder', 'property', 'emailHtml', 'accountingOffice']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workOrderService: WorkOrderService,
    private propertyService: PropertyService,
    private reservationService: ReservationService,
    private contactService: ContactService,
    private organizationService: OrganizationService,
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
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      this.workOrderId = params['workOrderId'] ?? null;
      this.propertyId = params['propertyId'] ?? null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'params');
      this.loadData();
    });
  }

  loadData(): void {
    this.http.get('assets/work-order.html', { responseType: 'text' }).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'template');
    })).subscribe({
      next: html => {
        this.templateHtml = html || '';
        this.tryGeneratePreview();
      },
      error: () => this.toastr.error('Unable to load work order HTML template.', 'Template Error')
    });

    this.emailHtmlService.getEmailHtml().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'emailHtml');
    })).subscribe({
      next: html => this.emailHtml = html,
      error: () => this.emailHtml = null
    });

    if (!this.workOrderId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffice');
      this.toastr.warning('Work Order Id is required to view this page.', 'Missing Work Order');
      return;
    }

    const workOrder$ = this.workOrderService.getWorkOrderById(this.workOrderId).pipe(take(1));
    workOrder$.pipe(finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'workOrder');
    })).subscribe({
      next: wo => {
        this.workOrder = wo;
        if (!this.propertyId && wo.propertyId) {
          this.propertyId = wo.propertyId;
        }
        this.loadClientPartyData();
        this.tryGeneratePreview();
        this.loadProperty();
        this.loadPropertyReceipts();
        this.loadAccountingOffice();
      },
      error: () => this.toastr.error('Unable to load work order.', 'Error')
    });
  }

  loadAccountingOffice(): void {
    this.accountingOfficeService.getAccountingOffices().pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffice');
    })).subscribe({
      next: offices => {
        const activeOffices = (offices || []).filter(o => o.isActive !== false);
        const officeId = this.workOrder?.officeId ?? this.property?.officeId ?? 1;
        this.selectedAccountingOffice =
          activeOffices.find(o => o.officeId === officeId) ||
          activeOffices.find(o => o.officeId === 1) ||
          activeOffices[0] ||
          null;
        this.updateAccountingOfficeLogo();
        this.tryGeneratePreview();
      },
      error: () => {
        this.selectedAccountingOffice = null;
        this.accountingOfficeLogo = '';
        this.tryGeneratePreview();
      }
    });
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
      this.tryGeneratePreview();
      return;
    }
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
    })).subscribe({
      next: p => {
        this.property = p;
        this.loadClientPartyData();
        this.tryGeneratePreview();
      },
      error: () => {
        this.property = null;
        this.tryGeneratePreview();
      }
    });
  }

  loadPropertyReceipts(): void {
    const propertyId = this.propertyId ?? this.workOrder?.propertyId ?? null;
    if (!propertyId) return;
    this.receiptService.getReceiptsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: receipts => {
        this.propertyReceipts = receipts ?? [];
        this.tryGeneratePreview();
      },
      error: () => {
        this.propertyReceipts = [];
        this.tryGeneratePreview();
      }
    });
  }

  tryGeneratePreview(): void {
    if (!this.templateHtml || !this.workOrder) {
      return;
    }
    const processedHtml = this.replacePlaceholders(this.templateHtml);
    const processed = this.documentHtmlService.processHtml(processedHtml, true);
    this.previewIframeHtml = processed.processedHtml;
    this.previewIframeStyles = processed.extractedStyles;
    this.safePreviewIframeHtml = this.sanitizer.bypassSecurityTrustHtml(processed.processedHtml);
    this.iframeKey++;
  }

  replacePlaceholders(html: string): string {
    if (!this.workOrder) {
      return html;
    }

    const total = this.workOrder.workOrderItems?.reduce((sum, item) => sum + (Number(item.itemAmount) || 0), 0) ?? 0;
    const propertyAddress = this.property
      ? `${this.property.address1 || ''} ${this.property.city || ''}, ${this.property.state || ''} ${this.property.zip || ''}`.trim()
      : '';
    const officeName = this.selectedAccountingOffice?.name || this.workOrder.officeName || this.property?.officeName || '';
    const typeLabel = getWorkOrderType(this.workOrder.workOrderTypeId);
    const clientDetails = this.getClientDetailsByType();
    const rows = this.generateWorkOrderRows();
    const officeLogoDataUrl = this.accountingOfficeLogo;

    let result = html;
    result = result.replace(/\{\{invoiceName\}\}/g, this.workOrder.workOrderId || '');
    result = result.replace(/\{\{reservationCode\}\}/g, this.reservation?.reservationCode || this.property?.propertyCode || this.workOrder.propertyCode || '');
    result = result.replace(/\{\{propertyCode\}\}/g, this.property?.propertyCode || this.workOrder.propertyCode || '');
    result = result.replace(/\{\{contactName\}\}/g, clientDetails.contactName);
    result = result.replace(/\{\{contactAddress\}\}/g, clientDetails.contactAddress);
    result = result.replace(/\{\{propertyAddress\}\}/g, propertyAddress);
    result = result.replace(/\{\{propertySuite\}\}/g, this.property?.suite || '');
    result = result.replace(/\{\{billingMethod\}\}/g, typeLabel);
    result = result.replace(/\{\{workOrderCode\}\}/g, this.workOrder.workOrderCode ?? '');
    result = result.replace(/\{\{workOrderDescription\}\}/g, (this.workOrder.description ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    result = result.replace(/\{\{workOrderItems\}\}/g, rows);
    result = result.replace(/\{\{workOrderItemRows\}\}/g, rows);
    result = result.replace(/\{\{totalDue\}\}/g, this.formatter.currency(total));

    // Owner work orders should not show the Company Name row.
    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner) {
      result = result.replace(/<span class="label">Company Name:<\/span>\s*\{\{companyName\}\}<br>\s*/g, '');
    }
    // Organization work orders should not show the Client Name row.
    if (this.workOrder.workOrderTypeId === WorkOrderType.Organization) {
      result = result.replace(/<span class="label">Client Name:<\/span>\s*\{\{contactName\}\}<br>\s*/g, '');
    }

    result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoDataUrl || '');
    result = result.replace(/\{\{orgLogoBase64\}\}/g, officeLogoDataUrl || '');
    result = result.replace(/\{\{accountingOfficeName\}\}/g, officeName);
    result = result.replace(/\{\{accountingOfficeAddress\}\}/g, this.selectedAccountingOffice?.address1 || '');
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

    if (!officeLogoDataUrl) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Remove any unresolved placeholders.
    result = result.replace(/\{\{[^}]+\}\}/g, '');
    return result;
  }

  generateWorkOrderRows(): string {
    if (!this.workOrder?.workOrderItems?.length) {
      return '';
    }
    const date = this.formatter.formatDateString(this.workOrder.modifiedOn) || '';
    return this.workOrder.workOrderItems.map(item => {
      const itemDescription = (item.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const receipt = item.receiptId != null ? this.propertyReceipts.find(r => r.receiptId === item.receiptId) : null;
      const receiptAmount = this.formatter.currency(receipt?.amount ?? 0);
      const itemHours = this.formatter.currency(item.laborHours || 0);
      const itemCost = this.formatter.currency(item.laborCost || 0);
      const itemTotal = this.formatter.currency(item.itemAmount || 0);
       return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${itemDescription}</td>
                <td>${receiptAmount}</td>
                <td>${itemHours}</td>
                <td>${itemCost}</td>
                <td class="text-right">${itemTotal}</td>
              </tr>`;
    }).join('\n');
  }

  loadClientPartyData(): void {
    if (!this.workOrder) return;

    if (this.workOrder.workOrderTypeId === WorkOrderType.Tenant && this.workOrder.reservationId) {
      this.reservationService.getReservationByGuid(this.workOrder.reservationId).pipe(take(1)).subscribe({
        next: reservation => {
          this.reservation = reservation;
          if (reservation.contactId) {
            this.contactService.getContactByGuid(reservation.contactId).pipe(take(1)).subscribe({
              next: contact => {
                this.reservationContact = contact;
                this.tryGeneratePreview();
              },
              error: () => {
                this.reservationContact = null;
                this.tryGeneratePreview();
              }
            });
          } else {
            this.reservationContact = null;
            this.tryGeneratePreview();
          }
        },
        error: () => {
          this.reservation = null;
          this.reservationContact = null;
          this.tryGeneratePreview();
        }
      });
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner && this.property?.owner1Id) {
      this.contactService.getContactByGuid(this.property.owner1Id).pipe(take(1)).subscribe({
        next: owner => {
          this.owner1Contact = owner;
          this.tryGeneratePreview();
        },
        error: () => {
          this.owner1Contact = null;
          this.tryGeneratePreview();
        }
      });
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Organization && this.workOrder.organizationId) {
      this.organizationService.getOrganizationByGuid(this.workOrder.organizationId).pipe(take(1)).subscribe({
        next: org => {
          this.organization = org;
          this.tryGeneratePreview();
        },
        error: () => {
          this.organization = null;
          this.tryGeneratePreview();
        }
      });
    }
  }

  getClientDetailsByType(): { contactName: string; contactAddress: string } {
    if (!this.workOrder) {
      return { contactName: '', contactAddress: '' };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Tenant) {
      const contactName = this.reservationContact?.fullName || this.reservation?.tenantName || '';
      const contactAddress = this.getContactAddress(this.reservationContact);
      return { contactName, contactAddress };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner) {
      return {
        contactName: this.owner1Contact?.fullName || '',
        contactAddress: this.getContactAddress(this.owner1Contact)
      };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Organization) {
      return {
        contactName: this.organization?.name || '',
        contactAddress: this.getOrganizationAddress()
      };
    }

    return { contactName: '', contactAddress: '' };
  }

  getContactAddress(contact: ContactResponse | null): string {
    if (!contact) return '';
    return `${contact.address1 || ''} ${contact.city || ''}, ${contact.state || ''} ${contact.zip || ''}`.trim();
  }

  getOrganizationAddress(): string {
    if (!this.organization) return '';
    return `${this.organization.address1 || ''} ${this.organization.city || ''}, ${this.organization.state || ''} ${this.organization.zip || ''}`.trim();
  }

  protected getDocumentConfig(): DocumentConfig {
    return {
      previewIframeHtml: this.previewIframeHtml,
      previewIframeStyles: this.previewIframeStyles,
      organizationId: this.workOrder?.organizationId || this.property?.organizationId || this.authService.getUser()?.organizationId || null,
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

  saveWorkOrderDocument(): void {
    if (!this.previewIframeHtml || !this.workOrder) {
      this.toastr.warning('No work order preview is available to save.', 'No Preview');
      return;
    }

    const config = this.getDocumentConfig();
    if (!config.organizationId || !config.selectedOfficeId) {
      this.toastr.warning('Work order office/organization is not available.', 'Missing Data');
      return;
    }

    this.isSubmitting = true;

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
      reservationId: this.workOrder.reservationId ?? this.reservation?.reservationId ?? null,
      reservationCode: this.workOrder.reservationCode ?? this.reservation?.reservationCode ?? null,
      documentTypeId: DocumentType.WorkOrder,
      fileName: this.getWorkOrderFileName()
    };

    this.documentService.generate(generateDto).pipe(
      take(1),
      finalize(() => {
        this.isSubmitting = false;
      })
    ).subscribe({
      next: () => {
        this.toastr.success('Document generated successfully', 'Success');
        this.documentReloadService.triggerReload();
        this.iframeKey++;
      },
      error: () => {
        this.toastr.error('Document generation failed. Please try again.', 'Error');
        this.iframeKey++;
      }
    });
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
    const fallbackToEmail = recipient.email || fromEmail;
    const fallbackToName = recipient.name || fromName || 'Recipient';
    const subject = (this.emailHtml?.invoiceSubject || 'Work Order {{workOrderId}}')
      .replace(/\{\{invoiceCode\}\}/g, this.workOrder.workOrderId || '')
      .replace(/\{\{workOrderId\}\}/g, this.workOrder.workOrderId || '');
    const body = (this.emailHtml?.invoice || '<p>Please find your work order attached.</p>')
      .replace(/\{\{toName\}\}/g, fallbackToName)
      .replace(/\{\{accountingName\}\}/g, this.workOrder.officeName || '')
      .replace(/\{\{accountingPhone\}\}/g, this.formatter.phoneNumber(this.property?.phone) || '');

    const emailConfig: EmailConfig = {
      subject,
      toEmail: fallbackToEmail,
      toName: fallbackToName,
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

  getEmailRecipientByType(): { email: string; name: string } {
    if (!this.workOrder) {
      return { email: '', name: '' };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Owner) {
      return {
        email: this.owner1Contact?.email || '',
        name: this.owner1Contact?.fullName || `${this.owner1Contact?.firstName || ''} ${this.owner1Contact?.lastName || ''}`.trim()
      };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Tenant) {
      return {
        email: this.reservationContact?.email || '',
        name: this.reservationContact?.fullName || `${this.reservationContact?.firstName || ''} ${this.reservationContact?.lastName || ''}`.trim()
      };
    }

    if (this.workOrder.workOrderTypeId === WorkOrderType.Organization) {
      return {
        email: this.organization?.contactEmail || '',
        name: this.organization?.contactName || this.organization?.name || ''
      };
    }

    return { email: '', name: '' };
  }

  getWorkOrderFileName(): string {
    const propertyCode = (this.property?.propertyCode || this.workOrder?.propertyCode || 'Property').replace(/[^a-zA-Z0-9-]/g, '');
    const workOrderCode = (this.workOrder?.workOrderId || 'WorkOrder').replace(/[^a-zA-Z0-9-]/g, '');
    const date = new Date().toISOString().split('T')[0];
    return `WorkOrder_${propertyCode}_${workOrderCode}_${date}.pdf`;
  }

  goBack(): void {
    if (this.workOrder?.workOrderId) {
      const path = '/' + RouterUrl.replaceTokens(RouterUrl.MaintenanceWorkOrder, [this.workOrder.workOrderId]);
      this.router.navigate([path], { queryParams: { propertyId: this.property?.propertyId || this.workOrder.propertyId } });
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }
}

