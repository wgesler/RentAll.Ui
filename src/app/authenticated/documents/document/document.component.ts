import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { DocumentService } from '../services/document.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { DocumentResponse, DocumentRequest, DocumentType } from '../models/document.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { OfficeService } from '../../organization-configuration/office/services/office.service';
import { OfficeResponse } from '../../organization-configuration/office/models/office.model';

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './document.component.html',
  styleUrls: ['./document.component.scss']
})
export class DocumentComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  documentId: string;
  document: DocumentResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  selectedFile: File | null = null;
  filePreview: string | null = null;

  documentTypes: { value: DocumentType, label: string }[] = [
    { value: DocumentType.Unknown, label: 'Unknown' },
    { value: DocumentType.PropertyLetter, label: 'Property Letter' },
    { value: DocumentType.ReservationLease, label: 'Reservation Lease' }
  ];

  offices: OfficeResponse[] = [];
  organizationId: string = '';

  constructor(
    public documentService: DocumentService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private officeService: OfficeService
  ) {
    this.itemsToLoad.push('document');
  }

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
        this.loadDocument();
      } else {
        this.isAddMode = true;
        this.buildForm();
        this.removeLoadItem('document');
      }
    });
  }

  loadOffices(): void {
    this.officeService.getOffices().pipe(take(1)).subscribe({
      next: (offices) => {
        this.offices = offices || [];
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error loading offices:', err);
        this.offices = [];
      }
    });
  }

  loadDocument(): void {
    this.documentService.getDocumentByGuid(this.documentId).pipe(
      take(1),
      finalize(() => { this.removeLoadItem('document') })
    ).subscribe({
      next: (document) => {
        this.document = document;
        this.buildForm();
        this.patchFormFromResponse(document);
      },
      error: (err: HttpErrorResponse) => {
        this.isLoadError = true;
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Document', CommonMessage.ServiceError);
        }
      }
    });
  }

  buildForm(): void {
    this.form = this.fb.group({
      documentId: new FormControl(''),
      organizationId: new FormControl(this.organizationId, [Validators.required]),
      officeId: new FormControl<number | null>(null),
      documentType: new FormControl<DocumentType>(DocumentType.Unknown, [Validators.required]),
      fileName: new FormControl('', [Validators.required]),
      fileExtension: new FormControl('', [Validators.required]),
      contentType: new FormControl('', [Validators.required]),
      documentPath: new FormControl('', [Validators.required]),
      isDeleted: new FormControl(false)
    });
  }

  patchFormFromResponse(document: DocumentResponse): void {
    if (!this.form) return;

    this.form.patchValue({
      documentId: document.documentId,
      organizationId: document.organizationId,
      officeId: document.officeId,
      documentType: document.documentType,
      fileName: document.fileName,
      fileExtension: document.fileExtension,
      contentType: document.contentType,
      documentPath: document.documentPath,
      isDeleted: document.isDeleted
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

      // Create preview for images
      if (this.selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.filePreview = e.target?.result as string;
        };
        reader.readAsDataURL(this.selectedFile);
      } else {
        this.filePreview = null;
      }
    }
  }

  saveDocument(): void {
    if (!this.form || !this.form.valid) {
      this.toastr.warning('Please fill in all required fields', CommonMessage.Error);
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const documentRequest: DocumentRequest = {
      documentId: this.isAddMode ? undefined : formValue.documentId,
      organizationId: formValue.organizationId,
      officeId: formValue.officeId,
      documentType: formValue.documentType,
      fileName: formValue.fileName,
      fileExtension: formValue.fileExtension,
      contentType: formValue.contentType,
      documentPath: formValue.documentPath,
      isDeleted: formValue.isDeleted
    };

    const saveOperation = this.isAddMode
      ? this.documentService.createDocument(documentRequest)
      : this.documentService.updateDocument(this.documentId, documentRequest);

    saveOperation.pipe(
      take(1),
      finalize(() => { this.isSubmitting = false })
    ).subscribe({
      next: (response) => {
        this.toastr.success(
          `Document ${this.isAddMode ? 'created' : 'updated'} successfully`,
          CommonMessage.Success
        );
        
        // If file was selected, upload it
        if (this.selectedFile) {
          this.uploadFile(response.documentId);
        } else {
          this.back();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error(
            `Could not ${this.isAddMode ? 'create' : 'update'} document. ${CommonMessage.TryAgain}`,
            CommonMessage.ServiceError
          );
        } else {
          this.toastr.error(err.error?.message || `Could not ${this.isAddMode ? 'create' : 'update'} document`, CommonMessage.Error);
        }
      }
    });
  }

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

  back(): void {
    this.router.navigateByUrl(RouterUrl.DocumentList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

