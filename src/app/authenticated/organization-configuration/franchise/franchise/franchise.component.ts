import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { MaterialModule } from '../../../../material.module';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { take, finalize } from 'rxjs';
import { FranchiseService } from '../services/franchise.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { CommonMessage, CommonTimeouts } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { FranchiseResponse, FranchiseRequest } from '../models/franchise.model';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { AuthService } from '../../../../services/auth.service';
import { NavigationContextService } from '../../../../services/navigation-context.service';

@Component({
  selector: 'app-franchise',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './franchise.component.html',
  styleUrl: './franchise.component.scss'
})

export class FranchiseComponent implements OnInit, OnChanges {
  @Input() id: string | number | null = null;
  @Input() embeddedMode: boolean = false;
  @Output() backEvent = new EventEmitter<void>();
  
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  private routeFranchiseId: string | null = null;
  franchise: FranchiseResponse;
  form: FormGroup;
  isSubmitting: boolean = false;
  isLoadError: boolean = false;
  isAddMode: boolean = false;
  returnToSettings: boolean = false;

  constructor(
    public franchiseService: FranchiseService,
    public router: Router,
    public fb: FormBuilder,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private authService: AuthService,
    private navigationContext: NavigationContextService
  ) {
    this.itemsToLoad.push('franchise');
  }

  ngOnInit(): void {
    // Check for returnTo query parameter
    this.route.queryParams.subscribe(params => {
      this.returnToSettings = params['returnTo'] === 'settings';
    });

    // If not in embedded mode, get franchise ID from route
    if (!this.embeddedMode) {
      this.route.paramMap.subscribe((paramMap: ParamMap) => {
        if (paramMap.has('id')) {
          this.routeFranchiseId = paramMap.get('id');
          this.isAddMode = this.routeFranchiseId === 'new';
          if (this.isAddMode) {
            this.removeLoadItem('franchise');
            this.buildForm();
          } else {
            this.getFranchise(this.routeFranchiseId);
          }
        }
      });
      if (!this.isAddMode) {
        this.buildForm();
      }
    } else {
      // In embedded mode, use the input id
      if (this.id) {
        this.isAddMode = this.id === 'new' || this.id === 'new';
        if (this.isAddMode) {
          this.removeLoadItem('franchise');
          this.buildForm();
        } else {
          this.getFranchise(this.id.toString());
        }
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If in embedded mode and id changes, reload franchise
    if (this.embeddedMode && changes['id'] && !changes['id'].firstChange) {
      const newId = changes['id'].currentValue;
      if (newId && newId !== 'new') {
        this.getFranchise(newId.toString());
      } else if (newId === 'new') {
        this.isAddMode = true;
        this.removeLoadItem('franchise');
        this.buildForm();
      }
    }
  }

  getFranchise(id?: string | number): void {
    const idToUse = id || this.id || this.routeFranchiseId;
    if (!idToUse || idToUse === 'new') {
      return;
    }
    const franchiseIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse.toString(), 10);
    if (isNaN(franchiseIdNum)) {
      this.isServiceError = true;
      this.toastr.error('Invalid franchise ID', CommonMessage.Error);
      return;
    }
    this.franchiseService.getFranchiseById(franchiseIdNum).pipe(take(1), finalize(() => { this.removeLoadItem('franchise') })).subscribe({
      next: (response: FranchiseResponse) => {
        this.franchise = response;
        this.buildForm();
        this.populateForm();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load franchise info at this time.' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  saveFranchise(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.value;
    const user = this.authService.getUser();
    const franchiseRequest: FranchiseRequest = {
      organizationId: user?.organizationId || '',
      franchiseCode: formValue.franchiseCode,
      description: formValue.description,
      phone: formValue.phone,
      isActive: formValue.isActive
    };

    if (this.isAddMode) {
      this.franchiseService.createFranchise(franchiseRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: FranchiseResponse) => {
          this.toastr.success('Franchise created successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.FranchiseList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Create franchise request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    } else {
      const idToUse = this.id || this.routeFranchiseId;
      const franchiseIdNum = typeof idToUse === 'number' ? idToUse : parseInt(idToUse?.toString() || '', 10);
      if (isNaN(franchiseIdNum)) {
        this.isLoadError = true;
        this.toastr.error('Invalid franchise ID', CommonMessage.Error);
        return;
      }
      franchiseRequest.franchiseId = franchiseIdNum;
      franchiseRequest.organizationId = this.franchise?.organizationId || user?.organizationId || '';
      this.franchiseService.updateFranchise(franchiseIdNum, franchiseRequest).pipe(take(1), finalize(() => this.isSubmitting = false)).subscribe({
        next: (response: FranchiseResponse) => {
          this.toastr.success('Franchise updated successfully', CommonMessage.Success, { timeOut: CommonTimeouts.Success });
          if (this.embeddedMode) {
            this.backEvent.emit();
          } else if (this.returnToSettings) {
            this.navigationContext.setCurrentAgentId(null);
            this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
          } else {
            this.router.navigateByUrl(RouterUrl.FranchiseList);
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoadError = true;
          if (err.status !== 400) {
            this.toastr.error('Update franchise request has failed. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          }
        }
      });
    }
  }

  // Form Methods
  buildForm(): void {
    this.form = this.fb.group({
      franchiseCode: new FormControl('', [Validators.required]),
      description: new FormControl('', [Validators.required]),
      isActive: new FormControl(true)
    });
  }

  populateForm(): void {
    if (this.franchise && this.form) {
      this.form.patchValue({
        franchiseCode: this.franchise.franchiseCode,
        description: this.franchise.description,
        isActive: this.franchise.isActive
      });
    }
  }

  // Utility Methods
  back(): void {
    if (this.embeddedMode) {
      this.backEvent.emit();
    } else if (this.returnToSettings) {
      this.navigationContext.setCurrentAgentId(null);
      this.router.navigateByUrl(RouterUrl.OrganizationConfiguration);
    } else {
      this.router.navigateByUrl(RouterUrl.FranchiseList);
    }
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

