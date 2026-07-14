import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { UtilityService } from '../../../services/utility.service';
import { OwnerAgreementInformationRequest, OwnerAgreementInformationResponse } from '../models/owner-agreement-information.model';
import { OwnersService } from '../services/owners.service';

type AgreementInfoScopeOption = 'organization' | 'office' | 'property';

@Component({
  standalone: true,
  selector: 'app-owner-agreement-information',
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule],
  templateUrl: './owner-agreement-information.component.html',
  styleUrl: './owner-agreement-information.component.scss'
})
export class OwnerAgreementInformationComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() propertyId: string | null = null;
  private fb = inject(FormBuilder);
  private ownersService = inject(OwnersService);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private utilityService = inject(UtilityService);

  form: FormGroup = this.buildForm();
  isSubmitting = false;
  isPageReady = false;
  agreementInformation: OwnerAgreementInformationResponse | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['ownerAgreementInformation']));
  destroy$ = new Subject<void>();

  //#region Owner-Agreement-Information
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.getAgreementInformation(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const propertyIdChanged = changes['propertyId'] && (changes['propertyId'].previousValue !== changes['propertyId'].currentValue);
    const officeIdChanged = changes['officeId'] && (changes['officeId'].previousValue !== changes['officeId'].currentValue);
    if (propertyIdChanged || officeIdChanged) {
      this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerAgreementInformation');
      this.getAgreementInformation(true);
    }
  }

  getAgreementInformation(useMostSpecificScope: boolean = false): void {
    const scope = useMostSpecificScope
      ? { officeId: this.officeId, propertyId: this.propertyId }
      : this.resolveScope();
    if (!scope) {
      this.agreementInformation = null;
      this.resetAgreementContentFields();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerAgreementInformation');
      return;
    }

    this.ownersService.getAgreementInformationByContext(null, scope.officeId, scope.propertyId).pipe(take(1),finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'ownerAgreementInformation');
    })).subscribe({
      next: (response: OwnerAgreementInformationResponse | null) => {
        if (response) {
          this.agreementInformation = response;
          this.populateForm(response);
          if (useMostSpecificScope) {
            this.form.patchValue({ scopeSelection: this.resolveScopeSelectionFromResponse(response) }, { emitEvent: false });
          }
          return;
        }
        this.agreementInformation = null;
        this.resetAgreementContentFields();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.agreementInformation = null;
          this.resetAgreementContentFields();
        }
      }
    });
  }

  saveOwnerAgreementInformation(): void {
    const selectedScope = this.form.get('scopeSelection')?.value as AgreementInfoScopeOption | null;
    if (!selectedScope) {
      this.toastr.warning('Please select Organization, Office, or Property scope before saving.', 'Warning');
      return;
    }

    const scope = this.resolveScope();
    if (!scope) {
      this.toastr.warning('The selected scope is missing required values.', 'Warning');
      return;
    }

    const organizationId = String(this.authService.getUser()?.organizationId || '').trim();
    if (!organizationId) {
      this.toastr.warning('Organization context is required to save agreement information.', 'Warning');
      return;
    }

    this.isSubmitting = true;
    const formValue = this.form.getRawValue();
    const request: OwnerAgreementInformationRequest = {
      ownerAgreementInformationId: this.agreementInformation?.ownerAgreementInformationId,
      organizationId,
      officeId: scope.officeId,
      propertyId: scope.propertyId,
      agreementIntroduction: formValue.agreementIntroduction || null,
      recitals: formValue.recitals || null,
      sectionOneEmployment: formValue.sectionOneEmployment || null,
      sectionOneEmploymentSplit: formValue.sectionOneEmploymentSplit || null,
      sectionOneEmploymentMinimum: formValue.sectionOneEmploymentMinimum || null,
      sectionOneEmploymentFlat: formValue.sectionOneEmploymentFlat || null,
      sectionTwoAgentDuties: formValue.sectionTwoAgentDuties || null,
      sectionThreeOwnersDuties: formValue.sectionThreeOwnersDuties || null,
      sectionFourAdvertisingAndPromotion: formValue.sectionFourAdvertisingAndPromotion || null,
      sectionFiveMaintenanceRepairsAndOperations: formValue.sectionFiveMaintenanceRepairsAndOperations || null,
      sectionSixReimbursements: formValue.sectionSixReimbursements || null,
      sectionSevenGovernmentRegulations: formValue.sectionSevenGovernmentRegulations || null,
      sectionEightInsurance: formValue.sectionEightInsurance || null,
      sectionNineCollectionOfIncomeAndInstitutionOfLegalAction: formValue.sectionNineCollectionOfIncomeAndInstitutionOfLegalAction || null,
      sectionTenBankAccounts: formValue.sectionTenBankAccounts || null,
      sectionElevenRecordsAndReports: formValue.sectionElevenRecordsAndReports || null,
      sectionTwelveAdditionalDutiesAndRights: formValue.sectionTwelveAdditionalDutiesAndRights || null,
      sectionThirteenTerminationAndRenewal: formValue.sectionThirteenTerminationAndRenewal || null,
      sectionFourteenSaleOfPropertyAccess: formValue.sectionFourteenSaleOfPropertyAccess || null,
      sectionFifteenSummaryOfFees: formValue.sectionFifteenSummaryOfFees || null,
      sectionSixteenForeignOwnership: formValue.sectionSixteenForeignOwnership || null,
      sectionSeventeenIndemnity: formValue.sectionSeventeenIndemnity || null,
      sectionEighteenMiscellaneous: formValue.sectionEighteenMiscellaneous || null,
      sectionNineteenAdditionalForms: formValue.sectionNineteenAdditionalForms || null,
      inWitnessWhereof: formValue.inWitnessWhereof || null
    };

    const saveOperation = this.agreementInformation?.ownerAgreementInformationId
      ? this.ownersService.updateAgreementInformationByContext(request)
      : this.ownersService.createAgreementInformationByContext(request);

    saveOperation.pipe(take(1),finalize(() => {
      this.isSubmitting = false;
    })).subscribe({
      next: (response: OwnerAgreementInformationResponse | null) => {
        if (!response) {
          return;
        }
        this.agreementInformation = response;
        this.toastr.success('Agreement information saved successfully', CommonMessage.Success);
      },
      error: () => {}
    });
  }
  //#endregion

  //#region Form Methods
  buildForm(): FormGroup {
    return this.fb.group({
      scopeSelection: new FormControl<AgreementInfoScopeOption | null>(this.getDefaultScopeSelection()),
      agreementIntroduction: new FormControl<string | null>(null),
      recitals: new FormControl<string | null>(null),
      sectionOneEmployment: new FormControl<string | null>(null),
      sectionOneEmploymentSplit: new FormControl<string | null>(null),
      sectionOneEmploymentMinimum: new FormControl<string | null>(null),
      sectionOneEmploymentFlat: new FormControl<string | null>(null),
      sectionTwoAgentDuties: new FormControl<string | null>(null),
      sectionThreeOwnersDuties: new FormControl<string | null>(null),
      sectionFourAdvertisingAndPromotion: new FormControl<string | null>(null),
      sectionFiveMaintenanceRepairsAndOperations: new FormControl<string | null>(null),
      sectionSixReimbursements: new FormControl<string | null>(null),
      sectionSevenGovernmentRegulations: new FormControl<string | null>(null),
      sectionEightInsurance: new FormControl<string | null>(null),
      sectionNineCollectionOfIncomeAndInstitutionOfLegalAction: new FormControl<string | null>(null),
      sectionTenBankAccounts: new FormControl<string | null>(null),
      sectionElevenRecordsAndReports: new FormControl<string | null>(null),
      sectionTwelveAdditionalDutiesAndRights: new FormControl<string | null>(null),
      sectionThirteenTerminationAndRenewal: new FormControl<string | null>(null),
      sectionFourteenSaleOfPropertyAccess: new FormControl<string | null>(null),
      sectionFifteenSummaryOfFees: new FormControl<string | null>(null),
      sectionSixteenForeignOwnership: new FormControl<string | null>(null),
      sectionSeventeenIndemnity: new FormControl<string | null>(null),
      sectionEighteenMiscellaneous: new FormControl<string | null>(null),
      sectionNineteenAdditionalForms: new FormControl<string | null>(null),
      inWitnessWhereof: new FormControl<string | null>(null)
    });
  }

  populateForm(agreementInformation: OwnerAgreementInformationResponse): void {
    this.form.patchValue({
      agreementIntroduction: agreementInformation.agreementIntroduction || null,
      recitals: agreementInformation.recitals || null,
      sectionOneEmployment: agreementInformation.sectionOneEmployment || agreementInformation.sectionOneEmploymentOfAvenueWest || null,
      sectionOneEmploymentSplit: agreementInformation.sectionOneEmploymentSplit || null,
      sectionOneEmploymentMinimum: agreementInformation.sectionOneEmploymentMinimum || null,
      sectionOneEmploymentFlat: agreementInformation.sectionOneEmploymentFlat || null,
      sectionTwoAgentDuties: agreementInformation.sectionTwoAgentDuties || null,
      sectionThreeOwnersDuties: agreementInformation.sectionThreeOwnersDuties || null,
      sectionFourAdvertisingAndPromotion: agreementInformation.sectionFourAdvertisingAndPromotion || null,
      sectionFiveMaintenanceRepairsAndOperations: agreementInformation.sectionFiveMaintenanceRepairsAndOperations || null,
      sectionSixReimbursements: agreementInformation.sectionSixReimbursements || null,
      sectionSevenGovernmentRegulations: agreementInformation.sectionSevenGovernmentRegulations || null,
      sectionEightInsurance: agreementInformation.sectionEightInsurance || null,
      sectionNineCollectionOfIncomeAndInstitutionOfLegalAction: agreementInformation.sectionNineCollectionOfIncomeAndInstitutionOfLegalAction || null,
      sectionTenBankAccounts: agreementInformation.sectionTenBankAccounts || null,
      sectionElevenRecordsAndReports: agreementInformation.sectionElevenRecordsAndReports || null,
      sectionTwelveAdditionalDutiesAndRights: agreementInformation.sectionTwelveAdditionalDutiesAndRights || agreementInformation.sectionTwelveAdditionalDutiesAndRightsOfAvenueWest || null,
      sectionThirteenTerminationAndRenewal: agreementInformation.sectionThirteenTerminationAndRenewal || null,
      sectionFourteenSaleOfPropertyAccess: agreementInformation.sectionFourteenSaleOfPropertyAccess || null,
      sectionFifteenSummaryOfFees: agreementInformation.sectionFifteenSummaryOfFees || null,
      sectionSixteenForeignOwnership: agreementInformation.sectionSixteenForeignOwnership || null,
      sectionSeventeenIndemnity: agreementInformation.sectionSeventeenIndemnity || null,
      sectionEighteenMiscellaneous: agreementInformation.sectionEighteenMiscellaneous || null,
      sectionNineteenAdditionalForms: agreementInformation.sectionNineteenAdditionalForms || null,
      inWitnessWhereof: agreementInformation.inWitnessWhereof || null
    });
  }

  resetAgreementContentFields(): void {
    this.form.patchValue({
      agreementIntroduction: null,
      recitals: null,
      sectionOneEmployment: null,
      sectionOneEmploymentSplit: null,
      sectionOneEmploymentMinimum: null,
      sectionOneEmploymentFlat: null,
      sectionTwoAgentDuties: null,
      sectionThreeOwnersDuties: null,
      sectionFourAdvertisingAndPromotion: null,
      sectionFiveMaintenanceRepairsAndOperations: null,
      sectionSixReimbursements: null,
      sectionSevenGovernmentRegulations: null,
      sectionEightInsurance: null,
      sectionNineCollectionOfIncomeAndInstitutionOfLegalAction: null,
      sectionTenBankAccounts: null,
      sectionElevenRecordsAndReports: null,
      sectionTwelveAdditionalDutiesAndRights: null,
      sectionThirteenTerminationAndRenewal: null,
      sectionFourteenSaleOfPropertyAccess: null,
      sectionFifteenSummaryOfFees: null,
      sectionSixteenForeignOwnership: null,
      sectionSeventeenIndemnity: null,
      sectionEighteenMiscellaneous: null,
      sectionNineteenAdditionalForms: null,
      inWitnessWhereof: null
    }, { emitEvent: false });
  }
  //#endregion

  //#region Form Response Methods
  onScopeSelectionChange(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'ownerAgreementInformation');
    this.getAgreementInformation(false);
  }

  getDefaultScopeSelection(): AgreementInfoScopeOption | null {
    return 'organization';
  }

  resolveScope(): { officeId: number | null; propertyId: string | null } | null {
    const selectedScope = this.form.get('scopeSelection')?.value as AgreementInfoScopeOption | null;
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

  resolveScopeSelectionFromResponse(response: OwnerAgreementInformationResponse): AgreementInfoScopeOption {
    if (response.propertyId) {
      return 'property';
    }
    if (response.officeId) {
      return 'office';
    }
    return 'organization';
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
