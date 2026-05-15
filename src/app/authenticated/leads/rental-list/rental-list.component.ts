import { CommonModule } from '@angular/common';
import { Component, input, NgZone, OnChanges, OnDestroy, OnInit, output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Subject, Subscription, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DocumentService } from '../../documents/services/document.service';
import { PropertyService } from '../../properties/services/property.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { LeadRentalListDisplay } from '../models/lead-rental.model';
import { formatLeadStateLabel, LEAD_STATE_SELECT_OPTIONS, LeadStateDropdownCell, LeadStateType } from '../models/lead-enums';
import {
  RentalQuotePropertyOption,
  RentalQuotePropertySelectDialogComponent
} from './rental-quote-property-select-dialog.component';
import { LeadsService } from '../services/leads.service';

@Component({
  standalone: true,
  selector: 'app-rental-list',
  templateUrl: './rental-list.component.html',
  styleUrls: ['./rental-list.component.scss'],
  imports: [CommonModule, MaterialModule, DataTableComponent, DataTableFilterActionsDirective]
})
export class RentalListComponent implements OnInit, OnChanges, OnDestroy {
  embeddedInShell = input(false);
  officeId = input<number | null>(null);
  requestNewRental = output<void>();
  requestEditRental = output<number>();

  isServiceError = false;
  isPageReady = false;
  showInactive = false;
  allRentals: LeadRentalListDisplay[] = [];
  rentalsDisplay: LeadRentalListDisplay[] = [];

  offices: OfficeResponse[] = [];
  globalOfficeSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  rentalsDisplayedColumns: ColumnSet = {
    leadAttentionDot: { displayAs: ' ', maxWidth: '4ch', alignment: 'center', sort: false, wrap: false },
    fullName: { displayAs: 'Name', maxWidth: '25ch', wrap: false },
    email: { displayAs: 'Email', maxWidth: '30ch', wrap: false },
    phone: { displayAs: 'Phone', maxWidth: '20ch', wrap: false },
    quotePath: { displayAs: 'Quote', maxWidth: '12ch', alignment: 'center', sort: false, wrap: false },
    leadStateDropdown: { displayAs: 'Status', wrap: false, maxWidth: '20ch', sort: false, options: LEAD_STATE_SELECT_OPTIONS.map(o => o.label) },
    iNeedAsap: { displayAs: 'ASAP', isCheckbox: true, checkboxEditable: false, sort: false, wrap: false, alignment: 'center', maxWidth: '10ch' },
    isActive: { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '12ch' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['rental-leads']));
  destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private toastr: ToastrService,
    private dialog: MatDialog,
    private mappingService: MappingService,
    private leadsService: LeadsService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private authService: AuthService,
    private documentService: DocumentService,
    private propertyService: PropertyService
  ) { }

  //#region Rental-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
    });

    if (!this.embeddedInShell()) {
      this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(takeUntil(this.destroy$)).subscribe(officeId => {
        if (this.offices.length === 0) {
          return;
        }
        this.resolveOfficeScope(officeId);
      });
    }

    this.loadOffices();
    this.loadRentalLeads();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.embeddedInShell()) {
      return;
    }
    if (changes['officeId']) {
      this.resolveOfficeScope(this.officeId());
    }
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

  goToRentalLead(event: LeadRentalListDisplay): void {
    if (!event?.rentalId) {
      return;
    }
    if (this.embeddedInShell()) {
      this.requestEditRental.emit(event.rentalId);
      return;
    }
    this.ngZone.run(() => {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.LeadRental, [String(event.rentalId)]));
    });
  }

  deleteRental(event: LeadRentalListDisplay): void {
    if (!event?.rentalId) {
      return;
    }
    this.leadsService.deleteRentalLead(event.rentalId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Rental lead deleted.', CommonMessage.Success);
        this.loadRentalLeads();
      },
      error: () => {
        this.toastr.error('Unable to delete rental lead.', CommonMessage.Error);
      }
    });
  }

  generateQuote(event: LeadRentalListDisplay): void {
    const preparedForName = String(event.fullName || '').trim();
    const quoteEmail = String(event.email || '').trim();
    const preparedBy = this.getCurrentUserFullName();
    const quoteValidFor = this.getQuoteValidForDateOneWeekFromToday();
    const propertyCode = String(event.propertyRefId || '').trim().toLowerCase();
    const userId = String(this.authService.getUser()?.userId || '').trim();
    if (!userId) {
      this.toastr.warning('Unable to resolve user context for quote generation.', CommonMessage.Error);
      return;
    }

    this.propertyService.getActivePropertiesBySelectionCriteria(userId).pipe(take(1)).subscribe({
      next: properties => {
        const options: RentalQuotePropertyOption[] = (properties || [])
          .map(property => ({
            propertyId: String(property.propertyId || '').trim(),
            propertyCode: String(property.propertyCode || '').trim()
          }))
          .filter(property => property.propertyId !== '' && property.propertyCode !== '')
          .sort((a, b) => a.propertyCode.localeCompare(b.propertyCode, undefined, { sensitivity: 'base' }));
        if (options.length === 0) {
          this.toastr.warning('No active properties are available to generate a quote.', 'Warning');
          return;
        }

        const preselectedPropertyIds = propertyCode
          ? options
            .filter(property => property.propertyCode.toLowerCase() === propertyCode)
            .map(property => property.propertyId)
          : [];
        this.dialog.open(RentalQuotePropertySelectDialogComponent, {
          width: '28rem',
          data: {
            options,
            selectedPropertyIds: preselectedPropertyIds
          }
        }).afterClosed().pipe(take(1)).subscribe(selectedPropertyIds => {
          const selectedPropertyIdValues = Array.isArray(selectedPropertyIds) ? selectedPropertyIds : [];
          const normalizedPropertyIds: string[] = Array.from(
            new Set(
              selectedPropertyIdValues
                .map(propertyId => String(propertyId || '').trim())
                .filter(propertyId => propertyId !== '')
            )
          );
          if (normalizedPropertyIds.length === 0) {
            return;
          }
          const quotePath = this.buildQuoteCreatePath(
            normalizedPropertyIds,
            preparedForName,
            quoteEmail,
            preparedBy,
            quoteValidFor,
            event.rentalId
          );
          this.navigateToQuoteCreate(quotePath);
        });
      },
      error: () => {
        this.toastr.error('Unable to load properties for quote generation.', CommonMessage.Error);
      }
    });
  }

  buildQuoteCreatePath(
    propertyIds: string[],
    preparedForName: string,
    quoteEmail: string,
    preparedBy: string,
    quoteValidFor: string,
    rentalId?: number
  ): string {
    const queryParams: string[] = ['returnTo=property-list'];
    if (propertyIds.length > 0) {
      queryParams.push(`propertyIds=${propertyIds.join(',')}`);
    }
    if (preparedForName) {
      queryParams.push(`qpfn=${encodeURIComponent(preparedForName)}`);
    }
    if (quoteEmail) {
      queryParams.push(`qem=${encodeURIComponent(quoteEmail)}`);
    }
    if (preparedBy) {
      queryParams.push(`qag=${encodeURIComponent(preparedBy)}`);
    }
    if (quoteValidFor) {
      queryParams.push(`qvf=${encodeURIComponent(quoteValidFor)}`);
    }
    if (rentalId && rentalId > 0) {
      queryParams.push(`lrid=${rentalId}`);
    }
    return `${RouterUrl.QuoteCreate}?${queryParams.join('&')}`;
  }

  navigateToQuoteCreate(quotePath: string): void {
    this.ngZone.run(() => {
      this.router.navigateByUrl(quotePath);
    });
  }

  getCurrentUserFullName(): string {
    const currentUser = this.authService.getUser();
    return `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
  }

  getQuoteValidForDateOneWeekFromToday(): string {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date.toLocaleDateString('en-US');
  }
  //#endregion

  //#region Form Build methods
  buildLeadStateDropdownCell(leadStateId: number): LeadStateDropdownCell {
    const value = formatLeadStateLabel(leadStateId);
    return {
      value,
      isOverridable: true,
      toString: () => value
    };
  }
  //#endregion

  //#region Form Response Methods
  onRentalLeadStateDropdownChange(event: LeadRentalListDisplay & { __changedDropdownColumn?: string }): void {
    if ((event as { __changedDropdownColumn?: string }).__changedDropdownColumn !== 'leadStateDropdown') {
      return;
    }
    const selectedLabel = String(event.leadStateDropdown?.value ?? '').trim();
    const match = LEAD_STATE_SELECT_OPTIONS.find(o => o.label === selectedLabel);
    if (!match) {
      event.leadStateDropdown = this.buildLeadStateDropdownCell(event.leadStateId);
      return;
    }
    const nextLeadStateId = match.value;
    if (nextLeadStateId === event.leadStateId) {
      return;
    }
    const previousLeadStateId = event.leadStateId;
    this.applyRentalLeadStateId(event.rentalId, nextLeadStateId);
    const row = this.allRentals.find(r => r.rentalId === event.rentalId);
    if (!row) {
      return;
    }
    this.leadsService.updateRentalLead(this.mappingService.mapLeadRentalListRowToUpdateRequest(row, row.isActive)).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Rental lead updated.', CommonMessage.Success);
        this.leadsService.notifyLeadStateChanged();
      },
      error: () => {
        this.applyRentalLeadStateId(event.rentalId, previousLeadStateId);
        this.toastr.error('Unable to update rental lead.', CommonMessage.Error);
      }
    });
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

  applyRentalLeadStateId(rentalId: number, leadStateId: number): void {
    const patch = (rows: LeadRentalListDisplay[]) => {
      const r = rows.find(x => x.rentalId === rentalId);
      if (r) {
        r.leadStateId = leadStateId;
        r.leadStateDropdown = this.buildLeadStateDropdownCell(leadStateId);
      }
    };
    patch(this.allRentals);
    patch(this.rentalsDisplay);
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

  openGeneratedQuote(event: LeadRentalListDisplay): void {
    const quotePath = String(event?.quotePath || '').trim();
    if (!quotePath) {
      return;
    }
    this.documentService.getDocumentByGuid(quotePath).pipe(take(1)).subscribe({
      next: document => {
        this.navigateToQuoteDocument(document.documentId);
      },
      error: () => {
        this.documentService.getDocuments().pipe(take(1)).subscribe({
          next: documents => {
            const matchedDocument = (documents || []).find(document => String(document.documentPath || '').trim() === quotePath);
            if (!matchedDocument?.documentId) {
              this.toastr.warning('Quote document could not be found.', 'Warning');
              return;
            }
            this.navigateToQuoteDocument(matchedDocument.documentId);
          },
          error: () => {
            this.toastr.error('Unable to open quote document.', CommonMessage.Error);
          }
        });
      }
    });
  }

  navigateToQuoteDocument(documentId: string): void {
    const normalizedDocumentId = String(documentId || '').trim();
    if (!normalizedDocumentId) {
      this.toastr.warning('Quote document could not be found.', 'Warning');
      return;
    }
    this.ngZone.run(() => {
      this.router.navigate(
        [RouterUrl.replaceTokens(RouterUrl.DocumentView, [normalizedDocumentId])],
        {
          queryParams: {
            returnTo: 'leads'
          }
        }
      );
    });
  }

  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      this.offices = [];
      return;
    }
    this.officeService
      .ensureOfficesLoaded(organizationId)
      .pipe(take(1), takeUntil(this.destroy$))
      .subscribe({
        next: allOffices => {
          this.offices = allOffices || [];
          const initialOfficeId = this.embeddedInShell()
            ? this.officeId()
            : this.globalSelectionService.getSelectedOfficeIdValue();
          this.resolveOfficeScope(initialOfficeId ?? null);
        },
        error: () => {
          this.offices = [];
        }
      });
  }

  loadRentalLeads(): void {
    this.itemsToLoad$.next(new Set([...this.itemsToLoad$.value, 'rental-leads']));
    this.isServiceError = false;
    this.leadsService.getRentalLeads().pipe(take(1), takeUntil(this.destroy$), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'rental-leads'))).subscribe({
      next: rows => {
        this.allRentals = (rows || []).map(row => this.mappingService.mapLeadRentalListRow(row));
        this.applyRentalFilters();
        this.leadsService.notifyLeadStateChanged();
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
  scopeOfficeIdForListFilter(): number | null {
    if (this.embeddedInShell()) {
      const id = this.officeId();
      return id != null && id > 0 ? id : null;
    }
    const globalId = this.globalSelectionService.getSelectedOfficeIdValue();
    return globalId != null && globalId > 0 ? globalId : null;
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyRentalFilters();
  }

  applyRentalFilters(): void {
    let rows = [...this.allRentals];
    const scopeOfficeId = this.scopeOfficeIdForListFilter();
    if (scopeOfficeId != null) {
      rows = rows.filter(r => this.rentalPassesOfficeFilter(r, scopeOfficeId));
    }
    if (!this.showInactive) {
      rows = rows.filter(r => r.isActive !== false);
    }
    this.rentalsDisplay = rows.map(row => ({
      ...row,
      leadAttentionDot: this.getLeadAttentionDotValue(row.leadStateId)
    }));
  }

  rentalPassesOfficeFilter(row: LeadRentalListDisplay, scopeOfficeId: number): boolean {
    const rowOffice = Number(row.officeId);
    return !Number.isNaN(rowOffice) && rowOffice === Number(scopeOfficeId);
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyRentalFilters();
  }

  getLeadAttentionDotValue(leadStateId: number): string {
    return leadStateId === LeadStateType.New ? '●' : '';
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.globalOfficeSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
