import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, filter, Observable, Subject, of, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
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
import { LeadsService } from '../../leads/services/leads.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { PropertyResponse } from '../../properties/models/property.model';
import { PropertyService } from '../../properties/services/property.service';
import { CommonService } from '../../../services/common.service';
import { OwnerAgreementInformationResponse, replaceOwnerAgreementInformationSections } from '../models/owner-agreement-information.model';

@Component({
  standalone: true,
  selector: 'app-owner-agreement-form',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './owner-agreement-form.component.html',
  styleUrl: './owner-agreement-form.component.scss'
})
export class OwnerAgreementFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ownerLeadId: number | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;

  form: FormGroup = this.buildForm();
  isPageReady = false;
  isSaving = false;
  iframeKey = 0;
  previewIframeHtml = '';
  previewIframeStyles = '';
  safeHtml: SafeHtml | null = null;
  organizationId = '';
  selectedOffice: OfficeResponse | null = null;
  selectedProperty: PropertyResponse | null = null;
  ownerContact: ContactResponse | null = null;
  agreementInformation: OwnerAgreementInformationResponse | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organization', 'offices', 'contacts', 'property', 'agreementInfo', 'preview']));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private commonService: CommonService,
    private officeService: OfficeService,
    private contactService: ContactService,
    private propertyService: PropertyService,
    private leadsService: LeadsService,
    private formatterService: FormatterService,
    private utilityService: UtilityService,
    private documentHtmlService: DocumentHtmlService,
    private sanitizer: DomSanitizer,
    private documentService: DocumentService,
    private documentExportService: DocumentExportService,
    private toastr: ToastrService
  ) {}

  //#region Owner-Agreement-Form
  ngOnInit(): void {
    this.organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    this.commonService.loadStates();
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });
    this.loadContext();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ownerLeadId'] || changes['officeId'] || changes['propertyId']) {
      this.itemsToLoad$.next(new Set(['organization', 'offices', 'contacts', 'property', 'agreementInfo', 'preview']));
      this.loadContext();
    }
  }

  onIncludeChange(): void {
    this.generatePreview();
  }

  onPrint(): void {
    if (!this.previewIframeHtml) {
      this.toastr.warning('Nothing to print yet.');
      return;
    }
    this.documentExportService.printHTML(this.previewIframeHtml);
  }

  onDownload(): void {
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning('Agreement preview is not ready to download.');
      return;
    }

    const dto = this.buildGenerateDto();
    this.documentService.generateDownload(dto).pipe(take(1)).subscribe({
      next: blob => {
        const fileName = this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, 'OwnerAgreement');
        this.downloadBlob(blob, fileName);
      },
      error: () => {
        this.toastr.error('Unable to download owner agreement.', CommonMessage.Error);
      }
    });
  }

  onSave(): void {
    if (!this.previewIframeHtml || !this.selectedOffice) {
      this.toastr.warning('Agreement preview is not ready to save.');
      return;
    }
    this.isSaving = true;
    const dto = this.buildGenerateDto();
    this.documentService.generate(dto).pipe(take(1)).subscribe({
      next: () => {
        this.isSaving = false;
        this.toastr.success('Owner agreement saved successfully', CommonMessage.Success);
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error('Unable to save owner agreement.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      includeOwnerAgreement: new FormControl(true),
      includePropertyManagementAgreement: new FormControl(true)
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadContext(): void {
    this.loadOrganization();
    this.loadOffices();
    this.loadContacts();
    this.loadProperty();
    this.loadAgreementInformation();
  }

  loadOrganization(): void {
    this.commonService.loadOrganization();
    this.commonService.getOrganization().pipe(filter(org => org !== null), take(1), takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organization');
      }
    });
  }

  loadOffices(): void {
    if (!this.organizationId) {
      this.selectedOffice = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      return;
    }
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: offices => {
        const officeList = offices || [];
        this.selectedOffice = officeList.find(office => office.officeId === this.officeId) || null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.selectedOffice = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
      }
    });
  }

  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: contacts => {
        const ownerLeadId = Number(this.ownerLeadId);
        this.ownerContact = (contacts || []).find(contact =>
          Number(contact.entityTypeId) === Number(EntityType.Owner) &&
          Number(contact.ownerLeadId) === ownerLeadId
        ) || null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.ownerContact = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts');
      }
    });
  }

  loadProperty(): void {
    if (!this.propertyId || this.propertyId === 'new') {
      this.selectedProperty = null;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }
    this.propertyService.getPropertyByGuid(this.propertyId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: property => {
        this.selectedProperty = property;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.selectedProperty = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }

  loadAgreementInformation(): void {
    const scopedPropertyId = this.propertyId && this.propertyId !== 'new' ? this.propertyId : null;
    this.leadsService.getOwnerAgreementInformationByScope(this.officeId, scopedPropertyId).pipe(take(1), takeUntil(this.destroy$)).subscribe({
      next: response => {
        this.agreementInformation = response || null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
      },
      error: () => {
        this.agreementInformation = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'agreementInfo');
        this.generatePreviewIfReady();
      }
    });
  }
  //#endregion

  //#region Preview Methods
  generatePreviewIfReady(): void {
    const items = this.itemsToLoad$.value;
    const remaining = new Set([...items].filter(item => item !== 'preview'));
    if (remaining.size > 0) {
      return;
    }
    this.generatePreview();
  }

  generatePreview(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'preview');
    const includeOwnerAgreement = !!this.form.get('includeOwnerAgreement')?.value;
    const includePropertyManagementAgreement = !!this.form.get('includePropertyManagementAgreement')?.value;
    this.loadAgreementTemplate(includeOwnerAgreement, 'assets/owner-agreement.html').pipe(takeUntil(this.destroy$)).subscribe({
      next: ownerAgreementHtml => {
        this.loadAgreementTemplate(includePropertyManagementAgreement, 'assets/property-management-agreement.html').pipe(takeUntil(this.destroy$)).subscribe({
          next: propertyManagementAgreementHtml => {
            const htmlParts = [ownerAgreementHtml, propertyManagementAgreementHtml]
              .filter(part => String(part).trim().length > 0)
              .map(part => this.replaceAgreementPlaceholders(part));
            const combinedHtml = htmlParts.join('\n\n');
            this.processAndSetHtml(combinedHtml);
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
          },
          error: () => {
            this.previewIframeHtml = '';
            this.safeHtml = null;
            this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
          }
        });
      },
      error: () => {
        this.previewIframeHtml = '';
        this.safeHtml = null;
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'preview');
      }
    });
  }

  replaceAgreementPlaceholders(html: string): string {
    let content = replaceOwnerAgreementInformationSections(html, this.agreementInformation);
    const organization = this.commonService.getOrganizationValue();
    const companyName = this.getCompanyName();
    const officeName = this.getOfficeName();
    const companyState = this.getCompanyState();
    const companyCity = this.getCompanyCity();
    const companyAddress = this.getCompanyAddress();
    const companyAddress1 = this.getCompanyAddress1();
    const companyAddress2 = this.getCompanyAddress2();
    const companyNameInCaps = companyName.toUpperCase();
    const organizationOffice = `${companyName} ${officeName}`.trim();
    const ownerName = this.ownerContact?.fullName || `${this.ownerContact?.firstName || ''} ${this.ownerContact?.lastName || ''}`.trim();
    const ownerAddress = this.composeAddress(this.ownerContact);
    const propertyAddress = this.composeAddress(this.selectedProperty);
    const today = this.formatterService.formatDateStringLong(this.utilityService.todayAsCalendarDateString()) || '';
    const signerName = `${this.authService.getUser()?.firstName || ''} ${this.authService.getUser()?.lastName || ''}`.trim();
    const website = this.selectedOffice?.website || organization?.website || '';
    const officeLogo = this.selectedOffice?.fileDetails?.dataUrl || organization?.fileDetails?.dataUrl || '';
    const accountingOfficeAddress = this.composeAddress(this.selectedOffice);

    content = content
      .replace(/\{\{ownerAgreementTitle\}\}/g, 'Owner Agreement')
      .replace(/\{\{companyName\}\}/g, companyName)
      .replace(/\{\{companyNameInCaps\}\}/g, companyNameInCaps)
      .replace(/\{\{officeName\}\}/g, officeName)
      .replace(/\{\{companyState\}\}/g, companyState)
      .replace(/\{\{companyCity\}\}/g, companyCity)
      .replace(/\{\{companyAddress\}\}/g, companyAddress)
      .replace(/\{\{companyAddress1\}\}/g, companyAddress1)
      .replace(/\{\{companyAddress2\}\}/g, companyAddress2)
      .replace(/\{\{organization-office\}\}/g, organizationOffice)
      .replace(/\{\{propertyCode\}\}/g, this.selectedProperty?.propertyCode || '')
      .replace(/\{\{organizationState\}\}/g, organization?.state || '')
      .replace(/\{\{accountingOfficeAddress\}\}/g, accountingOfficeAddress)
      .replace(/\{\{ownerFullName\}\}/g, ownerName)
      .replace(/\{\{ownerAddress\}\}/g, ownerAddress)
      .replace(/\{\{propertyAddress\}\}/g, propertyAddress)
      .replace(/\{\{agreementStartDate\}\}/g, today)
      .replace(/\{\{ownerSignatureDate\}\}/g, today)
      .replace(/\{\{agentSignatureDate\}\}/g, today)
      .replace(/\{\{agentSignerName\}\}/g, signerName)
      .replace(/\{\{officePhone\}\}/g, this.formatterService.phoneNumber(this.selectedOffice?.phone) || '')
      .replace(/\{\{officeFax\}\}/g, this.formatterService.phoneNumber(this.selectedOffice?.fax) || '')
      .replace(/\{\{organizationWebsite\}\}/g, website)
      .replace(/\{\{officeLogoBase64\}\}/g, officeLogo);

    return content.replace(/\{\{[^}]+\}\}/g, '');
  }

  processAndSetHtml(html: string): void {
    const result = this.documentHtmlService.processHtml(html, true);
    this.previewIframeHtml = result.processedHtml;
    this.previewIframeStyles = result.extractedStyles;
    const previewHtmlWithStyles = this.documentHtmlService.getPreviewHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles);
    this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(previewHtmlWithStyles);
    this.iframeKey++;
  }
  //#endregion

  //#region Utility Methods
  loadAgreementTemplate(includeTemplate: boolean, assetPath: string): Observable<string> {
    if (!includeTemplate) {
      return of('');
    }
    return this.http.get(assetPath, { responseType: 'text' }).pipe(take(1));
  }

  buildGenerateDto(): GenerateDocumentFromHtmlDto {
    return {
      htmlContent: this.documentHtmlService.getPdfHtmlWithStyles(this.previewIframeHtml, this.previewIframeStyles, { fontSize: '10pt', includeLeaseStyles: true }),
      organizationId: this.organizationId,
      officeId: this.selectedOffice?.officeId || 0,
      officeName: this.selectedOffice?.name || '',
      propertyId: this.selectedProperty?.propertyId || null,
      reservationId: null,
      documentTypeId: DocumentType.OwnerAgreement,
      fileName: this.utilityService.generateDocumentFileName('lease', this.selectedProperty?.propertyCode || undefined, 'OwnerAgreement')
    };
  }

  downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  composeAddress(source: { address1?: string | null; address2?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null | undefined): string {
    if (!source) {
      return '';
    }
    return [
      String(source.address1 || '').trim(),
      String(source.address2 || '').trim(),
      String(source.city || '').trim(),
      String(source.state || '').trim(),
      String(source.zip || '').trim()
    ].filter(part => part.length > 0).join(', ');
  }

  getCompanyName(): string {
    return String(this.commonService.getOrganizationValue()?.name || '').trim();
  }

  getOfficeName(): string {
    return String(this.selectedOffice?.name || '').trim();
  }

  getCompanyState(): string {
    const stateCode = String(this.selectedOffice?.state || this.commonService.getOrganizationValue()?.state || '').trim();
    if (!stateCode) {
      return '';
    }

    const stateMatch = (this.commonService.getStatesFullValue() || []).find(state =>
      String(state.code || '').trim().toLowerCase() === stateCode.toLowerCase()
    );

    return String(stateMatch?.name || stateCode).trim();
  }

  getCompanyCity(): string {
    return String(this.selectedOffice?.city || this.commonService.getOrganizationValue()?.city || '').trim();
  }

  getCompanyAddress(): string {
    return [this.getCompanyAddress1(), this.getCompanyAddress2()].filter(part => part.length > 0).join(', ');
  }

  getCompanyAddress1(): string {
    const address1 = String(this.selectedOffice?.address1 || this.commonService.getOrganizationValue()?.address1 || '').trim();
    const suiteRaw = String(this.selectedOffice?.suite || this.commonService.getOrganizationValue()?.suite || '').trim();
    if (!address1) {
      return '';
    }
    if (!suiteRaw) {
      return address1;
    }
    const suite = suiteRaw.startsWith('#') ? suiteRaw : `#${suiteRaw}`;
    return `${address1}, ${suite}`;
  }

  getCompanyAddress2(): string {
    const city = this.getCompanyCity();
    const state = this.getCompanyState();
    const zip = String(this.selectedOffice?.zip || this.commonService.getOrganizationValue()?.zip || '').trim();
    const cityState = [city, state].filter(part => part.length > 0).join(', ');
    return [cityState, zip].filter(part => part.length > 0).join(' ');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
