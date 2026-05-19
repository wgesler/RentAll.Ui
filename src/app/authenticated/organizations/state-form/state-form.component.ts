import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subject, filter, finalize, map, take, takeUntil } from 'rxjs';
import { CommonMessage, CommonTimeouts } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { CommonService } from '../../../services/common.service';
import { PdfThumbnailService } from '../../../services/pdf-thumbnail.service';
import { UtilityService } from '../../../services/utility.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { fileValidator } from '../../../validators/file-validator';
import { StateFormRequest, StateFormResponse } from '../models/state-form.model';
import { StateFormService } from '../services/state-form.service';

@Component({
    standalone: true,
    selector: 'app-state-form',
    imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './state-form.component.html',
    styleUrl: './state-form.component.scss'
})
export class StateFormComponent implements OnInit, OnDestroy, OnChanges {
  private readonly allStatesCode = 'XX';
  @Input() id: string | number | null = null;
  @Input() embeddedInSettings: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  form: FormGroup;
  stateCodes: string[] = [];
  fileDetails: FileDetails | null = null;
  fileName: string | null = null;
  stateForm: StateFormResponse | null = null;
  path: string | null = null;
  previewDataUrl: string | null = null;
  previewContentType: string | null = null;
  stateFormPdfThumbnailUrl: string | null = null;
  isAddMode: boolean = false;
  isServiceError: boolean = false;
  isUploadingDocument: boolean = false;
  isSubmitting: boolean = false;
  hasNewFileUpload: boolean = false;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['stateForm', 'states']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private toastr: ToastrService,
    private commonService: CommonService,
    private pdfThumbnailService: PdfThumbnailService,
    private utilityService: UtilityService,
    private stateFormService: StateFormService
  ) {
  }

  //#region StateForm
  ngOnInit(): void {
    this.buildForm();
    this.loadStates();
    this.handleIdChange(this.id);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && !changes['id'].firstChange) {
      this.handleIdChange(changes['id'].currentValue);
    }
  }

  handleIdChange(id: string | number | null): void {
    if (!id || id === 'new') {
      this.isAddMode = true;
      this.stateForm = null;
      this.clearDocument();
      this.form.patchValue({
        stateCode: '',
        formName: '',
        formAsHtml: ''
      }, { emitEvent: false });
      this.form.markAsPristine();
      this.form.markAsUntouched();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForm');
      return;
    }

    this.isAddMode = false;
    this.getStateForm(id);
  }

  getStateForm(id: string | number): void {
    const stateFormId = typeof id === 'number' ? id : parseInt(id.toString(), 10);
    if (isNaN(stateFormId) || stateFormId <= 0) {
      this.toastr.error('Invalid state form ID', CommonMessage.Error);
      this.isServiceError = true;
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForm');
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'stateForm');
    this.stateFormService.getStateFormById(stateFormId).pipe(
      take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'stateForm')),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response: StateFormResponse) => {
        this.stateForm = response;
        this.populateForm();
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  saveStateForm(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const request = this.buildRequest();
    const saveRequest$ = this.isAddMode
      ? this.stateFormService.createStateForm(request)
      : this.stateFormService.updateStateForm(request);

    saveRequest$.pipe(
      take(1),
      finalize(() => this.isSubmitting = false),
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.toastr.success(
          this.isAddMode ? 'State form created successfully' : 'State form updated successfully',
          CommonMessage.Success,
          { timeOut: CommonTimeouts.Success }
        );
        this.savedEvent.emit();
        this.backEvent.emit();
      },
      error: (_err: HttpErrorResponse) => {}
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadStates(): void {
    const cachedStates = this.commonService.getStatesValue();
    if (cachedStates && cachedStates.length > 0) {
      this.stateCodes = this.normalizeStateCodes(cachedStates);
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'states');
      return;
    }

    this.commonService.loadStates();
    this.commonService.getStates().pipe(
      filter(states => !!states && states.length > 0),
      take(1),
      takeUntil(this.destroy$)
    ).subscribe({
      next: states => {
        this.stateCodes = this.normalizeStateCodes(states || []);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'states');
      },
      error: () => {
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'states');
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      stateCode: new FormControl('', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]),
      formName: new FormControl('', [Validators.required]),
      formAsHtml: new FormControl(''),
      fileUpload: new FormControl('', {
        validators: [],
        asyncValidators: [fileValidator(
          ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'svg', 'heic', 'heif', 'pdf', 'html', 'htm'],
          ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif', 'application/pdf', 'text/html'],
          10000000,
          true
        )]
      })
    });
  }

  populateForm(): void {
    if (!this.stateForm || !this.form) {
      return;
    }

    this.form.patchValue({
      stateCode: this.stateForm.stateCode || '',
      formName: this.stateForm.formName || '',
      formAsHtml: this.stateForm.formAsHtml || ''
    }, { emitEvent: false });

    this.path = this.stateForm.path || null;
    this.fileDetails = this.stateForm.fileDetails || null;
    this.hasNewFileUpload = false;
    this.previewDataUrl = this.utilityService.resolveFileDetailsDataUrl(this.fileDetails, this.path);
    this.previewContentType = this.utilityService.getContentTypeFromDataUrl(this.previewDataUrl)
      || this.fileDetails?.contentType
      || this.utilityService.getContentTypeFromPath(this.path)
      || null;
    this.fileName = this.fileDetails?.fileName || this.path?.replace(/^.*[/\\]/, '') || null;
    this.setPdfThumbnail(this.previewDataUrl, this.previewContentType, url => this.stateFormPdfThumbnailUrl = url);
  }

  buildRequest(): StateFormRequest {
    const formValue = this.form.value;
    const normalizedHtml = String(formValue.formAsHtml || '').trim();
    const request: StateFormRequest = {
      stateCode: String(formValue.stateCode || '').trim().toUpperCase(),
      formName: String(formValue.formName || '').trim(),
      formAsHtml: normalizedHtml || null,
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      path: this.hasNewFileUpload ? undefined : this.path
    };

    if (!this.isAddMode && this.stateForm) {
      request.stateFormId = this.stateForm.stateFormId;
    }

    return request;
  }
  //#endregion

  normalizeStateCodes(stateCodes: string[]): string[] {
    return [this.allStatesCode, ...(stateCodes || [])]
      .map(stateCode => String(stateCode || '').trim().toUpperCase())
      .filter((stateCode, index, array) => stateCode.length === 2 && array.indexOf(stateCode) === index);
  }

  //#region Form Response Methods
  async uploadDocument(event: Event): Promise<void> {
    this.isUploadingDocument = true;
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      this.isUploadingDocument = false;
      return;
    }

    try {
      this.fileName = file.name;
      this.previewContentType = file.type;
      this.path = null;
      this.hasNewFileUpload = true;
      this.form.patchValue({ fileUpload: file });
      this.form.get('fileUpload')?.updateValueAndValidity();
      this.fileDetails = { contentType: file.type, fileName: file.name, file: '', dataUrl: '' };

      const reader = new FileReader();
      reader.onload = async (): Promise<void> => {
        const dataUrl = reader.result as string;
        this.previewDataUrl = dataUrl;
        if (this.fileDetails) {
          this.fileDetails.dataUrl = dataUrl;
          this.fileDetails.file = dataUrl.split(',')[1] ?? '';
        }

        this.setPdfThumbnail(dataUrl, file.type, url => this.stateFormPdfThumbnailUrl = url);
        if (this.isHtmlDocument(file.type, file.name)) {
          const htmlText = await file.text();
          this.form.patchValue({ formAsHtml: htmlText });
        }
      };
      reader.readAsDataURL(file);

      this.form.markAsDirty();
    } finally {
      this.isUploadingDocument = false;
    }
  }

  removeDocument(): void {
    this.clearDocument();
    this.form.markAsDirty();
  }

  async loadHtmlFile(event: Event): Promise<void> {
    const file = this.utilityService.getFirstSelectedFile(event);
    if (!file) {
      return;
    }

    const isHtmlFile = file.name.toLowerCase().endsWith('.html')
      || file.name.toLowerCase().endsWith('.htm')
      || file.type.toLowerCase().includes('text/html');
    if (!isHtmlFile) {
      this.toastr.warning('Please choose an HTML file (.html or .htm).');
      return;
    }

    const htmlText = await file.text();
    this.form.patchValue({ formAsHtml: htmlText });
    this.form.markAsDirty();
  }

  viewRawHtml(): void {
    const htmlText = String(this.form?.get('formAsHtml')?.value || '');
    if (!htmlText.trim()) {
      this.toastr.warning('No HTML content loaded to view.');
      return;
    }

    // Intentionally open the exact loaded HTML content as-is.
    const htmlBlob = new Blob([htmlText], { type: 'text/html' });
    const htmlUrl = URL.createObjectURL(htmlBlob);
    window.open(htmlUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(htmlUrl), 30000);
  }

  get htmlThumbnailText(): string {
    const htmlValue = String(this.form?.get('formAsHtml')?.value || '').trim();
    if (!htmlValue) {
      return 'No HTML loaded';
    }

    const singleLine = htmlValue.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= 80) {
      return singleLine;
    }
    return `${singleLine.substring(0, 80)}...`;
  }

  isHtmlDocument(contentType: string | null, fileName: string | null): boolean {
    const normalizedType = String(contentType || '').toLowerCase();
    const normalizedName = String(fileName || '').toLowerCase();
    return normalizedType.includes('text/html')
      || normalizedName.endsWith('.html')
      || normalizedName.endsWith('.htm');
  }

  setPdfThumbnail(
    dataUrl: string | null,
    contentType: string | null,
    setter: (url: string | null) => void
  ): void {
    if (!dataUrl || !contentType?.toLowerCase().includes('pdf')) {
      setter(null);
      return;
    }
    setter(null);
    this.pdfThumbnailService.getFirstPageDataUrl(dataUrl).then(url => setter(url));
  }

  openStateFormPreview(event?: Event): void {
    event?.stopPropagation();
    if (!this.previewDataUrl || !String(this.previewDataUrl).startsWith('data:')) {
      this.toastr.warning('Unable to preview this file because file bytes are unavailable.');
      return;
    }

    this.router.navigate(
      [RouterUrl.replaceTokens(RouterUrl.DocumentView, ['inline-preview'])],
      {
        queryParams: { returnTo: 'settings' },
        state: {
          inlineDocument: {
            dataUrl: this.previewDataUrl,
            contentType: this.previewContentType || this.utilityService.getContentTypeFromDataUrl(this.previewDataUrl),
            fileName: this.fileName || this.form?.get('formName')?.value || 'State Form'
          }
        }
      }
    );
  }

  clearDocument(): void {
    this.path = null;
    this.fileName = null;
    this.fileDetails = null;
    this.previewDataUrl = null;
    this.previewContentType = null;
    this.stateFormPdfThumbnailUrl = null;
    this.hasNewFileUpload = false;
    this.form.patchValue({ fileUpload: null });
    this.form.get('fileUpload')?.updateValueAndValidity();
  }
  //#endregion

  //#region Utility Methods
  back(): void {
    this.backEvent.emit();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
