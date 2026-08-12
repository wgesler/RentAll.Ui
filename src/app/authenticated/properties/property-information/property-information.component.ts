import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { DocumentHtmlService } from '../../../services/document-html.service';
import { FormatterService } from '../../../services/formatter-service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { PropertyInformationRequest, PropertyInformationResponse } from '../models/property-information.model';
import { PropertyResponse } from '../models/property.model';
import { PropertyInformationService } from '../services/property-information.service';
import { PropertyService } from '../services/property.service';
import { WelcomeLetterReloadService } from '../services/welcome-letter-reload.service';

type HtmlEditorControlName =
  | 'departureInstructions'
  | 'departureCleaning'
  | 'departureMail'
  | 'departureFees';

type HtmlEditorFormat = 'bold' | 'italic' | 'underline' | 'paragraph' | 'unorderedList';

@Component({
    standalone: true,
    selector: 'app-property-information',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './property-information.component.html',
    styleUrls: ['./property-information.component.scss']
})
export class PropertyInformationComponent implements OnInit, OnDestroy, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private host = inject(ElementRef<HTMLElement>);

  @Input() propertyId: string | null = null;
  @Input() copiedPropertyInformation: PropertyInformationResponse | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyCode: string | null = null;
  @Input() hideOfficeAndPropertyCode: boolean = false;
  private propertyInformationService = inject(PropertyInformationService);
  private propertyService = inject(PropertyService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private fb = inject(FormBuilder);
  private formatterService = inject(FormatterService);
  private welcomeLetterReloadService = inject(WelcomeLetterReloadService);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private utilityService = inject(UtilityService);
  private documentHtmlService = inject(DocumentHtmlService);

  isSubmitting: boolean = false;
  form: FormGroup;
  property: PropertyResponse | null = null;
  offices: OfficeResponse[] = [];
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = false;
  organizationId = '';

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['property', 'propertyInformation']));
  isPageReady = false;
  destroy$ = new Subject<void>();

  private readonly htmlEditorControlNames: HtmlEditorControlName[] = [
    'departureInstructions',
    'departureCleaning',
    'departureMail',
    'departureFees'
  ];
  private htmlEditors = new Map<HtmlEditorControlName, HTMLDivElement>();

  @ViewChild('departureInstructionsEditor') set departureInstructionsEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.registerHtmlEditor('departureInstructions', value);
  }
  @ViewChild('departureCleaningEditor') set departureCleaningEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.registerHtmlEditor('departureCleaning', value);
  }
  @ViewChild('departureMailEditor') set departureMailEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.registerHtmlEditor('departureMail', value);
  }
  @ViewChild('departureFeesEditor') set departureFeesEditorRef(value: ElementRef<HTMLDivElement> | undefined) {
    this.registerHtmlEditor('departureFees', value);
  }

  constructor() {
    this.form = this.buildForm();
  }

  //#region Property-Information
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.loadOffices();
    
    if (!this.hasPersistedPropertyId()) {
      if (this.copiedPropertyInformation) 
        this.populateFormFromCopiedData();
      this.applyAddModeOfficeDefaults();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      return;
    }

    this.loadPropertyData();
    this.getPropertyInformation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId'] && this.hasPersistedPropertyId() && !changes['propertyId'].firstChange) {
      this.loadPropertyData();
      this.getPropertyInformation();
    }
    
    if (changes['copiedPropertyInformation'] && this.copiedPropertyInformation && !this.hasPersistedPropertyId()) {
      this.populateFormFromCopiedData();
      this.applyAddModeOfficeDefaults();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
    }
    
    if (changes['officeId'] && this.offices.length > 0) {
      this.onTitleBarOfficeIdUpdate(changes['officeId'].currentValue as number | null);
    }
  }
  
  getPropertyInformation(): void {
    if (!this.hasPersistedPropertyId()) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      return;
    }

    this.propertyInformationService.getPropertyInformationByGuid(this.propertyId as string).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation'); })).subscribe({
      next: (response: PropertyInformationResponse) => {
        if (response) {
          this.populateForm(response);
        } else {
          this.populateDefaultsFromProperty();
        }
      },
      error: () => {
        this.populateDefaultsFromProperty();
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'propertyInformation');
      }
    });
  }
    
  savePropertyInformation(): void {
    if (!this.hasPersistedPropertyId()) {
      this.toastr.error('Property must be saved first before saving property information.', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    this.syncAllHtmlEditorsToForm();

    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const propertyInformationRequest: PropertyInformationRequest = {
      propertyId: this.propertyId as string,
      organizationId: user?.organizationId || '',
      arrivalInstructions: formValue.arrivalInstructions || undefined,
      access: formValue.access || undefined,
      mailboxInstructions: formValue.mailboxInstructions || undefined,
      packageInstructions: formValue.packageInstructions || undefined,
      parkingInformation: formValue.parkingInformation || undefined,
      laundry: formValue.laundry || undefined,
      providedFurnishings: formValue.providedFurnishings || undefined,
      housekeeping: formValue.housekeeping || undefined,
      televisionSource: formValue.televisionSource || undefined,
      internetService: formValue.internetService || undefined,
      keyReturn: formValue.keyReturn || undefined,
      // Always send these (never omit) so published procs don't fall back to NULL defaults.
      // Strip pasted font-size/font-family so departure letter uses one host font.
      departureInstructions: this.documentHtmlService.stripEmbeddedTypography(formValue.departureInstructions ?? ''),
      departureCleaning: this.documentHtmlService.stripEmbeddedTypography(formValue.departureCleaning ?? ''),
      departureMail: this.documentHtmlService.stripEmbeddedTypography(formValue.departureMail ?? ''),
      departureFees: this.documentHtmlService.stripEmbeddedTypography(formValue.departureFees ?? ''),
      concierge: formValue.concierge || undefined,
      maintenanceEmail: formValue.maintenanceEmail || undefined,
      emergencyPhone: formValue.emergencyPhone ? this.formatterService.stripPhoneFormatting(formValue.emergencyPhone) : undefined,
      additionalNotes: formValue.additionalNotes || undefined
    };

    // PUT already upserts server-side when the row is missing.
    this.propertyInformationService.updatePropertyInformation(propertyInformationRequest).pipe(
      take(1),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: (response) => {
        this.toastr.success('Property information updated successfully', CommonMessage.Success);
        this.copiedPropertyInformation = null;
        // Only re-bind when the API round-trips the new fields (avoids wiping editors if API is stale).
        if (response && Object.prototype.hasOwnProperty.call(response, 'departureInstructions')) {
          this.populateForm(response);
        }
        this.welcomeLetterReloadService.triggerReload();
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1)).subscribe(() => {
      this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
        this.offices = offices || [];
        this.globalSelectionService.getOfficeUiState$(this.offices).pipe(take(1)).subscribe({
          next: uiState => {
            this.selectedOffice = uiState.selectedOffice;
            this.showOfficeDropdown = uiState.showOfficeDropdown;
          }
        });
        
        if (this.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        } else if (this.property?.officeId) {
          this.selectedOffice = this.offices.find(o => o.officeId === this.property.officeId) || null;
        }

        this.applyAddModeOfficeDefaults();
      });
    });
  }

  loadPropertyData(): void {
    if (!this.hasPersistedPropertyId()) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      return;
    }

    this.propertyService.getPropertyByGuid(this.propertyId as string).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property'); })).subscribe({
      next: (response: PropertyResponse) => {
        this.property = response;
        if (response.officeId && this.offices.length > 0) {
          this.selectedOffice = this.offices.find(o => o.officeId === response.officeId) || null;
        }
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'property');
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      arrivalInstructions: new FormControl(''),
      access: new FormControl(''),
      mailboxInstructions: new FormControl(''),
      packageInstructions: new FormControl(''),
      parkingInformation: new FormControl(''),
      laundry: new FormControl(''),
      providedFurnishings: new FormControl(''),
      housekeeping: new FormControl(''),
      televisionSource: new FormControl(''),
      internetService: new FormControl(''),
      keyReturn: new FormControl(''),
      departureInstructions: new FormControl(''),
      departureCleaning: new FormControl(''),
      departureMail: new FormControl(''),
      departureFees: new FormControl(''),
      concierge: new FormControl(''),
      maintenanceEmail: new FormControl(''),
      emergencyPhone: new FormControl(''),
      additionalNotes: new FormControl('')
    });
  }

  populateForm(response: PropertyInformationResponse): void {
    this.form.patchValue({
      arrivalInstructions: response.arrivalInstructions || '',
      access: response.access || '',
      mailboxInstructions: response.mailboxInstructions || '',
      packageInstructions: response.packageInstructions || '',
      parkingInformation: response.parkingInformation || '',
      laundry: response.laundry || '',
      providedFurnishings: response.providedFurnishings || '',
      housekeeping: response.housekeeping || '',
      televisionSource: response.televisionSource || '',
      internetService: response.internetService || '',
      keyReturn: response.keyReturn || '',
      departureInstructions: response.departureInstructions || '',
      departureCleaning: response.departureCleaning || '',
      departureMail: response.departureMail || '',
      departureFees: response.departureFees || '',
      concierge: response.concierge || '',
      maintenanceEmail: response.maintenanceEmail || '',
      emergencyPhone: response.emergencyPhone ? this.formatterService.phoneNumber(response.emergencyPhone) : '',
      additionalNotes: response.additionalNotes || ''
    });
    this.formatPhone();
    this.syncAllHtmlEditorsFromForm();
    setTimeout(() => this.syncAllHtmlEditorsFromForm());
  }
 
  populateFormFromCopiedData(): void {
    if (!this.copiedPropertyInformation) {
      return;
    }

    this.form.patchValue({
      arrivalInstructions: this.copiedPropertyInformation.arrivalInstructions || '',
      access: this.copiedPropertyInformation.access || '',
      mailboxInstructions: this.copiedPropertyInformation.mailboxInstructions || '',
      packageInstructions: this.copiedPropertyInformation.packageInstructions || '',
      parkingInformation: this.copiedPropertyInformation.parkingInformation || '',
      laundry: this.copiedPropertyInformation.laundry || '',
      providedFurnishings: this.copiedPropertyInformation.providedFurnishings || '',
      housekeeping: this.copiedPropertyInformation.housekeeping || '',
      televisionSource: this.copiedPropertyInformation.televisionSource || '',
      internetService: this.copiedPropertyInformation.internetService || '',
      keyReturn: this.copiedPropertyInformation.keyReturn || '',
      departureInstructions: this.copiedPropertyInformation.departureInstructions || '',
      departureCleaning: this.copiedPropertyInformation.departureCleaning || '',
      departureMail: this.copiedPropertyInformation.departureMail || '',
      departureFees: this.copiedPropertyInformation.departureFees || '',
      concierge: this.copiedPropertyInformation.concierge || '',
      maintenanceEmail: this.copiedPropertyInformation.maintenanceEmail || '',
      emergencyPhone: this.copiedPropertyInformation.emergencyPhone ? this.formatterService.phoneNumber(this.copiedPropertyInformation.emergencyPhone) : '',
      additionalNotes: this.copiedPropertyInformation.additionalNotes || ''
    });
    this.formatPhone();
    this.syncAllHtmlEditorsFromForm();
    this.applyAddModeOfficeDefaults();
  }

  populateDefaultsFromProperty(): void {
    if (!this.property) return;

    const laundryText = this.property.washerDryerInUnit
      ? 'Washer and Dryer in Unit'
      : (this.property.washerDryerInBldg ? 'Washer and Dryer in Building' : '');

    this.form.patchValue({
      laundry: laundryText,
      housekeeping: 'NA',
      parkingInformation: this.property.parkingNotes || '',
      televisionSource: this.getTelevisionSourceFromProperty(),
      internetService: this.getInternetServiceFromProperty(),
      keyReturn: '',
      concierge: this.property.phone || ''
    });

    this.formatPhone();
    this.applyAddModeOfficeDefaults();
  }

  getTelevisionSourceFromProperty(): string {
    const sources: string[] = [];
    if (this.property?.cable) {
      sources.push('Cable');
    }
    if ((this.property as any)?.streaming) {
      sources.push('Streaming');
    }
    return sources.join(' and ') || '';
  }

  getInternetServiceFromProperty(): string {
    if (this.property?.fastInternet) {
      return 'High-Speed Wireless';
    }
    return this.property?.internetPassword ? 'Internet Provided' : '';
  }

  applyAddModeOfficeDefaults(): void {
    if (this.hasPersistedPropertyId()) return;
    if (!this.selectedOffice) return;

    const patch: any = {};
    const maintenanceEmail = this.selectedOffice.maintenanceEmail;
    const afterHoursPhone = this.selectedOffice.afterHoursPhone;

    if (!this.form.get('maintenanceEmail')?.value && maintenanceEmail) {
      patch.maintenanceEmail = maintenanceEmail;
    }
    if (!this.form.get('emergencyPhone')?.value && afterHoursPhone) {
      patch.emergencyPhone = this.formatterService.phoneNumber(afterHoursPhone);
    }

    if (Object.keys(patch).length) {
      this.form.patchValue(patch);
      this.formatPhone();
    }
  }
  //#endregion
  
  //#region Title Bar Updates
  onTitleBarOfficeIdUpdate(newOfficeId: number | null): void {
    if (newOfficeId) {
      this.selectedOffice = this.offices.find(o => o.officeId === newOfficeId) || null;
    } else {
      this.selectedOffice = null;
    }
    this.applyAddModeOfficeDefaults();
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('emergencyPhone'));
  }

  hasPersistedPropertyId(): boolean {
    return !!this.propertyId && this.propertyId !== 'new';
  }

  registerHtmlEditor(controlName: HtmlEditorControlName, value: ElementRef<HTMLDivElement> | undefined): void {
    const editor = value?.nativeElement;
    if (!editor) {
      this.htmlEditors.delete(controlName);
      return;
    }
    this.htmlEditors.set(controlName, editor);
    this.syncHtmlEditorFromForm(controlName);
  }

  onHtmlEditorInput(controlName: HtmlEditorControlName, event: Event): void {
    const element = event.target as HTMLDivElement;
    const control = this.form.get(controlName);
    control?.setValue(element.innerHTML, { emitEvent: false });
    control?.markAsDirty();
    control?.markAsTouched();
  }

  onHtmlEditorPaste(controlName: HtmlEditorControlName, event: ClipboardEvent): void {
    event.preventDefault();
    const clipboard = event.clipboardData;
    if (!clipboard) {
      return;
    }

    const html = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');
    const insertHtml = html
      ? this.documentHtmlService.stripEmbeddedTypography(html)
      : this.escapeEditorHtml(text || '').replace(/\r?\n/g, '<br>');

    this.execEditorCommand('insertHTML', false, insertHtml);
    const editor = this.getHtmlEditorElement(controlName);
    if (!editor) {
      return;
    }
    const control = this.form.get(controlName);
    control?.setValue(editor.innerHTML, { emitEvent: false });
    control?.markAsDirty();
    control?.markAsTouched();
  }

  applyHtmlEditorFormat(controlName: HtmlEditorControlName, format: HtmlEditorFormat): void {
    const editor = this.getHtmlEditorElement(controlName);
    if (!editor) {
      return;
    }

    editor.focus();
    if (format === 'paragraph') {
      const inserted = this.execEditorCommand('insertParagraph', false);
      if (!inserted) {
        this.execEditorCommand('insertHTML', false, '<p><br></p>');
      }
      this.form.get(controlName)?.setValue(editor.innerHTML);
      return;
    }

    if (format === 'unorderedList') {
      this.applyUnorderedListCommand(editor);
      this.form.get(controlName)?.setValue(editor.innerHTML);
      return;
    }

    this.execEditorCommand(format, false);
    this.form.get(controlName)?.setValue(editor.innerHTML);
  }

  preventEditorToolbarMouseDown(event: MouseEvent): void {
    event.preventDefault();
  }

  syncAllHtmlEditorsFromForm(): void {
    this.htmlEditorControlNames.forEach(controlName => this.syncHtmlEditorFromForm(controlName));
  }

  syncAllHtmlEditorsToForm(): void {
    this.htmlEditorControlNames.forEach(controlName => {
      const editor = this.getHtmlEditorElement(controlName);
      if (!editor) {
        return;
      }
      const control = this.form.get(controlName);
      control?.setValue(editor.innerHTML, { emitEvent: false });
      control?.markAsDirty();
      control?.markAsTouched();
    });
  }

  syncHtmlEditorFromForm(controlName: HtmlEditorControlName): void {
    const editor = this.getHtmlEditorElement(controlName);
    if (!editor) {
      return;
    }

    const value = this.form?.get(controlName)?.value ?? '';
    const nextHtml = typeof value === 'string' ? value : String(value);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }

  private getHtmlEditorElement(controlName: HtmlEditorControlName): HTMLDivElement | null {
    const mapped = this.htmlEditors.get(controlName);
    if (mapped) {
      return mapped;
    }
    return this.host.nativeElement.querySelector(`[data-html-editor="${controlName}"]`) as HTMLDivElement | null;
  }

  /** Contenteditable toolbar; execCommand is deprecated in DOM typings but has no stable replacement yet. */
  private execEditorCommand(commandId: string, showUi = false, value?: string): boolean {
    return (document as unknown as { execCommand(commandId: string, showUI?: boolean, value?: string): boolean })
      .execCommand(commandId, showUi, value);
  }

  private applyUnorderedListCommand(editor: HTMLDivElement): void {
    editor.focus();
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    const listItems = selectedText
      .split(/\r?\n+/)
      .map(item => item.trim())
      .filter(item => !!item);
    if (listItems.length > 0) {
      const listHtml = `<ul>${listItems.map(item => `<li>${this.escapeEditorHtml(item)}</li>`).join('')}</ul>`;
      this.execEditorCommand('insertHTML', false, listHtml);
      return;
    }

    if (!selection || selection.rangeCount === 0) {
      this.execEditorCommand('insertHTML', false, '<ul><li><br></li></ul>');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    this.execEditorCommand('insertHTML', false, '<ul><li><br></li></ul>');
  }

  private escapeEditorHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

