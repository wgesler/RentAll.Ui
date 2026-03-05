import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { OfficeService } from '../../organizations/services/office.service';
import { ContractorRequest, ContractorDisplayList, ContractorResponse } from '../models/contractor.model';
import { ContractorService } from '../services/contractor.service';

@Component({
  standalone: true,
  selector: 'app-contractor',
  imports: [CommonModule, MaterialModule, ReactiveFormsModule],
  templateUrl: './contractor.component.html',
  styleUrl: './contractor.component.scss'
})
export class ContractorComponent implements OnInit, OnChanges {
  @Input() contractorInput: ContractorDisplayList | null = null;
  @Input() showBackButton: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  @Output() savedEvent = new EventEmitter<void>();

  form: FormGroup;
  contractor: ContractorResponse | null = null;
  organizationId: string = '';
  isAddMode: boolean = true;
  isSubmitting: boolean = false;
  isLoading: boolean = false;
  isServiceError: boolean = false;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  readonly ratingStars: number[] = [1, 2, 3, 4, 5];
  /** True when opened from route; back() navigates to maintenance list */
  fromRoute: boolean = false;
  returnPropertyId: string | null = null;

  constructor(
    fb: FormBuilder,
    private authService: AuthService,
    private formatterService: FormatterService,
    private contractorService: ContractorService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = fb.group({
      contractorCode: new FormControl(''),
      officeId: new FormControl<number | null>(null, [Validators.required]),
      name: new FormControl('', [Validators.required]),
      phone: new FormControl('', [Validators.pattern(/^(\([0-9]{3}\) [0-9]{3}-[0-9]{4}|\+[0-9\s]+)$/)]),
      website: new FormControl(''),
      rating: new FormControl(0, [Validators.min(0), Validators.max(5)]),
      notes: new FormControl(''),
      isActive: new FormControl(true)
    });
  }

  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId || '';
    this.returnPropertyId = this.route.snapshot.queryParamMap.get('propertyId');
    this.loadOffices();
    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const id = paramMap.get('id');
      if (id !== null) {
        this.fromRoute = true;
        this.showBackButton = true;
        this.contractorInput = id === 'new' ? null : { contractorId: id } as ContractorDisplayList;
      }
      this.syncFromInput();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['contractorInput']) {
      this.syncFromInput();
    }
  }

  loadOffices(): void {
    this.officeService.getAllOffices().pipe(take(1)).subscribe({
      next: offices => {
        this.offices = offices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
      }
    });
  }

  syncFromInput(): void {
    this.isServiceError = false;
    const contractorId = this.contractorInput?.contractorId || null;
    this.isAddMode = contractorId === null;

    if (!contractorId) {
      this.contractor = null;
      this.form.reset({
        contractorCode: '',
        officeId: null,
        name: '',
        phone: '',
        website: '',
        rating: 0,
        notes: '',
        isActive: true
      });
      return;
    }

    this.isLoading = true;
    this.contractorService.getContractorById(contractorId).pipe(
      take(1),
      finalize(() => { this.isLoading = false; })
    ).subscribe({
      next: (contractor: ContractorResponse) => {
        this.contractor = contractor;
        this.form.patchValue({
          contractorCode: contractor.contractorCode || '',
          officeId: contractor.officeId,
          name: contractor.name || '',
          phone: this.formatterService.phoneNumber(contractor.phone || ''),
          website: contractor.website || '',
          rating: contractor.rating ?? 0,
          notes: contractor.notes || '',
          isActive: contractor.isActive
        });
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.contractor = null;
      }
    });
  }

  saveContractor(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.organizationId) {
      this.organizationId = this.authService.getUser()?.organizationId || '';
      if (!this.organizationId) {
        this.isServiceError = true;
        return;
      }
    }

    const formValue = this.form.getRawValue();
    const phoneDigits = this.formatterService.stripPhoneFormatting(formValue.phone || '');
    const payload: ContractorRequest = {
      contractorId: this.contractor?.contractorId || undefined,
      organizationId: this.organizationId,
      officeId: Number(formValue.officeId),
      contractorCode: (formValue.contractorCode || '').trim() || undefined,
      name: (formValue.name || '').trim(),
      phone: phoneDigits || null,
      website: (formValue.website || '').trim() || null,
      rating: Number(formValue.rating || 0),
      notes: (formValue.notes || '').trim() || null,
      isActive: formValue.isActive === true
    };

    if (!payload.officeId || !payload.name) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.isServiceError = false;
    const save$ = this.isAddMode
      ? this.contractorService.createContractor(payload)
      : this.contractorService.updateContractor(payload);

    save$.pipe(
      take(1),
      finalize(() => { this.isSubmitting = false; })
    ).subscribe({
      next: (saved: ContractorResponse) => {
        this.contractor = saved;
        this.isAddMode = false;
        this.form.patchValue({
          contractorCode: saved.contractorCode || '',
          officeId: saved.officeId,
          name: saved.name || '',
          phone: this.formatterService.phoneNumber(saved.phone || ''),
          website: saved.website || '',
          rating: saved.rating ?? 0,
          notes: saved.notes || '',
          isActive: saved.isActive
        });
        this.savedEvent.emit();
        if (this.fromRoute) {
          this.navigateBackToContractorList();
        }
      },
      error: (_err: HttpErrorResponse) => {
        this.isServiceError = true;
      }
    });
  }

  back(): void {
    if (this.fromRoute) {
      this.navigateBackToContractorList();
      return;
    }
    this.backEvent.emit();
  }

  navigateBackToContractorList(): void {
    if (this.returnPropertyId) {
      const maintenanceUrl = RouterUrl.replaceTokens(RouterUrl.Maintenance, [this.returnPropertyId]);
      this.router.navigate(['/' + maintenanceUrl], { queryParams: { tab: 3 } });
      return;
    }
    this.router.navigateByUrl(RouterUrl.MaintenanceList);
  }

  formatPhone(): void {
    this.formatterService.formatPhoneControl(this.form.get('phone'));
  }

  onPhoneInput(event: Event): void {
    this.formatterService.formatPhoneInput(event, this.form.get('phone'));
  }

  get ratingValue(): number {
    const raw = Number(this.form.get('rating')?.value ?? 0);
    if (Number.isNaN(raw)) {
      return 0;
    }
    return Math.max(0, Math.min(5, raw));
  }

  setRating(value: number): void {
    const normalized = Math.max(0, Math.min(5, value));
    this.form.get('rating')?.setValue(normalized);
    this.form.get('rating')?.markAsDirty();
    this.form.get('rating')?.markAsTouched();
  }
}
