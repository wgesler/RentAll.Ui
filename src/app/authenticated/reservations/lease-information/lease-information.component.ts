
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { LeaseInformationRequest, LeaseInformationResponse } from '../models/lease-information.model';
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseReloadService } from '../services/lease-reload.service';

type LeaseInfoScopeOption = 'organization' | 'office' | 'property';

@Component({
    standalone: true,
    selector: 'app-lease-information',
    imports: [MaterialModule, FormsModule, ReactiveFormsModule],
    templateUrl: './lease-information.component.html',
    styleUrl: './lease-information.component.scss'
})
export class LeaseInformationComponent implements OnInit, OnDestroy, OnChanges {
  private cdr = inject(ChangeDetectorRef);

  @Input() reservationId: string | null = null;
  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  private fb = inject(FormBuilder);
  private leaseInformationService = inject(LeaseInformationService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private leaseReloadService = inject(LeaseReloadService);
  private utilityService = inject(UtilityService);
  form: FormGroup;
  isSubmitting: boolean = false;
  leaseInformation: LeaseInformationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['leaseInformation']));
  isPageReady = false;
  destroy$ = new Subject<void>();

  constructor() {
    this.form = this.buildForm();
  }

  //#region Lease-Information
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.cdr.markForCheck();
    });
    this.getLeaseInformation(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload lease information when scope changes
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const officeIdChanged = changes['officeId'] &&
      (changes['officeId'].previousValue !== changes['officeId'].currentValue);
    
    // If scope changed, refresh from API
    if (propertyIdChanged || officeIdChanged) {
      // Reset loading state
      this.utilityService.addLoadItem(this.itemsToLoad$, 'leaseInformation');
      this.getLeaseInformation(true);
    }
  }

  getLeaseInformation(useMostSpecificScope: boolean = false): void {
    const scope = useMostSpecificScope
      ? { officeId: this.officeId, propertyId: this.propertyId }
      : this.resolveScope();
    if (!scope) {
      this.leaseInformation = null;
      this.resetLeaseContentFields();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
      return;
    }

    this.leaseInformationService.getLeaseInformationByScope(scope.officeId, scope.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation'); })).subscribe({
      next: (response: LeaseInformationResponse) => {
        if (response) {
          this.leaseInformation = response;
          this.populateForm(response);
          if (useMostSpecificScope) {
            this.form.patchValue(
              { scopeSelection: this.resolveScopeSelectionFromResponse(response) },
              { emitEvent: false }
            );
          }
          this.leaseReloadService.triggerReload({
            officeId: response.officeId ?? null,
            propertyId: response.propertyId ?? null
          });
        } else {
          this.leaseInformation = null;
          this.resetLeaseContentFields();
          if (useMostSpecificScope) {
            this.form.patchValue({ scopeSelection: this.getDefaultScopeSelection() }, { emitEvent: false });
          }
          this.leaseReloadService.triggerReload(scope);
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
          return;
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
      }
    });
  }

  saveLeaseInformation(): void {
    const selectedScope = this.form.get('scopeSelection')?.value as LeaseInfoScopeOption | null;
    if (!selectedScope) {
      this.toastr.warning('Please select Organization, Office, or Property scope before saving.', 'Warning');
      return;
    }

    const scope = this.resolveScope();
    if (!scope) {
      this.toastr.warning('The selected scope is missing required values.', 'Warning');
      return;
    }

    this.isSubmitting = true;
    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const leaseInformationRequest: LeaseInformationRequest = {
      leaseInformationId: this.leaseInformation?.leaseInformationId,
      organizationId: user?.organizationId || '',
      officeId: scope.officeId,
      propertyId: scope.propertyId,
      rentalPayment: formValue.rentalPayment || null,
      securityDeposit: formValue.securityDeposit || null,
      securityDepositWaiver: formValue.securityDepositWaiver || null,
      cancellationPolicy: formValue.cancellationPolicy || null,
      keyPickUpDropOff: formValue.keyPickUpDropOff || null,
      partialMonth: formValue.partialMonth || null,
      departureNotification: formValue.departureNotification || null,
      holdover: formValue.holdover || null,
      departureServiceFee: formValue.departureServiceFee || null,
      checkoutProcedure: formValue.checkoutProcedure || null,
      parking: formValue.parking || null,
      rulesAndRegulations: formValue.rulesAndRegulations || null,
      occupyingTenants: formValue.occupyingTenants || null,
      utilityAllowance: formValue.utilityAllowance || null,
      maidService: formValue.maidService || null,
      pets: formValue.pets || null,
      smoking: formValue.smoking || null,
      emergencies: formValue.emergencies || null,
      homeownersAssociation: formValue.homeownersAssociation || null,
      indemnification: formValue.indemnification || null,
      defaultClause: formValue.defaultClause || null,
      attorneyCollectionFees: formValue.attorneyCollectionFees || null,
      reservedRights: formValue.reservedRights || null,
      propertyUse: formValue.propertyUse || null,
      miscellaneous: formValue.miscellaneous || null
    };

    const saveOperation = this.leaseInformation?.leaseInformationId
      ? this.leaseInformationService.updateLeaseInformation(leaseInformationRequest)
      : this.leaseInformationService.createLeaseInformation(leaseInformationRequest);

    saveOperation.pipe(
      take(1),
      finalize(() => this.isSubmitting = false)
    ).subscribe({
      next: (response: LeaseInformationResponse) => {
        this.leaseInformation = response;
        this.toastr.success('Lease information saved successfully', CommonMessage.Success);
        // Trigger lease reload event
        this.leaseReloadService.triggerReload(scope);
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      scopeSelection: new FormControl<LeaseInfoScopeOption | null>(this.getDefaultScopeSelection()),
      rentalPayment: new FormControl<string | null>(null),
      securityDeposit: new FormControl<string | null>(null),
      securityDepositWaiver: new FormControl<string | null>(null),
      cancellationPolicy: new FormControl<string | null>(null),
      keyPickUpDropOff: new FormControl<string | null>(null),
      partialMonth: new FormControl<string | null>(null),
      departureNotification: new FormControl<string | null>(null),
      holdover: new FormControl<string | null>(null),
      departureServiceFee: new FormControl<string | null>(null),
      checkoutProcedure: new FormControl<string | null>(null),
      parking: new FormControl<string | null>(null),
      rulesAndRegulations: new FormControl<string | null>(null),
      occupyingTenants: new FormControl<string | null>(null),
      utilityAllowance: new FormControl<string | null>(null),
      maidService: new FormControl<string | null>(null),
      pets: new FormControl<string | null>(null),
      smoking: new FormControl<string | null>(null),
      emergencies: new FormControl<string | null>(null),
      homeownersAssociation: new FormControl<string | null>(null),
      indemnification: new FormControl<string | null>(null),
      defaultClause: new FormControl<string | null>(null),
      attorneyCollectionFees: new FormControl<string | null>(null),
      reservedRights: new FormControl<string | null>(null),
      propertyUse: new FormControl<string | null>(null),
      miscellaneous: new FormControl<string | null>(null)
    });
  }

  populateForm(leaseInformation: LeaseInformationResponse): void {
    this.form.patchValue({
      scopeSelection: this.form.get('scopeSelection')?.value ?? this.getDefaultScopeSelection(),
      rentalPayment: leaseInformation.rentalPayment || null,
      securityDeposit: leaseInformation.securityDeposit || null,
      securityDepositWaiver: leaseInformation.securityDepositWaiver || null,
      cancellationPolicy: leaseInformation.cancellationPolicy || null,
      keyPickUpDropOff: leaseInformation.keyPickUpDropOff || null,
      partialMonth: leaseInformation.partialMonth || null,
      departureNotification: leaseInformation.departureNotification || null,
      holdover: leaseInformation.holdover || null,
      departureServiceFee: leaseInformation.departureServiceFee || null,
      checkoutProcedure: leaseInformation.checkoutProcedure || null,
      parking: leaseInformation.parking || null,
      rulesAndRegulations: leaseInformation.rulesAndRegulations || null,
      occupyingTenants: leaseInformation.occupyingTenants || null,
      utilityAllowance: leaseInformation.utilityAllowance || null,
      maidService: leaseInformation.maidService || null,
      pets: leaseInformation.pets || null,
      smoking: leaseInformation.smoking || null,
      emergencies: leaseInformation.emergencies || null,
      homeownersAssociation: leaseInformation.homeownersAssociation || null,
      indemnification: leaseInformation.indemnification || null,
      defaultClause: leaseInformation.defaultClause || null,
      attorneyCollectionFees: leaseInformation.attorneyCollectionFees || null,
      reservedRights: leaseInformation.reservedRights || null,
      propertyUse: leaseInformation.propertyUse || null,
      miscellaneous: leaseInformation.miscellaneous || null
    });
  }
 
  resetLeaseContentFields(): void {
    this.form.patchValue({
      rentalPayment: null,
      securityDeposit: null,
      securityDepositWaiver: null,
      cancellationPolicy: null,
      keyPickUpDropOff: null,
      partialMonth: null,
      departureNotification: null,
      holdover: null,
      departureServiceFee: null,
      checkoutProcedure: null,
      parking: null,
      rulesAndRegulations: null,
      occupyingTenants: null,
      utilityAllowance: null,
      maidService: null,
      pets: null,
      smoking: null,
      emergencies: null,
      homeownersAssociation: null,
      indemnification: null,
      defaultClause: null,
      attorneyCollectionFees: null,
      reservedRights: null,
      propertyUse: null,
      miscellaneous: null
    }, { emitEvent: false });
  } //#endregion

  //#region Utility Methods
  onScopeSelectionChange(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'leaseInformation');
    this.getLeaseInformation(false);
  }

  getDefaultScopeSelection(): LeaseInfoScopeOption | null {
    return 'organization';
  }

  resolveScope(): { officeId: number | null; propertyId: string | null } | null {
    const selectedScope = this.form.get('scopeSelection')?.value as LeaseInfoScopeOption | null;
    if (!selectedScope) {
      return null;
    }

    if (selectedScope === 'property') {
      if (!this.propertyId || !this.officeId) {
        return null;
      }
      return { officeId: this.officeId, propertyId: this.propertyId };
    }

    if (selectedScope === 'office') {
      if (!this.officeId) {
        return null;
      }
      return { officeId: this.officeId, propertyId: null };
    }

    return { officeId: null, propertyId: null };
  }

  resolveScopeSelectionFromResponse(response: LeaseInformationResponse): LeaseInfoScopeOption {
    if (response.propertyId) {
      return 'property';
    }

    if (response.officeId) {
      return 'office';
    }

    return 'organization';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

