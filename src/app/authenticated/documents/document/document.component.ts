import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { FileDetails } from '../../../shared/models/fileDetails';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { DocumentType, getDocumentType } from '../models/document.enum';
import { DocumentRequest, DocumentResponse } from '../models/document.model';
import { DocumentService } from '../services/document.service';

@Component({
    selector: 'app-document',
    imports: [
        CommonModule,
        MaterialModule,
        FormsModule,
        ReactiveFormsModule
    ],
    templateUrl: './document.component.html',
    styleUrls: ['./document.component.scss']
})
export class DocumentComponent implements OnInit, OnDestroy {
  isServiceError: boolean = false;
  documentId: string;
  document: DocumentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isAddMode: boolean = false;
  selectedFile: File | null = null;
  filePreview: string | null = null;
  fileDetails: FileDetails = null;
  hasNewFileUpload: boolean = false; // Track if fileDetails is from a new upload vs API response
  officesSubscription?: Subscription;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
 organizationId: string = '';

  documentTypes: { value: DocumentType, label: string }[] = [
    { value: DocumentType.Other, label: 'Other' },
    { value: DocumentType.PropertyLetter, label: 'Welcome Letter' },
    { value: DocumentType.ReservationLease, label: 'Reservation Lease' }
  ];

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public documentService: DocumentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private officeService: OfficeService,
    private mappingService: MappingService
  ) {
  }

  //#region Documents
  ngOnInit(): void {
    // Get organization ID from auth service
    const user = this.authService.getUser();
    this.organizationId = user?.organizationId || '';

    this.loadOffices();

    this.route.paramMap.pipe(take(1)).subscribe(params => {
      const id = params.get('id');
      if (id && id !== 'new') {
        this.documentId = id;
        this.isAddMode = false;
        const currentSet = this.itemsToLoad$.value;
        const newSet = new Set(currentSet);
        newSet.add('document');
        this.itemsToLoad$.next(newSet);
        this.loadDocument();
      } else {
        this.isAddMode = true;
        this.buildForm();
      }
    });
  }

  loadDocument(): void {
    this.documentService.getDocumentByGuid(this.documentId).pipe(take(1), finalize(() => { this.removeLoadItem('document'); })).subscribe({
      next: (document) => {
        this.document = document;
        this.buildForm();
        this.patchForm(document);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  saveDocument(): void {
    if (!this.form || !this.form.valid) {
      this.toastr.warning('Please fill in all required fields', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    // Convert DocumentType enum to documentTypeId (number) for API request
    const documentTypeId = Number(formValue.documentType);
    
    const documentRequest: DocumentRequest = {
      documentId: this.isAddMode ? undefined : formValue.documentId,
      organizationId: formValue.organizationId,
      officeId: formValue.officeId,
      documentTypeId: documentTypeId,
      fileName: formValue.fileName,
      fileExtension: formValue.fileExtension,
      contentType: formValue.contentType,
      documentPath: '', // Set to empty string since it's removed from form
      // Only send fileDetails if a new file was uploaded (not from API response)
      fileDetails: this.hasNewFileUpload ? this.fileDetails : undefined,
      isDeleted: formValue.isDeleted
    };

    const saveOperation = this.isAddMode
      ? this.documentService.createDocument(documentRequest)
      : this.documentService.updateDocument(documentRequest);

    saveOperation.pipe(
      take(1),
      finalize(() => { this.isSubmitting = false })
    ).subscribe({
      next: (response) => {
        this.toastr.success(
          `Document ${this.isAddMode ? 'created' : 'updated'} successfully`,
          CommonMessage.Success
        );
        this.back();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      const fileName = this.selectedFile.name;
      const fileExtension = fileName.split('.').pop() || '';
      const contentType = this.selectedFile.type;

      // Update form with file information
      this.form.patchValue({
        fileName: fileName.replace('.' + fileExtension, ''),
        fileExtension: fileExtension,
        contentType: contentType
      });

      // Collect FileDetails similar to company logo
      this.hasNewFileUpload = true; // Mark that this is a new file upload
      
      this.fileDetails = <FileDetails>({ 
        contentType: this.selectedFile.type, 
        fileName: this.selectedFile.name, 
        file: '', 
        dataUrl: '' 
      });
      
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        // Convert file to base64 string
        const base64String = btoa(fileReader.result as string);
        this.fileDetails.file = base64String;
        this.fileDetails.dataUrl = `data:${this.selectedFile.type};base64,${base64String}`;
        
        // Create preview for images
        if (this.selectedFile.type.startsWith('image/')) {
          this.filePreview = this.fileDetails.dataUrl;
        } else {
          this.filePreview = null;
        }
      };
      fileReader.readAsBinaryString(this.selectedFile);
    }
  }

  removeFile(): void {
    this.selectedFile = null;
    this.filePreview = null;
    this.fileDetails = null;
    this.hasNewFileUpload = false;
    
    // Clear file-related form fields
    this.form.patchValue({
      fileName: '',
      fileExtension: '',
      contentType: ''
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    // Wait for offices to be loaded initially, then subscribe to changes then subscribe for updates
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      });
      this.removeLoadItem('offices');
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      documentId: new FormControl(''),
      organizationId: new FormControl(this.organizationId, [Validators.required]),
      officeId: new FormControl<number | null>(null),
      documentType: new FormControl<DocumentType>(DocumentType.Other, [Validators.required]),
      fileName: new FormControl('', [Validators.required]),
      fileExtension: new FormControl('', [Validators.required]),
      contentType: new FormControl('', [Validators.required]),
      isDeleted: new FormControl(false)
    });
  }

  patchForm(document: DocumentResponse): void {
    if (!this.form) return;

    // Convert documentTypeId (number) to DocumentType enum for form
    const documentTypeValue = Number(document.documentTypeId) as DocumentType;

    // Load fileDetails from API response if present
    if (document.fileDetails && document.fileDetails.file) {
      // Convert document model FileDetails to shared FileDetails format
      this.fileDetails = {
        fileName: document.fileDetails.fileName || document.fileName || '',
        contentType: document.fileDetails.contentType || document.contentType || '',
        file: document.fileDetails.file,
        dataUrl: document.fileDetails.dataUrl || (document.fileDetails.contentType && document.fileDetails.file 
          ? `data:${document.fileDetails.contentType};base64,${document.fileDetails.file}` 
          : '')
      };
      this.hasNewFileUpload = false; // FileDetails from API, not a new upload
      
      // Set filePreview for display (images only)
      if (document.contentType?.startsWith('image/')) {
        this.filePreview = this.fileDetails.dataUrl || `data:${this.fileDetails.contentType};base64,${this.fileDetails.file}`;
      } else {
        this.filePreview = null;
      }
    } else {
      this.fileDetails = null;
      this.filePreview = null;
    }

    this.form.patchValue({
      documentId: document.documentId,
      organizationId: document.organizationId,
      officeId: document.officeId,
      documentType: documentTypeValue as DocumentType,
      fileName: document.fileName,
      fileExtension: document.fileExtension,
      contentType: document.contentType,
      isDeleted: document.isDeleted
    });
  }
  //#endregion

  //#region File Request Methods
  uploadFile(documentId: string): void {
    if (!this.selectedFile) {
      this.back();
      return;
    }

    const formData = new FormData();
    formData.append('file', this.selectedFile);
    formData.append('documentId', documentId);

    this.documentService.uploadDocument(formData).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('File uploaded successfully', CommonMessage.Success);
        this.back();
      },
      error: (err: HttpErrorResponse) => {
        this.toastr.error('Could not upload file. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        this.back();
      }
    });
  }

  downloadDocument(): void {
    if (!this.documentId) return;

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
  //#endregion

  //#region Utility Methods
  getDocumentTypeName(documentType: DocumentType): string {
    const docType = this.documentTypes.find(dt => dt.value === documentType);
    return docType ? docType.label : getDocumentType(documentType) || 'Other';
  }

  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.DocumentList);
  }
  //#endregion
}

