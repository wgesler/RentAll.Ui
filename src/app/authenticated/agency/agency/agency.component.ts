import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MaterialModule } from '../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { AgencyService } from '../services/agency.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts, emptyGuid } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { AgencyResponse, AgencyListDisplay } from '../models/agency.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { FileDetails } from '../models/file-details.model';
import { fileValidator } from '../../../validators/file-validator';
import { ExternalStorageService } from '../../../services/external-storage.service';

@Component({
  selector: 'app-agency',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './agency.component.html',
  styleUrl: './agency.component.scss'
})

export class AgencyComponent implements OnInit {
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  agencyId: string;
  agency: AgencyListDisplay;
  form: FormGroup;
  fileDetails: FileDetails = null;
  fileName: string = null;
  logoImgUrl: string = null;
  logoStorageId?: string = null;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isUploadingLogo: boolean = false;

  constructor(
    public agencyService: AgencyService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private externalStorageService: ExternalStorageService
  ) {
    this.itemsToLoad.push('agency');
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((paramMap: ParamMap) => {
      if (paramMap.has('id')) {
        this.agencyId = paramMap.get('id');
        this.getAgency();
      }
    });
    this.buildForm();
  }

  buildForm(): void {
    this.form = new FormGroup({
      fileUpload: new FormControl('', { validators: [], asyncValidators: [fileValidator(['png', 'jpg', 'jpeg', 'jfif', 'gif'], ['image/png', 'image/jpeg', 'image/gif'], 2000000, true)] })
    });
  }

  back(): void {
    this.router.navigateByUrl(RouterUrl.AgencyList);
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  upload(event: Event): void {
    this.isUploadingLogo = true;
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];

      this.fileName = file.name;
      this.form.patchValue({ fileUpload: file });
      this.form.get('fileUpload').updateValueAndValidity();
      this.logoStorageId = null;

      this.fileDetails = <FileDetails>({ contentType: file.type, fileName: file.name, file: '' });
      const fileReader = new FileReader();
      fileReader.onload = (): void => {
        this.fileDetails.file = btoa(fileReader.result as string);
      };
      fileReader.readAsBinaryString(file);
    }
  }

  updateLogo(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    const agency = {
      agencyId: this.agencyId,
      logoStorageId: this.logoStorageId,
      fileDetails: this.fileDetails,
      isActive: true
    };

    this.agencyService.updateAgencyLogo(this.agencyId, agency).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
      next: (response: AgencyResponse) => {
        if (this.isUploadingLogo) {
          this.getStoragePublicUrl(response.logoStorageId);
          this.fileName = null;
        }
        this.toastr.success('Agency logo updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
      },
      error: (err: HttpErrorResponse) => {
        this.isLoadError = true;
        if (err.status !== 400) {
          this.toastr.error('Update Agency logo request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  getStoragePublicUrl(fileStorageGuid: string): void {
    if (fileStorageGuid && fileStorageGuid !== null && fileStorageGuid !== '' && fileStorageGuid !== emptyGuid) {
      this.logoStorageId = fileStorageGuid;
      this.externalStorageService.getPublicFileUrl(fileStorageGuid)
        .pipe(take(1), finalize(() => this.removeLoadItem('logo'))).subscribe({
          next: (response: string) => {
            this.logoImgUrl = response;
          },
          error: (err: HttpErrorResponse) => {
            this.isLoadError = true;
            if (err.status !== 400) {
              this.toastr.error('Could not get stored logo.', CommonMessage.ServiceError);
            }
          }
        });
    } else {
      this.removeLoadItem('logo');
    }
  }

  private getAgency(): void {
    this.agencyService.getAgencyByGuid(this.agencyId).pipe(take(1),
    finalize(() => { this.removeLoadItem('agency') })).subscribe({
      next: (response: AgencyResponse) => {
        this.agency = response;
        this.getStoragePublicUrl(this.agency.logoStorageId);
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load agency info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
}
