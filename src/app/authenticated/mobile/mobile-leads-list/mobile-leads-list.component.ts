import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { LeadGeneralResponse } from '../../leads/models/lead-general.model';
import { LeadOwnerResponse } from '../../leads/models/lead-owner.model';
import { LeadPartnerResponse } from '../../leads/models/lead-partner.model';
import { LeadRentalResponse } from '../../leads/models/lead-rental.model';
import { LeadStateType } from '../../leads/models/lead-enums';
import { LeadsService } from '../../leads/services/leads.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-leads-list',
  imports: [MaterialModule, MobileListTableComponent],
  templateUrl: './mobile-leads-list.component.html',
  styleUrl: './mobile-leads-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLeadsListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() tabPath = 'rentals';
  private router = inject(Router);
  private authService = inject(AuthService);
  private leadsService = inject(LeadsService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);

  rows: MobileListRow[] = [];
  isPageReady = false;
  showInactive = false;
  selectedOfficeId: number | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['leads']));
  destroy$ = new Subject<void>();

  readonly listColumns: ColumnSet = {
    name: { displayAs: 'Name', maxWidth: '16ch', wrap: false },
    status: { displayAs: 'Status', maxWidth: '12ch', wrap: false }
  };

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
      this.selectedOfficeId = officeId;
      this.markViewForCheck();
    });
    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(() => {
      if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn()) {
        return;
      }
      this.loadList();
    });
    this.loadList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tabPath'] && !changes['tabPath'].firstChange) {
      this.loadList();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyRows();
  }

  addLead(): void {
    void this.router.navigate(['/mobile', 'leads', this.tabPath, 'new']);
  }

  onRowClick(row: MobileListRow): void {
    if (!row.id) {
      return;
    }
    void this.router.navigate(['/mobile', 'leads', this.tabPath, row.id]);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  private loadList(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'leads');
    const onComplete = () => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'leads');
    const onSuccess = (rows: unknown[]) => {
      this.rawRows = rows || [];
      this.applyRows();
      this.leadsService.notifyLeadStateChanged();
    };
    const onError = () => {
      this.rawRows = [];
      this.rows = [];
      this.markViewForCheck();
    };

    if (this.tabPath === 'rentals') {
      this.leadsService.getRentalLeads().pipe(take(1), finalize(onComplete)).subscribe({ next: onSuccess, error: onError });
      return;
    }
    if (this.tabPath === 'owners') {
      this.leadsService.getOwnerLeads().pipe(take(1), finalize(onComplete)).subscribe({ next: onSuccess, error: onError });
      return;
    }
    if (this.tabPath === 'general') {
      this.leadsService.getGeneralLeads().pipe(take(1), finalize(onComplete)).subscribe({ next: onSuccess, error: onError });
      return;
    }
    if (this.tabPath === 'partners') {
      this.leadsService.getPartnerLeads().pipe(take(1), finalize(onComplete)).subscribe({ next: onSuccess, error: onError });
      return;
    }

    this.rows = [];
    onComplete();
    this.markViewForCheck();
  }

  private rawRows: unknown[] = [];

  private applyRows(): void {
    let mapped = this.mapRows(this.rawRows);
    mapped = mapped.filter(row => this.mappingService.matchesMobileOfficeScope(row.officeId, this.selectedOfficeId));
    mapped = this.showInactive
      ? mapped.filter(row => row.isActive === false)
      : mapped.filter(row => row.isActive !== false);
    this.rows = mapped.map(row => ({
      id: row.id,
      name: row.name,
      status: row.status,
      attentionDot: row.isNew ? '1' : ''
    }));
    this.markViewForCheck();
  }

  private mapRows(rows: unknown[]): { id: string; name: string; status: string; isNew: boolean; officeId: number; isActive: boolean }[] {
    if (this.tabPath === 'rentals') {
      return (rows as LeadRentalResponse[]).map(row => {
        const mapped = this.mappingService.mapLeadRentalListRow(row);
        return {
          id: String(mapped.rentalId),
          name: mapped.fullName,
          status: String(mapped.leadStateDropdown?.value ?? ''),
          isNew: mapped.leadStateId === LeadStateType.New,
          officeId: mapped.officeId,
          isActive: mapped.isActive !== false
        };
      });
    }
    if (this.tabPath === 'owners') {
      return (rows as LeadOwnerResponse[]).map(row => {
        const mapped = this.mappingService.mapLeadOwnerListRow(row);
        return {
          id: String(mapped.ownerId),
          name: mapped.fullName,
          status: String(mapped.leadStateDropdown?.value ?? ''),
          isNew: mapped.leadStateId === LeadStateType.New,
          officeId: mapped.officeId,
          isActive: mapped.isActive !== false
        };
      });
    }
    if (this.tabPath === 'general') {
      return (rows as LeadGeneralResponse[]).map(row => {
        const mapped = this.mappingService.mapLeadGeneralListRow(row);
        return {
          id: String(mapped.generalId),
          name: mapped.fullName,
          status: String(mapped.leadStateDropdown?.value ?? ''),
          isNew: mapped.leadStateId === LeadStateType.New,
          officeId: mapped.officeId,
          isActive: mapped.isActive !== false
        };
      });
    }
    if (this.tabPath === 'partners') {
      return (rows as LeadPartnerResponse[]).map(row => {
        const mapped = this.mappingService.mapLeadPartnerListRow(row);
        return {
          id: String(mapped.partnerId),
          name: mapped.name,
          status: String(mapped.leadStateDropdown?.value ?? ''),
          isNew: mapped.leadStateId === LeadStateType.New,
          officeId: mapped.officeId,
          isActive: mapped.isActive !== false
        };
      });
    }
    return [];
  }
}
