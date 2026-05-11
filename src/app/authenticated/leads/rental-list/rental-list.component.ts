import { CommonModule } from '@angular/common';
import { Component, effect, input, NgZone, OnDestroy, OnInit, output } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AgentService } from '../../organizations/services/agent.service';
import { LeadRentalListDisplay } from '../models/lead-rental.model';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-rental-list',
  templateUrl: './rental-list.component.html',
  styleUrls: ['./rental-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class RentalListComponent implements OnInit, OnDestroy {
  embeddedInShell = input(false);
  officeId = input<number | null>(null);
  requestNewRental = output<void>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allRentals: LeadRentalListDisplay[] = [];
  rentalsDisplay: LeadRentalListDisplay[] = [];

  rentalsDisplayedColumns: ColumnSet = {
    rentalId: { displayAs: 'Id', maxWidth: '8ch', alignment: 'center', wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '22ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '24ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '16ch', wrap: false },
    desiredLocation: { displayAs: 'Location', maxWidth: '20ch', wrap: false },
    leadStateLabel: { displayAs: 'Status', maxWidth: '14ch', wrap: false },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rentals']));

  destroy$ = new Subject<void>();

  private readonly agentIdToOfficeId = new Map<string, number>();

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private toastr: ToastrService,
    private mappingService: MappingService,
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private agentService: AgentService
  ) {
    effect(() => {
      this.officeId();
      this.applyRentalFilters();
    });
  }

  //#region Rental-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    this.loadAgents();
    this.loadRentals();
  }

  goToRental(event: LeadRentalListDisplay): void {
    if (!event?.rentalId) {
      return;
    }
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadRental, [String(event.rentalId)]));
    });
  }

  addRentalLead(): void {
    if (this.embeddedInShell()) {
      this.requestNewRental.emit();
      return;
    }
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadRental, ['new']));
    });
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyRentalFilters();
  }

  onRentalCheckboxChange(event: LeadRentalListDisplay & { __changedCheckboxColumn?: string; __previousCheckboxValue?: boolean; __checkboxValue?: boolean }): void {
    if ((event as { __changedCheckboxColumn?: string }).__changedCheckboxColumn !== 'isActive') {
      return;
    }
    const previousValue = (event as { __previousCheckboxValue?: boolean }).__previousCheckboxValue === true;
    const nextValue = (event as { __checkboxValue?: boolean }).__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }
    this.applyRentalIsActiveValue(event.rentalId, nextValue);
    const body = this.mappingService.mapLeadRentalListRowToUpdateRequest(event, nextValue);
    this.leadsService.updateRentalLead(body).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Rental lead updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyRentalIsActiveValue(event.rentalId, previousValue);
        this.toastr.error('Unable to update rental lead.', CommonMessage.Error);
      }
    });
  }

  applyRentalIsActiveValue(rentalId: number, isActive: boolean): void {
    const patch = (rows: LeadRentalListDisplay[]) => {
      const row = rows.find(r => r.rentalId === rentalId);
      if (row) {
        row.isActive = isActive;
      }
    };
    patch(this.allRentals);
    patch(this.rentalsDisplay);
  }

  deleteRental(event: LeadRentalListDisplay): void {
    if (!event?.rentalId) {
      return;
    }
    this.leadsService.deleteRentalLead(event.rentalId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Rental lead deleted.', CommonMessage.Success);
        this.loadRentals();
      },
      error: () => {
        this.toastr.error('Unable to delete rental lead.', CommonMessage.Error);
      }
    });
  }
  //#endregion

  //#region Data Loading Methods
  loadAgents(): void {
    this.agentService
      .getAgents()
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe(agents => {
        this.agentIdToOfficeId.clear();
        for (const a of agents || []) {
          if (a.agentId) {
            this.agentIdToOfficeId.set(String(a.agentId).trim().toLowerCase(), a.officeId);
          }
        }
        this.applyRentalFilters();
      });
  }

  loadRentals(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'rentals');
    this.isServiceError = false;
    this.leadsService.getRentalLeads().pipe(
      take(1),
      takeUntil(this.destroy$),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rentals'))
    ).subscribe({
      next: rows => {
        this.allRentals = (rows || []).map(row => this.mappingService.mapLeadRentalListRow(row));
        this.applyRentalFilters();
      },
      error: () => {
        this.isServiceError = true;
        this.allRentals = [];
        this.rentalsDisplay = [];
      }
    });
  }
  //#endregion

  //#region Filter Methods
  applyRentalFilters(): void {
    let rows = [...this.allRentals];
    const scopeOfficeId = this.officeId();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.rentalPassesOfficeFilter(r, scopeOfficeId));
    }
    if (!this.showInactive) {
      rows = rows.filter(r => r.isActive !== false);
    }
    this.rentalsDisplay = rows;
  }

  private rentalPassesOfficeFilter(row: LeadRentalListDisplay, scopeOfficeId: number): boolean {
    if (!row.agentId) {
      return false;
    }
    const key = String(row.agentId).trim().toLowerCase();
    return (this.agentIdToOfficeId.get(key) ?? -1) === scopeOfficeId;
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
