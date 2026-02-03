import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { DocumentService } from '../../documents/services/document.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { PropertyHtmlService } from '../../property/services/property-html.service';
import { ReservationService } from '../../reservation/services/reservation.service';
import { PropertyService } from '../../property/services/property.service';
import { ContactService } from '../../contact/services/contact.service';
import { CompanyService } from '../../company/services/company.service';
import { AccountingOfficeService } from '../../organization-configuration/accounting/services/accounting-office.service';
import { CommonService } from '../../../services/common.service';
import { InvoiceResponse } from '../models/invoice.model';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';
import { ReservationResponse, ReservationListResponse } from '../../reservation/models/reservation-model';
import { PropertyResponse } from '../../property/models/property.model';
import { ContactResponse } from '../../contact/models/contact.model';
import { CompanyResponse } from '../../company/models/company.model';
import { AccountingOfficeResponse } from '../../organization-configuration/accounting/models/accounting-office.model';
import { OrganizationResponse } from '../../organization/models/organization.model';
import { PropertyHtmlResponse } from '../../property/models/property-html.model';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto, DocumentResponse } from '../../documents/models/document.model';
import { EntityType } from '../../contact/models/contact-enum';
import { getBillingMethod } from '../../reservation/models/reservation-enum';

export interface InvoiceDocumentData {
  invoice: InvoiceResponse;
  office: OfficeResponse;
  reservation: ReservationResponse | ReservationListResponse;
  property?: PropertyResponse | null;
  contact?: ContactResponse | null;
  company?: CompanyResponse | null;
  accountingOffice?: AccountingOfficeResponse | null;
  organization?: OrganizationResponse | null;
  propertyHtml?: PropertyHtmlResponse | null;
  officeLogo?: string;
  accountingOfficeLogo?: string;
  orgLogo?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceDocumentService {

  constructor(
    private documentService: DocumentService,
    private documentHtmlService: DocumentHtmlService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private propertyHtmlService: PropertyHtmlService,
    private reservationService: ReservationService,
    private propertyService: PropertyService,
    private contactService: ContactService,
    private companyService: CompanyService,
    private accountingOfficeService: AccountingOfficeService,
    private commonService: CommonService
  ) {}


  async generateInvoiceDocument(data: InvoiceDocumentData): Promise<DocumentResponse> {
    if (!data.invoice || !data.office || !data.reservation) {
      throw new Error('Missing required data: invoice, office, and reservation are required');
    }

    const fullData = await this.loadMissingData(data);
    if (!fullData.propertyHtml?.invoice) {
      throw new Error('Property does not have invoice template');
    }

    const processedHtml = this.replacePlaceholders(fullData.propertyHtml.invoice, fullData);
    const processed = this.documentHtmlService.processHtml(processedHtml, true);
    const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(processed.processedHtml, processed.extractedStyles);

    // Generate file name
    const invoiceCode = fullData.invoice.invoiceName?.replace(/[^a-zA-Z0-9-]/g, '') || fullData.invoice.invoiceId || 'Invoice';
    const fileName = this.utilityService.generateDocumentFileName('invoice', invoiceCode);

    const generateDto: GenerateDocumentFromHtmlDto = {
      htmlContent: htmlWithStyles,
      organizationId: fullData.organization?.organizationId || '',
      officeId: fullData.office.officeId,
      officeName: fullData.office.name,
      propertyId: fullData.property?.propertyId || null,
      reservationId: fullData.reservation.reservationId || null,
      documentTypeId: Number(DocumentType.Invoice),
      fileName: fileName
    };

    return firstValueFrom(this.documentService.generate(generateDto));
  }

  async loadMissingData(data: InvoiceDocumentData): Promise<InvoiceDocumentData> {
    const result = { ...data };

    // Load full reservation if we only have list response
    if (!('propertyId' in result.reservation) || !result.reservation.propertyId) {
      const fullReservation = await firstValueFrom(
        this.reservationService.getReservationByGuid(result.reservation.reservationId).pipe(take(1))
      );
      result.reservation = fullReservation;
    }

    const reservation = result.reservation as ReservationResponse;

    // Load property if not provided
    if (!result.property && reservation.propertyId) {
      result.property = await firstValueFrom(
        this.propertyService.getPropertyByGuid(reservation.propertyId).pipe(take(1))
      );
    }

    // Load property HTML if not provided
    if (!result.propertyHtml && reservation.propertyId) {
      result.propertyHtml = await firstValueFrom(this.propertyHtmlService.getPropertyHtmlByPropertyId(reservation.propertyId).pipe(take(1)));
    }

    // Load contact if not provided
    if (!result.contact && reservation.contactId) {
      const contacts = await firstValueFrom(this.contactService.getAllContacts().pipe(take(1)));
      result.contact = contacts.find(c => c.contactId === reservation.contactId) || undefined;
    }

    // Load company if contact is a company
    if (result.contact && result.contact.entityTypeId === EntityType.Company && result.contact.entityId && !result.company) {
      result.company = await firstValueFrom(this.companyService.getCompanyByGuid(result.contact.entityId).pipe(take(1)));
    }

    // Load accounting office if not provided
    if (!result.accountingOffice) {
      const accountingOffices = await firstValueFrom(this.accountingOfficeService.getAllAccountingOffices().pipe(take(1)));
      result.accountingOffice = accountingOffices.find(ao => ao.officeId === result.office.officeId) || undefined;
    }

    // Load organization if not provided
    if (!result.organization) {
      result.organization = await firstValueFrom(this.commonService.getOrganization().pipe(take(1)));
    }

    // Load logos if not provided
    if (!result.officeLogo && result.office?.fileDetails) {
      if (result.office.fileDetails.dataUrl) {
        result.officeLogo = result.office.fileDetails.dataUrl;
      } else if (result.office.fileDetails.file && result.office.fileDetails.contentType) {
        result.officeLogo = `data:${result.office.fileDetails.contentType};base64,${result.office.fileDetails.file}`;
      }
    }

    if (!result.accountingOfficeLogo && result.accountingOffice?.fileDetails) {
      if (result.accountingOffice.fileDetails.dataUrl) {
        result.accountingOfficeLogo = result.accountingOffice.fileDetails.dataUrl;
      } else if (result.accountingOffice.fileDetails.file && result.accountingOffice.fileDetails.contentType) {
        result.accountingOfficeLogo = `data:${result.accountingOffice.fileDetails.contentType};base64,${result.accountingOffice.fileDetails.file}`;
      }
    }

    if (!result.orgLogo && result.organization?.fileDetails) {
      if (result.organization.fileDetails.dataUrl) {
        result.orgLogo = result.organization.fileDetails.dataUrl;
      } else if (result.organization.fileDetails.file && result.organization.fileDetails.contentType) {
        result.orgLogo = `data:${result.organization.fileDetails.contentType};base64,${result.organization.fileDetails.file}`;
      }
    }

    return result;
  }

  //#region Replace Invoice Variables
  replacePlaceholders(html: string, data: InvoiceDocumentData): string {
    let result = html;

    // Replace invoice placeholders
    if (data.invoice) {
      result = result.replace(/\{\{invoiceName\}\}/g, data.invoice.invoiceName || '');
      result = result.replace(/\{\{invoiceDate\}\}/g, this.formatterService.formatDateString(data.invoice.invoiceDate) || '');
      result = result.replace(/\{\{startDate\}\}/g, data.invoice.startDate ? this.formatterService.formatDateString(data.invoice.startDate) : '');
      result = result.replace(/\{\{endDate\}\}/g, data.invoice.endDate ? this.formatterService.formatDateString(data.invoice.endDate) : '');
      result = result.replace(/\{\{totalAmount\}\}/g, this.formatterService.currency(data.invoice.totalAmount || 0));
      result = result.replace(/\{\{paidAmount\}\}/g, this.formatterService.currency(data.invoice.paidAmount || 0));
      result = result.replace(/\{\{totalDue\}\}/g, this.formatterService.currency((data.invoice.totalAmount || 0) - (data.invoice.paidAmount || 0)));
    }

    // Replace reservation placeholders
    if (data.reservation) {
      const reservation = data.reservation as ReservationResponse;
      result = result.replace(/\{\{billingMethod\}\}/g, getBillingMethod(reservation.billingMethodId) || '');
      result = result.replace(/\{\{tenantName\}\}/g, reservation.tenantName || '');
      result = result.replace(/\{\{reservationCode\}\}/g, reservation.reservationCode || '');
      result = result.replace(/\{\{arrivalDate\}\}/g, this.formatterService.formatDateString(reservation.arrivalDate) || '');
      result = result.replace(/\{\{departureDate\}\}/g, this.formatterService.formatDateString(reservation.departureDate) || '');
    }

    // Replace contact placeholders
    if (data.contact) {
      result = result.replace(/\{\{contactName\}\}/g, `${data.contact.firstName || ''} ${data.contact.lastName || ''}`.trim());
      result = result.replace(/\{\{contactPhone\}\}/g, this.formatterService.phoneNumber(data.contact.phone) || '');
      result = result.replace(/\{\{contactEmail\}\}/g, data.contact.email || '');
      
      // Contact address fields
      if (data.contact.entityTypeId === EntityType.Company && data.company) {
        // Use company address if contact is a company
        result = result.replace(/\{\{contactAddress1\}\}/g, data.company.address1 || '');
        result = result.replace(/\{\{contactAddress2\}\}/g, data.company.address2 || '');
        result = result.replace(/\{\{contactCity\}\}/g, data.company.city || '');
        result = result.replace(/\{\{contactState\}\}/g, data.company.state || '');
        result = result.replace(/\{\{contactZip\}\}/g, data.company.zip || '');
        result = result.replace(/\{\{contactAddress\}\}/g, this.getCompanyAddress(data.company) || '');
      } else {
        // Use contact address
        result = result.replace(/\{\{contactAddress1\}\}/g, data.contact.address1 || '');
        result = result.replace(/\{\{contactAddress2\}\}/g, data.contact.address2 || '');
        result = result.replace(/\{\{contactCity\}\}/g, data.contact.city || '');
        result = result.replace(/\{\{contactState\}\}/g, data.contact.state || '');
        result = result.replace(/\{\{contactZip\}\}/g, data.contact.zip || '');
        result = result.replace(/\{\{contactAddress\}\}/g, this.getContactAddress(data.contact) || '');
      }
    }

    // Replace company placeholders
    if (data.company) {
      result = result.replace(/\{\{companyName\}\}/g, data.company.name || '');
    }

    // Replace property placeholders
    if (data.property) {
      result = result.replace(/\{\{propertyCode\}\}/g, data.property.propertyCode || '');
      result = result.replace(/\{\{propertyAddress\}\}/g, this.getPropertyAddress(data.property) || '');
      result = result.replace(/\{\{propertySuite\}\}/g, data.property.suite || '');
    }

    // Replace office placeholders
    if (data.office) {
      result = result.replace(/\{\{officeName\}\}/g, data.office.name || '');
    }

    // Replace office logo placeholder - prefer accounting office logo, fallback to office logo, then org logo
    const officeLogoDataUrl = data.accountingOfficeLogo || data.officeLogo || data.orgLogo;
    if (officeLogoDataUrl) {
      result = result.replace(/\{\{officeLogoBase64\}\}/g, officeLogoDataUrl);
    }

    // Replace organization logo placeholder
    if (data.orgLogo) {
      result = result.replace(/\{\{orgLogoBase64\}\}/g, data.orgLogo);
    }

    // Remove img tags that contain logo placeholders if no logo is available
    if (!officeLogoDataUrl && !data.orgLogo) {
      result = result.replace(/<img[^>]*\{\{officeLogoBase64\}\}[^>]*\s*\/?>/gi, '');
      result = result.replace(/<img[^>]*\{\{orgLogoBase64\}\}[^>]*\s*\/?>/gi, '');
    }

    // Replace accounting office placeholders
    if (data.accountingOffice) {
      result = result.replace(/\{\{accountingOfficeName\}\}/g, data.accountingOffice.name || '');
      result = result.replace(/\{\{accountingOfficeAddress\}\}/g, data.accountingOffice.address1 || '');
      result = result.replace(/\{\{accountingOfficeCityStateZip\}\}/g, data.accountingOffice.city + ', ' + data.accountingOffice.state + ' ' + data.accountingOffice.zip || '');
      result = result.replace(/\{\{accountingOfficeEmail\}\}/g, data.accountingOffice.email || '');
      result = result.replace(/\{\{accountingOfficePhone\}\}/g, this.formatterService.phoneNumber(data.accountingOffice.phone) || '');
      result = result.replace(/\{\{accountingOfficeWebsite\}\}/g, data.accountingOffice.website || '');
      result = result.replace(/\{\{accountingOfficeBank\}\}/g, data.accountingOffice.bankName || '');
      result = result.replace(/\{\{accountingOfficeBankRouting\}\}/g, data.accountingOffice.bankRouting || '');
      result = result.replace(/\{\{accountingOfficeBankAccount\}\}/g, data.accountingOffice.bankAccount || '');
      result = result.replace(/\{\{accountingOfficeSwithCode\}\}/g, data.accountingOffice.bankSwiftCode || '');
      result = result.replace(/\{\{accountingOfficeBankAddress\}\}/g, data.accountingOffice.bankAddress || '');
      result = result.replace(/\{\{accountingOfficeBankPhone\}\}/g, this.formatterService.phoneNumber(data.accountingOffice.bankPhone) || '');
    }

    // Replace ledger lines placeholder
    const ledgerLinesRows = this.generateLedgerLinesRows(data.invoice);
    result = result.replace(/\{\{ledgerLinesRows\}\}/g, ledgerLinesRows);

    // Replace any remaining placeholders with empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
  }
  //#endregion

  //#region Ledger Lines
   generateLedgerLinesRows(invoice: InvoiceResponse): string {
    if (!invoice?.ledgerLines || invoice.ledgerLines.length === 0) {
      return '';
    }

    const rows = invoice.ledgerLines.map((line) => {
      const date = this.formatterService.formatDateString(invoice.invoiceDate) || '';
      const description = (line.description || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const amount = this.formatterService.currency(line.amount || 0);
      
      return `              <tr class="ledger-line-row">
                <td>${date}</td>
                <td>${description}</td>
                <td class="text-right">${amount}</td>
              </tr>`;
    }).join('\n');

    return rows;
  }
  //#endregion

  //#region Address Generation Methods
  getCompanyAddress(company: CompanyResponse): string {
    if (!company) return '';
    return `${company.address1 || ''} ${company.city || ''}, ${company.state || ''} ${company.zip || ''}`.trim();
  }

  getContactAddress(contact: ContactResponse): string {
    if (!contact) return '';
    return `${contact.address1 || ''} ${contact.city || ''}, ${contact.state || ''} ${contact.zip || ''}`.trim();
  }

  getPropertyAddress(property: PropertyResponse): string {
    if (!property) return '';
    return `${property.address1 || ''} ${property.city || ''}, ${property.state || ''} ${property.zip || ''}`.trim();
  }
  //#endregion
}
