import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject, Subscription, skip, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { GeneralComponent } from '../general/general.component';
import { GeneralListComponent } from '../general-list/general-list.component';
import { OwnerComponent } from '../owner/owner.component';
import { OwnerListComponent } from '../owner-list/owner-list.component';
import { RentalComponent } from '../rental/rental.component';
import { RentalListComponent } from '../rental-list/rental-list.component';

@Component({
  standalone: true,
  selector: 'app-leads-shell',
  templateUrl: './leads-shell.component.html',
  styleUrls: ['./leads-shell.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    FormsModule,
    TitleBarSelectComponent,
    RentalListComponent,
    RentalComponent,
    OwnerListComponent,
    OwnerComponent,
    GeneralListComponent,
    GeneralComponent
  ]
})
export class LeadsShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  private toastr = inject(ToastrService);
  private authService = inject(AuthService);

  selectedTabIndex = 0;
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
  officeTitleBarShowError = false;

  showRentalLeadForm = false;
  showOwnerLeadForm = false;
  showGeneralLeadForm = false;
  rentalShellLeadId: string | null = null;
  ownerShellLeadId: string | null = null;
  generalShellLeadId: string | null = null;
  /** Tab index to restore when leaving embedded add via title bar Back (0 rental, 1 owner, 2 general). */
  embeddedLeadFormReturnTabIndex = 0;

  private destroy$ = new Subject<void>();
  private officesSubscription?: Subscription;
  private globalOfficeSubscription?: Subscription;

  //#region Leads-Shell
  ngOnInit(): void {
    this.applyQueryParamState(this.route.snapshot.queryParams);

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.applyQueryParamState(params);
    });

    this.loadOffices();
    this.globalOfficeSubscription = this.globalSelectionService
      .getSelectedOfficeId$()
      .pipe(skip(1), takeUntil(this.destroy$))
      .subscribe(officeId => {
        this.syncOfficeFromGlobal(officeId);
      });
  }

  get officeOptions(): { value: number; label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }
  //#endregion

  //#region Form Response Methods
  onOfficeDropdownChange(value: string | number | null): void {
    this.onOfficeIdChange(value == null || value === '' ? null : Number(value));
  }

  onOfficeIdChange(officeId: number | null): void {
    this.globalSelectionService.setSelectedOfficeId(officeId);
    this.resolveOfficeScope(officeId);
    this.updateUrlWithCurrentState();
  }

  onTabIndexChange(nextTabIndex: number): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.selectedTabIndex = nextTabIndex;
    this.updateUrlWithCurrentState();
  }

  onAddRentalLead(): void {
    this.officeTitleBarShowError = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 0;
    this.rentalShellLeadId = 'new';
    this.showRentalLeadForm = true;
    this.selectedTabIndex = 0;
    this.updateUrlWithCurrentState();
  }

  onEditRentalLead(rentalId: number): void {
    this.officeTitleBarShowError = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 0;
    this.rentalShellLeadId = String(rentalId);
    this.showRentalLeadForm = true;
    this.selectedTabIndex = 0;
    this.updateUrlWithCurrentState();
  }

  onRentalLeadFormClosed(): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.rentalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  onRentalOfficeSelectionRequired(): void {
    if (this.offices.length > 0) {
      this.officeTitleBarShowError = true;
    } else {
      this.toastr.warning('Please select a specific office in the title bar before saving.', 'Office required');
    }
    this.cdr.markForCheck();
  }

  onOwnerOfficeSelectionRequired(): void {
    this.onRentalOfficeSelectionRequired();
  }

  onGeneralOfficeSelectionRequired(): void {
    this.onRentalOfficeSelectionRequired();
  }

  onAddOwnerLead(): void {
    this.showRentalLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 1;
    this.ownerShellLeadId = 'new';
    this.showOwnerLeadForm = true;
    this.selectedTabIndex = 1;
    this.updateUrlWithCurrentState();
  }

  onEditOwnerLead(ownerId: number): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.generalShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 1;
    this.ownerShellLeadId = String(ownerId);
    this.showOwnerLeadForm = true;
    this.selectedTabIndex = 1;
    this.updateUrlWithCurrentState();
  }

  onOwnerLeadFormClosed(): void {
    this.showOwnerLeadForm = false;
    this.ownerShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  onAddGeneralLead(): void {
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 2;
    this.generalShellLeadId = 'new';
    this.showGeneralLeadForm = true;
    this.selectedTabIndex = 2;
    this.updateUrlWithCurrentState();
  }

  onEditGeneralLead(generalId: number): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.embeddedLeadFormReturnTabIndex = 2;
    this.generalShellLeadId = String(generalId);
    this.showGeneralLeadForm = true;
    this.selectedTabIndex = 2;
    this.updateUrlWithCurrentState();
  }

  onGeneralLeadFormClosed(): void {
    this.showGeneralLeadForm = false;
    this.generalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  onEmbeddedLeadFormBack(): void {
    this.officeTitleBarShowError = false;
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.showGeneralLeadForm = false;
    this.rentalShellLeadId = null;
    this.ownerShellLeadId = null;
    this.generalShellLeadId = null;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }
  //#endregion

  //#region Office Methods
  applyQueryParamState(params: Record<string, unknown>): void {
    const tab = String(params['tab'] || '').trim().toLowerCase();
    const nextIndex = tab === 'general' ? 2 : tab === 'owner' ? 1 : 0;
    if (this.selectedTabIndex !== nextIndex) {
      this.selectedTabIndex = nextIndex;
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null && this.offices.length > 0) {
      const matchedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.selectedOffice = matchedOffice;
      this.selectedOfficeId = matchedOffice?.officeId ?? null;
      this.clearOfficeTitleBarErrorIfValid();
      return;
    }

    if (getStringQueryParam(params, 'officeId') === null) {
      this.selectedOffice = null;
      this.selectedOfficeId = null;
    }
  }

  syncOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 0) {
      return;
    }
    this.resolveOfficeScope(officeId);
    this.cdr.markForCheck();
    this.updateUrlWithCurrentState();
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
    this.clearOfficeTitleBarErrorIfValid();
  }

  private clearOfficeTitleBarErrorIfValid(): void {
    if (this.selectedOfficeId != null && this.selectedOfficeId > 0) {
      this.officeTitleBarShowError = false;
    }
  }

  updateUrlWithCurrentState(): void {
    const tabParam =
      this.selectedTabIndex === 2 ? 'general' : this.selectedTabIndex === 1 ? 'owner' : null;
    const officeParam = this.selectedOfficeId != null ? String(this.selectedOfficeId) : null;

    const q = this.route.snapshot.queryParams;
    const curTabRaw = q['tab'];
    const curTab =
      curTabRaw === undefined || curTabRaw === null || String(curTabRaw).trim() === ''
        ? null
        : String(curTabRaw).trim().toLowerCase();
    const nextTab = tabParam === null || tabParam === undefined ? null : String(tabParam).toLowerCase();

    const curOfficeRaw = q['officeId'];
    const curOffice =
      curOfficeRaw === undefined || curOfficeRaw === null || String(curOfficeRaw).trim() === ''
        ? null
        : String(curOfficeRaw).trim();

    if (curTab === nextTab && curOffice === (officeParam ?? null)) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: tabParam,
        officeId: officeParam
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  loadOffices(): void {
    this.officesSubscription?.unsubscribe();
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      this.cdr.markForCheck();
      return;
    }

    this.officesSubscription = this.officeService
      .ensureOfficesLoaded(organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: allOffices => {
          this.offices = allOffices || [];
          this.applyQueryParamState(this.route.snapshot.queryParams);

          let didSetInitialOffice = false;
          if (!this.selectedOffice && this.offices.length === 1) {
            this.resolveOfficeScope(this.offices[0].officeId);
            didSetInitialOffice = true;
          } else if (!this.selectedOffice) {
            const globalOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();
            if (globalOfficeId !== null) {
              const globalOffice = this.offices.find(office => office.officeId === globalOfficeId) || null;
              if (globalOffice) {
                this.resolveOfficeScope(globalOffice.officeId);
                didSetInitialOffice = true;
              }
            }
          }
          this.cdr.markForCheck();
          if (didSetInitialOffice) {
            this.updateUrlWithCurrentState();
          }
        },
        error: () => {
          this.offices = [];
          this.cdr.markForCheck();
        }
      });
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
  //#endregion
}
