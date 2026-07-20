import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, forkJoin, map, of, switchMap, take, throwError, catchError, tap } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { FileDetails, GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { EmailType } from '../../email/models/email.enum';
import { EmailHtmlService } from '../../email/services/email-html.service';
import { EmailCreateDraftService } from '../../email/services/email-create-draft.service';
import { DocumentConfig, EmailConfig } from '../../shared/base-document.component';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { TransactionType, InvoiceMethod, normalizeInvoiceMethodId } from '../models/accounting-enum';
import { CostCodesResponse } from '../models/cost-codes.model';
import { InvoiceResponse } from '../models/invoice.model';
import { CostCodesService } from './cost-codes.service';
import { InvoiceHtmlBuilderService } from './invoice-html-builder.service';
import { InvoicePrintContext } from '../models/invoice-print-context.model';
import { InvoiceService } from './invoice.service';

interface InvoiceDownloadBaseData {
  invoice: InvoiceResponse;
  reservation: ReservationResponse;
  organization: OrganizationResponse | null;
  accountingOffices: AccountingOfficeResponse[];
  offices: OfficeResponse[];
  contacts: ContactResponse[];
  costCodes: CostCodesResponse[];
}

interface InvoiceDownloadData extends InvoiceDownloadBaseData {
  office: OfficeResponse;
  property: PropertyResponse;
  propertyHtml: PropertyHtmlResponse;
  canonicalInvoiceTemplate: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceDocumentService {
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private invoiceService = inject(InvoiceService);
  private reservationService = inject(ReservationService);
  private propertyService = inject(PropertyService);
  private propertyHtmlService = inject(PropertyHtmlService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private commonService = inject(CommonService);
  private contactService = inject(ContactService);
  private costCodesService = inject(CostCodesService);
  private invoiceHtmlBuilder = inject(InvoiceHtmlBuilderService);
  private documentService = inject(DocumentService);
  private documentHtmlService = inject(DocumentHtmlService);
  private documentExportService = inject(DocumentExportService);
  private utilityService = inject(UtilityService);
  private toastr = inject(ToastrService);
  private formatterService = inject(FormatterService);
  private emailHtmlService = inject(EmailHtmlService);
  private emailCreateDraftService = inject(EmailCreateDraftService);
  private router = inject(Router);


  downloadInvoicePdf(invoiceSummary: InvoiceResponse): Observable<void> {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';

    return this.loadInvoiceDocumentData(invoiceSummary).pipe(
      switchMap((data: InvoiceDownloadData) => {
        const { processedHtml, extractedStyles } = this.buildPrintableHtml(data);
        const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(processedHtml, extractedStyles);
        const invoiceCode = data.invoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || data.invoice.invoiceId;
        const fileName = `Invoice_${invoiceCode}_${this.utilityService.todayAsCalendarDateString()}.pdf`;

        const generateDto: GenerateDocumentFromHtmlDto = {
          htmlContent: htmlWithStyles,
          organizationId: data.organization?.organizationId || organizationId,
          officeId: data.office.officeId,
          officeName: data.office.name || '',
          propertyId: data.property.propertyId,
          reservationId: data.reservation.reservationId,
          documentTypeId: Number(DocumentType.Other),
          fileName
        };

        return this.documentService.generateDownload(generateDto).pipe(
          take(1),
          map(blob => {
            this.documentExportService.downloadBlob(blob, fileName);
          })
        );
      })
    );
  }

  printInvoice(invoiceSummary: InvoiceResponse): Observable<void> {
    return this.loadInvoiceDocumentData(invoiceSummary).pipe(
      map((data: InvoiceDownloadData) => {
        const { processedHtml, extractedStyles } = this.buildPrintableHtml(data);
        const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(processedHtml, extractedStyles);
        this.documentExportService.printHTML(htmlWithStyles);
      })
    );
  }

  applyReservationInvoiceMethodAfterCreate(invoice: InvoiceResponse): Observable<InvoiceResponse> {
    const reservationId = (invoice.reservationId || '').trim();
    if (!invoice.invoiceId || !reservationId) {
      return of(invoice);
    }

    return this.reservationService.getReservationByGuid(reservationId).pipe(
      take(1),
      switchMap(reservation => this.executeInvoiceMethodForReservation(invoice, reservation)),
      catchError(() => of(invoice))
    );
  }

  executeInvoiceMethodForReservation(invoice: InvoiceResponse, reservation: ReservationResponse): Observable<InvoiceResponse> {
    const method = normalizeInvoiceMethodId(reservation.invoiceMethodId);
    switch (method) {
      case InvoiceMethod.Download:
        return this.downloadInvoicePdf(invoice).pipe(
          tap(() => this.toastr.success('Invoice downloaded.', CommonMessage.Success)),
          catchError((err: Error) => {
            this.toastr.error(err?.message || 'Failed to download invoice.', CommonMessage.Error);
            return of(undefined);
          }),
          map(() => invoice)
        );
      case InvoiceMethod.Print:
        return this.printInvoice(invoice).pipe(
          catchError((err: Error) => {
            this.toastr.error(err?.message || 'Failed to print invoice.', CommonMessage.Error);
            return of(undefined);
          }),
          map(() => invoice)
        );
      case InvoiceMethod.Email:
        return this.openInvoiceEmailDraft(invoice).pipe(
          catchError((err: Error) => {
            this.toastr.error(err?.message || 'Failed to prepare invoice email.', CommonMessage.Error);
            return of(undefined);
          }),
          map(() => invoice)
        );
      default:
        return of(invoice);
    }
  }

  openInvoiceEmailDraft(invoice: InvoiceResponse): Observable<void> {
    return this.loadInvoiceDocumentData(invoice).pipe(
      switchMap(data => this.emailHtmlService.getEmailHtml().pipe(take(1), map(emailHtml => ({ data, emailHtml })))),
      switchMap(({ data, emailHtml }) => {
        const reservationContactId = this.getPrimaryReservationContactId(data.reservation);
        const contact = reservationContactId
          ? data.contacts.find(item => item.contactId === reservationContactId) ?? null
          : null;
        if (!contact) {
          return throwError(() => new Error('No contact found for this reservation.'));
        }

        const isCompany = contact.entityTypeId === EntityType.Company;
        const toEmail = (isCompany ? contact.companyEmail : contact.email)?.trim() || '';
        if (!toEmail) {
          return throwError(() => new Error('Contact does not have an email address.'));
        }

        const selectedAccountingOffice = data.accountingOffices.find(item => item.officeId === data.office.officeId) ?? null;
        const currentUser = this.authService.getUser();
        const fromEmail = currentUser?.email || '';
        const fromName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
        const toName = isCompany ? `${contact.companyName || ''}`.trim() : `${contact.fullName || ''}`.trim();
        const ccEmail = isCompany ? (contact.email || '') : null;
        const ccEmails = ccEmail ? [ccEmail] : [];
        const salutationName = `${contact.firstName || ''}`.trim();
        const tenantName = `${data.reservation.tenantName || ''}`.trim();
        const accountingName = selectedAccountingOffice?.name || '';
        const accountingPhone = this.formatterService.phoneNumber(selectedAccountingOffice?.phone) || '';
        const invoiceCode = data.invoice.invoiceCode?.replace(/[^a-zA-Z0-9-]/g, '') || data.invoice.invoiceId || 'Invoice';
        const attachmentFileName = `Invoice_${invoiceCode}_${this.utilityService.todayAsCalendarDateString()}.pdf`;
        const emailTemplateHtml = isCompany ? (emailHtml?.corporateInvoice || '') : (emailHtml?.invoice || '');
        const emailSubject = (emailHtml?.invoiceSubject || '').trim().replace(/\{\{invoiceCode\}\}/g, invoiceCode || '');
        const emailBodyHtml = emailTemplateHtml
          .replace(/\{\{salutationName\}\}/g, salutationName)
          .replace(/\{\{tenantName\}\}/g, tenantName)
          .replace(/\{\{fromName\}\}/g, fromName)
          .replace(/\{\{companyName\}\}/g, data.organization?.name || '')
          .replace(/\{\{accountingName\}\}/g, accountingName)
          .replace(/\{\{accountingPhone\}\}/g, accountingPhone);
        const { processedHtml, extractedStyles } = this.buildPrintableHtml(data);
        const emailConfig: EmailConfig = {
          subject: emailSubject,
          toEmail,
          toName,
          fromEmail,
          fromName,
          ccEmails,
          documentType: DocumentType.Invoice,
          emailType: EmailType.Invoice,
          plainTextContent: '',
          htmlContent: emailBodyHtml,
          fileDetails: {
            fileName: attachmentFileName,
            contentType: 'application/pdf',
            file: ''
          }
        };
        const documentConfig: DocumentConfig = {
          previewIframeHtml: processedHtml,
          previewIframeStyles: extractedStyles,
          organizationId: data.organization?.organizationId || null,
          selectedOfficeId: data.office.officeId,
          selectedOfficeName: data.office.name || '',
          selectedReservationId: data.reservation.reservationId,
          propertyId: data.property.propertyId,
          contacts: data.contacts,
          isDownloading: false
        };

        this.emailCreateDraftService.setDraft({
          emailConfig,
          documentConfig,
          returnUrl: this.router.url
        });
        void this.router.navigateByUrl(RouterUrl.EmailCreate);
        return of(undefined);
      })
    );
  }

loadInvoiceDocumentData(invoiceSummary: InvoiceResponse): Observable<InvoiceDownloadData> {
    const reservationId = (invoiceSummary.reservationId || '').trim();
    if (!invoiceSummary.invoiceId || !reservationId) {
      return throwError(() => new Error('Invoice is missing reservation information.'));
    }

    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';

    return forkJoin({
      invoice: this.invoiceService.getInvoiceByGuid(invoiceSummary.invoiceId).pipe(take(1)),
      reservation: this.reservationService.getReservationByGuid(reservationId).pipe(take(1)),
      organization: this.loadOrganization().pipe(take(1)),
      accountingOffices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)),
      offices: this.officeService.ensureOfficesLoaded(organizationId).pipe(
        take(1),
        map(() => this.officeService.getAllOfficesValue() || [])
      ),
      contacts: this.contactService.ensureContactsLoaded().pipe(take(1)),
      costCodes: this.costCodesService.ensureCostCodesLoaded().pipe(
        take(1),
        switchMap(() => this.costCodesService.getAllCostCodes().pipe(take(1)))
      )
    }).pipe(
      switchMap((base: InvoiceDownloadBaseData): Observable<InvoiceDownloadData> => {
        const office = base.offices.find(o => o.officeId === base.invoice.officeId) ?? null;
        if (!office) {
          return throwError(() => new Error('Office not found for this invoice.'));
        }

        const propertyId = (base.reservation.propertyId || '').trim();
        if (!propertyId) {
          return throwError(() => new Error('Reservation is missing property information.'));
        }

        return forkJoin({
          invoice: of(base.invoice),
          reservation: of(base.reservation),
          organization: of(base.organization),
          accountingOffices: of(base.accountingOffices),
          offices: of(base.offices),
          contacts: of(base.contacts),
          costCodes: of(base.costCodes),
          office: of(office),
          property: this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)),
          propertyHtml: this.propertyHtmlService.getPropertyHtmlByPropertyId(propertyId).pipe(take(1)),
          canonicalInvoiceTemplate: this.http.get('assets/invoice.html', { responseType: 'text' }).pipe(
            take(1),
            catchError(() => of(''))
          )
        });
      }),
      switchMap((data: InvoiceDownloadData) => {
        const templateHtml = this.invoiceHtmlBuilder.resolveInvoiceTemplateHtml(
          data.propertyHtml?.invoice,
          data.canonicalInvoiceTemplate
        );
        if (!templateHtml) {
          return throwError(() => new Error('No invoice HTML template found for this property.'));
        }
        return of(data);
      })
    );
  }

buildPrintableHtml(data: InvoiceDownloadData): { processedHtml: string; extractedStyles: string } {
    const ctx = this.buildPrintContext(
      data.invoice,
      data.reservation,
      data.property,
      data.office,
      data.accountingOffices,
      data.organization,
      data.contacts,
      data.costCodes
    );

    const templateHtml = this.invoiceHtmlBuilder.resolveInvoiceTemplateHtml(
      data.propertyHtml?.invoice,
      data.canonicalInvoiceTemplate
    );
    return this.invoiceHtmlBuilder.buildProcessedPreview(templateHtml, ctx);
  }

loadOrganization(): Observable<OrganizationResponse | null> {
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      return of(cached);
    }

    this.commonService.loadOrganization();
    return this.commonService.getOrganization().pipe(take(1));
  }

buildPrintContext(
    invoice: InvoiceResponse,
    reservation: ReservationResponse,
    property: PropertyResponse,
    office: OfficeResponse,
    accountingOffices: AccountingOfficeResponse[],
    organization: OrganizationResponse | null,
    contacts: ContactResponse[],
    costCodes: CostCodesResponse[]
  ): InvoicePrintContext {
    const selectedAccountingOffice = accountingOffices.find(ao => ao.officeId === office.officeId) ?? null;
    const officeCostCodes = costCodes.filter(c => c.officeId === office.officeId);
    const paymentCostCodeIds = new Set<number>(
      officeCostCodes
        .filter(c => c.transactionTypeId === TransactionType.Payment)
        .map(c => Number(c.costCodeId))
        .filter(id => Number.isFinite(id))
    );

    const reservationContactId = this.getPrimaryReservationContactId(reservation);
    const contact = reservationContactId
      ? contacts.find(c => c.contactId === reservationContactId) ?? null
      : null;

    return {
      invoice,
      reservation,
      property,
      contact,
      contacts,
      selectedOffice: office,
      selectedAccountingOffice,
      organization,
      accountingOfficeLogo: this.resolveLogoDataUrl(selectedAccountingOffice?.fileDetails),
      orgLogo: this.resolveLogoDataUrl(organization?.fileDetails),
      paymentCostCodeIds
    };
  }

getPrimaryReservationContactId(reservation: ReservationResponse): string | null {
    const contactIds = reservation.contactIds || [];
    const firstContactId = contactIds.find(id => String(id || '').trim().length > 0);
    return firstContactId ? String(firstContactId) : null;
  }

resolveLogoDataUrl(fileDetails?: FileDetails | null): string {
    if (!fileDetails) {
      return '';
    }
    if (fileDetails.dataUrl) {
      return fileDetails.dataUrl;
    }
    if (fileDetails.file && fileDetails.contentType) {
      return `data:${fileDetails.contentType};base64,${fileDetails.file}`;
    }
    return '';
  }
}
