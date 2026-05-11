import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, filter, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { getNumberQueryParam, getStringQueryParam } from '../../shared/query-param.utils';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
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
    OwnerComponent
  ]
})
export class LeadsShellComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private officeService = inject(OfficeService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);

  selectedTabIndex = 0;
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  offices: OfficeResponse[] = [];
  showOfficeDropdown = false;

  showRentalLeadForm = false;
  showOwnerLeadForm = false;
  /** Tab index (0 = rental list, 1 = owner list) to restore when leaving embedded add via title bar Back. */
  embeddedLeadFormReturnTabIndex = 0;

  private destroy$ = new Subject<void>();
  private officesSubscription?: Subscription;
  private globalOfficeSubscription?: Subscription;

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

  onOfficeDropdownChange(value: string | number | null): void {
    this.onOfficeIdChange(value == null || value === '' ? null : Number(value));
  }

  onOfficeIdChange(officeId: number | null): void {
    this.globalSelectionService.setSelectedOfficeId(officeId);
    this.resolveOfficeScope(officeId);
    this.updateUrlWithCurrentState();
  }

  onTabIndexChange(nextTabIndex: number): void {
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.selectedTabIndex = nextTabIndex;
    this.updateUrlWithCurrentState();
  }

  onAddRentalLead(): void {
    this.showOwnerLeadForm = false;
    this.embeddedLeadFormReturnTabIndex = 0;
    this.showRentalLeadForm = true;
    this.selectedTabIndex = 0;
    this.updateUrlWithCurrentState();
  }

  onRentalLeadFormClosed(): void {
    this.showRentalLeadForm = false;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  onAddOwnerLead(): void {
    this.showRentalLeadForm = false;
    this.embeddedLeadFormReturnTabIndex = 1;
    this.showOwnerLeadForm = true;
    this.selectedTabIndex = 1;
    this.updateUrlWithCurrentState();
  }

  onOwnerLeadFormClosed(): void {
    this.showOwnerLeadForm = false;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  onEmbeddedLeadFormBack(): void {
    this.showRentalLeadForm = false;
    this.showOwnerLeadForm = false;
    this.selectedTabIndex = this.embeddedLeadFormReturnTabIndex;
    this.updateUrlWithCurrentState();
  }

  private applyQueryParamState(params: Record<string, unknown>): void {
    const tab = String(params['tab'] || '').trim().toLowerCase();
    const nextIndex = tab === 'owner' ? 1 : 0;
    if (this.selectedTabIndex !== nextIndex) {
      this.selectedTabIndex = nextIndex;
    }

    const officeId = getNumberQueryParam(params, 'officeId');
    if (officeId !== null && this.offices.length > 0) {
      const matchedOffice = this.offices.find(o => o.officeId === officeId) || null;
      this.selectedOffice = matchedOffice;
      this.selectedOfficeId = matchedOffice?.officeId ?? null;
      return;
    }

    if (getStringQueryParam(params, 'officeId') === null) {
      this.selectedOffice = null;
      this.selectedOfficeId = null;
    }
  }

  private syncOfficeFromGlobal(officeId: number | null): void {
    if (this.offices.length === 0) {
      return;
    }
    this.resolveOfficeScope(officeId);
    this.cdr.markForCheck();
    this.updateUrlWithCurrentState();
  }

  private resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.offices.find(o => o.officeId === officeId) || null;
    this.selectedOfficeId = this.selectedOffice?.officeId ?? null;
  }

  private updateUrlWithCurrentState(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.selectedTabIndex === 1 ? 'owner' : null,
        officeId: this.selectedOfficeId != null ? String(this.selectedOfficeId) : null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private loadOffices(): void {
    this.officeService
      .areOfficesLoaded()
      .pipe(filter(loaded => loaded === true), take(1))
      .subscribe(() => {
        this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
          this.offices = allOffices || [];
          this.showOfficeDropdown = this.offices.length > 1;
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
        });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.globalOfficeSubscription?.unsubscribe();
    this.officesSubscription?.unsubscribe();
  }
}
