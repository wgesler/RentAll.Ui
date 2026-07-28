import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, switchMap, take, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import { CommonService } from '../../../services/common.service';
import { DocumentExportService } from '../../../services/document-export.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { ContactResponse } from '../../contacts/models/contact.model';
import { ContactService } from '../../contacts/services/contact.service';
import { DocumentType } from '../../documents/models/document.enum';
import { GenerateDocumentFromHtmlDto } from '../../documents/models/document.model';
import { DocumentService } from '../../documents/services/document.service';
import { AccountingOfficeResponse } from '../../organizations/models/accounting-office.model';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OrganizationResponse } from '../../organizations/models/organization.model';
import { AccountingOfficeService } from '../../organizations/services/accounting-office.service';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyHtmlResponse } from '../../properties/models/property-html.model';
import { PropertyHtmlService } from '../../properties/services/property-html.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { OwnerStatementMonthLineListDisplay, OwnerStatementPropertyActivityLineResponse } from '../models/owner-statement.model';
import { OwnerStatementPrintContext } from '../models/owner-statement-print-context.model';
import { OwnerStatementHtmlBuilderService } from './owner-statement-html-builder.service';
import { OwnerStatementService } from './owner-statement.service';

interface OwnerStatementDownloadData {
  line: OwnerStatementMonthLineListDisplay;
  organization: OrganizationResponse | null;
  offices: OfficeResponse[];
  accountingOffices: AccountingOfficeResponse[];
  contacts: ContactResponse[];
  property: PropertyResponse;
  propertyHtml: PropertyHtmlResponse | null;
  statementActivityLines: OwnerStatementPropertyActivityLineResponse[];
  statementAccrualActivityLines: OwnerStatementPropertyActivityLineResponse[];
  fallbackTemplateHtml: string;
}

@Injectable({
  providedIn: 'root'
})
export class OwnerStatementDocumentService {
  private authService = inject(AuthService);
  private http = inject(HttpClient);
  private commonService = inject(CommonService);
  private contactService = inject(ContactService);
  private propertyService = inject(PropertyService);
  private propertyHtmlService = inject(PropertyHtmlService);
  private officeService = inject(OfficeService);
  private accountingOfficeService = inject(AccountingOfficeService);
  private ownerStatementService = inject(OwnerStatementService);
  private htmlBuilder = inject(OwnerStatementHtmlBuilderService);
  private documentService = inject(DocumentService);
  private documentHtmlService = inject(DocumentHtmlService);
  private documentExportService = inject(DocumentExportService);

  downloadOwnerStatementPdf(line: OwnerStatementMonthLineListDisplay): Observable<void> {
    return this.buildOwnerStatementDocumentPreview(line).pipe(
      switchMap(preview => {
        const htmlWithStyles = this.documentHtmlService.getPdfHtmlWithStyles(
          preview.previewIframeHtml,
          preview.previewIframeStyles
        );

        const generateDto: GenerateDocumentFromHtmlDto = {
          htmlContent: htmlWithStyles,
          organizationId: preview.organization.organizationId || preview.organizationId,
          officeId: preview.office.officeId,
          officeName: preview.office.name || '',
          propertyId: preview.property.propertyId,
          reservationId: null,
          documentTypeId: DocumentType.OwnerStatement,
          fileName: preview.fileName
        };

        return this.documentService.generateDownload(generateDto).pipe(
          take(1),
          map(blob => {
            this.documentExportService.downloadBlob(blob, preview.fileName);
          })
        );
      })
    );
  }

  printOwnerStatement(line: OwnerStatementMonthLineListDisplay): Observable<void> {
    return this.buildOwnerStatementDocumentPreview(line).pipe(
      map(preview => {
        const htmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(
          preview.previewIframeHtml,
          preview.previewIframeStyles
        );
        this.documentExportService.printHTML(htmlWithStyles);
      })
    );
  }

  private buildOwnerStatementDocumentPreview(line: OwnerStatementMonthLineListDisplay): Observable<{
    previewIframeHtml: string;
    previewIframeStyles: string;
    organization: OrganizationResponse;
    organizationId: string;
    office: OfficeResponse;
    property: PropertyResponse;
    fileName: string;
  }> {
    const propertyId = (line.propertyId || '').trim();
    const officeId = line.officeId;

    if (!propertyId) {
      return throwError(() => new Error('Owner statement is missing property information.'));
    }
    if (!officeId) {
      return throwError(() => new Error('Owner statement is missing office information.'));
    }

    return this.loadOwnerStatementDocumentData(line).pipe(
      switchMap(data => {
        if (!data.organization) {
          return throwError(() => new Error('Organization not found.'));
        }

        const office = data.offices.find(item => item.officeId === officeId) ?? null;
        if (!office) {
          return throwError(() => new Error('Office not found for this owner statement.'));
        }

        const templateHtml = this.resolveTemplateHtml(data);
        if (!templateHtml) {
          return throwError(() => new Error('No owner statement HTML template found for this property.'));
        }

        const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
        const ctx = this.buildPrintContext(data, office);
        const { previewIframeHtml, previewIframeStyles } = this.htmlBuilder.buildProcessedPreview(templateHtml, ctx);

        return of({
          previewIframeHtml,
          previewIframeStyles,
          organization: data.organization,
          organizationId,
          office,
          property: data.property,
          fileName: this.htmlBuilder.buildOwnerStatementFileName(line)
        });
      })
    );
  }

  private loadOwnerStatementDocumentData(line: OwnerStatementMonthLineListDisplay): Observable<OwnerStatementDownloadData> {
    const propertyId = (line.propertyId || '').trim();
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    const periodStartDate = (line.periodStartDate || line.monthDate || '').trim();
    const periodEndDate = (line.periodEndDate || line.monthDate || periodStartDate).trim();
    const searchRequest = {
      officeIds: [line.officeId],
      propertyId,
      startDate: periodStartDate || null,
      endDate: periodEndDate || null
    };

    return forkJoin({
      organization: this.loadOrganization().pipe(take(1)),
      offices: this.officeService.ensureOfficesLoaded(organizationId).pipe(
        take(1),
        map(() => this.officeService.getAllOfficesValue() || [])
      ),
      accountingOffices: this.accountingOfficeService.ensureAccountingOfficesLoaded().pipe(take(1)),
      contacts: this.contactService.ensureContactsLoaded().pipe(take(1)),
      property: this.propertyService.getPropertyByGuid(propertyId).pipe(take(1)),
      propertyHtml: this.propertyHtmlService.getPropertyHtmlByPropertyId(propertyId).pipe(
        take(1),
        catchError(() => of(null))
      ),
      cashLines: this.ownerStatementService.searchOwnerStatementPropertyActivityLines(searchRequest).pipe(take(1)),
      accrualLines: this.ownerStatementService.searchOwnerStatementAccrualPropertyActivityLines(searchRequest).pipe(take(1)),
      fallbackTemplateHtml: (environment.local || environment.dev)
        ? this.http.get('assets/owner-statement.html', { responseType: 'text' }).pipe(take(1), catchError(() => of('')))
        : of('')
    }).pipe(
      map(result => ({
        line,
        organization: result.organization,
        offices: result.offices,
        accountingOffices: result.accountingOffices,
        contacts: result.contacts,
        property: result.property,
        propertyHtml: result.propertyHtml,
        statementActivityLines: result.cashLines || [],
        statementAccrualActivityLines: result.accrualLines || [],
        fallbackTemplateHtml: result.fallbackTemplateHtml
      }))
    );
  }

  private resolveTemplateHtml(data: OwnerStatementDownloadData): string {
    if (environment.local || environment.dev) {
      const fallback = (data.fallbackTemplateHtml || '').trim();
      if (fallback) {
        return fallback;
      }
    }

    return (data.propertyHtml?.ownerStatement || '').trim();
  }

  private loadOrganization(): Observable<OrganizationResponse | null> {
    const cached = this.commonService.getOrganizationValue();
    if (cached) {
      return of(cached);
    }

    this.commonService.loadOrganization();
    return this.commonService.getOrganization().pipe(take(1));
  }

  private buildPrintContext(data: OwnerStatementDownloadData, office: OfficeResponse): OwnerStatementPrintContext {
    const selectedAccountingOffice = data.accountingOffices.find(item => item.officeId === office.officeId) ?? null;
    const ownerContact = data.contacts.find(contact => contact.contactId === data.line.ownerId) ?? null;

    return {
      line: data.line,
      organization: data.organization,
      selectedOffice: office,
      selectedAccountingOffice,
      ownerContact,
      property: data.property,
      statementActivityLines: data.statementActivityLines,
      statementAccrualActivityLines: data.statementAccrualActivityLines
    };
  }
}
