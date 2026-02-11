import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, finalize, map, take } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { LeaseInformationRequest, LeaseInformationResponse } from '../models/lease-information.model';
import { LeaseInformationService } from '../services/lease-information.service';
import { LeaseReloadService } from '../services/lease-reload.service';

@Component({
  selector: 'app-lease-information',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './lease-information.component.html',
  styleUrl: './lease-information.component.scss'
})
export class LeaseInformationComponent implements OnInit, OnDestroy, OnChanges {
  @Input() reservationId: string | null = null;
  @Input() propertyId: string | null = null;
  @Input() contactId: string | null = null;
  form: FormGroup;
  isSubmitting: boolean = false;
  leaseInformation: LeaseInformationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['leaseInformation']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    private fb: FormBuilder,
    private leaseInformationService: LeaseInformationService,
    private authService: AuthService,
    private toastr: ToastrService,
    private leaseReloadService: LeaseReloadService,
    private utilityService: UtilityService
  ) {
    this.form = this.buildForm();
  }

  //#region Lease-Information
  ngOnInit(): void {
    this.getLeaseInformation();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reload lease information when propertyId or contactId changes
    const propertyIdChanged = changes['propertyId'] && 
      (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const contactIdChanged = changes['contactId'] && 
      (changes['contactId'].previousValue !== changes['contactId'].currentValue);
    
    // If either changed and both are now available, load the lease information
    if ((propertyIdChanged || contactIdChanged) && this.propertyId && this.contactId) {
      // Reset loading state
      this.utilityService.addLoadItem(this.itemsToLoad$, 'leaseInformation');
      this.getLeaseInformation();
    } else if ((propertyIdChanged || contactIdChanged) && (!this.propertyId || !this.contactId)) {
      // If inputs became null/undefined, clear the form
      this.leaseInformation = null;
      this.form.reset();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
    }
  }

  getLeaseInformation(): void {
    // This loads on add-reservation, no need to do anything
    if (!this.propertyId || !this.contactId) {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
      return;
    }

    // Try to get by propertyId first
    this.leaseInformationService.getLeaseInformationByPropertyId(this.propertyId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation'); })).subscribe({
      next: (response: LeaseInformationResponse) => {
        if (response) {
          this.leaseInformation = response;
          this.populateForm(response);
        }
      },
      error: (err: HttpErrorResponse) => {
        // If not found by propertyId, that's okay - form will remain empty
        if (err.status === 404) {
          // Lease information doesn't exist yet, that's fine
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
          return;
        }
        if (err.status !== 400) {
          this.toastr.error('Could not load lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leaseInformation');
      }
    });
  }

  saveLeaseInformation(): void {
    if (!this.propertyId || !this.contactId) {
      this.toastr.warning('Property and Contact are required to save lease information', 'Warning');
      return;
    }

    this.isSubmitting = true;
    const user = this.authService.getUser();
    const formValue = this.form.getRawValue();

    const leaseInformationRequest: LeaseInformationRequest = {
      leaseInformationId: this.leaseInformation?.leaseInformationId,
      organizationId: user?.organizationId || '',
      propertyId: this.propertyId,
      contactId: this.contactId,
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
        this.leaseReloadService.triggerReload();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status !== 400) {
          this.toastr.error('Failed to save lease information. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
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
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.itemsToLoad$.complete();
  }
  //#endregion
}

