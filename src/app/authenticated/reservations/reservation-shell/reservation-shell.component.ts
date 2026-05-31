import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, finalize, map, skip, take, takeUntil } from 'rxjs';
import { CanComponentDeactivate } from '../../../guards/can-deactivate-guard';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceListComponent } from '../../accounting/invoice-list/invoice-list.component';
import { InvoiceComponent } from '../../accounting/invoice/invoice.component';
import { DocumentListComponent } from '../../documents/document-list/document-list.component';
import { DocumentType } from '../../documents/models/document.enum';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { SearchableSelectOption } from '../../shared/searchable-select/searchable-select.component';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { LeaseComponent } from '../lease/lease.component';
import { LeaseInformationComponent } from '../lease-information/lease-information.component';
import { ReservationListResponse, ReservationResponse } from '../models/reservation-model';
import { ReservationComponent } from '../reservation/reservation.component';
import { ReservationService } from '../services/reservation.service';

@Component({
  standalone: true,
  selector: 'app-reservation-shell',
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    ReservationComponent,
    TitleBarSelectComponent,
    LeaseComponent,
    LeaseInformationComponent,
    InvoiceComponent,
    InvoiceListComponent,
    DocumentListComponent
  ],
  templateUrl: './reservation-shell.component.html',
  styleUrl: './reservation-shell.component.scss'
})
export class ReservationShellComponent implements OnInit, AfterViewInit, OnDestroy, CanComponentDeactivate {
  @ViewChild('reservationSection') reservationSection?: ReservationComponent;
  @ViewChild('reservationDocumentList') reservationDocumentList?: DocumentListComponent;

  selectedTabIndex: number = 0;
  selectedOfficeId: number | null = null;
  selectedOffice: OfficeResponse | null = null;
  selectedPropertyIdSeed: string | null = null;
  showOfficeDropdown: boolean = false;
  selectedHeaderReservationId: string | null = null;
  routeReservationId: string | null = null;
  selectedReservationSummary: ReservationListResponse | null = null;
  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  availableHeaderReservations: SearchableSelectOption[] = [];
  reservationList: ReservationListResponse[] = [];
  organizationId: string = '';
  isAddMode: boolean = false;
  isAdmin: boolean = false;
  isHandlingTabGuard: boolean = false;
  activeInvoiceId: string | null = null;
  activeOfficeId: number | null = null;
  activePropertyId: string | null = null;

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));
  destroy$ = new Subject<void>();

  readonly DocumentType = DocumentType;
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private reservationService: ReservationService,
    private utilityService: UtilityService,
    private mappingService: MappingService
  ) {}

  //#region Reservation-Shell
  ngOnInit(): void {
    this.organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    this.isAdmin = this.authService.isAdmin();
    this.selectedOfficeId = this.globalSelectionService.getSelectedOfficeIdValue();

    this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1), takeUntil(this.destroy$)).subscribe(officeId => {
      this.applyOfficeFromGlobal(officeId);
    });

    this.route.queryParams.pipe(take(1)).subscribe(queryParams => {
      this.selectedTabIndex = this.getTabIndexFromQueryParam(queryParams['tab']);
      this.activeInvoiceId = queryParams['invoiceId'] ? String(queryParams['invoiceId']) : null;
      if (this.activeInvoiceId) {
        this.selectedTabIndex = this.getInvoicesTabIndex();
      }
    });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
      this.activeInvoiceId = queryParams['invoiceId'] ? String(queryParams['invoiceId']) : null;
      if (this.activeInvoiceId && this.selectedTabIndex !== this.getInvoicesTabIndex()) {
        this.selectedTabIndex = this.getInvoicesTabIndex();
      }
    });

    this.route.paramMap.pipe(take(1)).subscribe(paramMap => {
      const id = paramMap.get('id');
      this.isAddMode = !id || id === 'new';
      this.routeReservationId = this.isAddMode ? null : id;
      this.selectedHeaderReservationId = this.routeReservationId;
      this.loadOffices();
      this.loadSelectedReservationContext();
    });

  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.onReservationLoaded());
  }
  //#endregion

  //#region Tab Interaction Methods
  async onTabIndexChange(requestedTabIndex: number): Promise<void> {
    if (this.isHandlingTabGuard) {
      return;
    }

    const previousTabIndex = this.selectedTabIndex;
    if (previousTabIndex === requestedTabIndex) {
      return;
    }

    this.isHandlingTabGuard = true;
    try {
      // Accept the emitted index first so we can deterministically revert on "Stay".
      this.selectedTabIndex = requestedTabIndex;

      if (this.reservationSection) {
        const canLeave = await this.reservationSection.confirmNavigationWithUnsavedChanges();
        if (!canLeave) {
          this.selectedTabIndex = previousTabIndex;
          return;
        }
      }

      this.refreshHeaderReservationOptions();
      this.onHeaderReservationChange();

      const tabParam = this.getTabParamFromIndex(requestedTabIndex);
      const queryParams: Record<string, string | null> = { tab: tabParam };
      if (requestedTabIndex !== this.getInvoicesTabIndex()) {
        queryParams['invoiceId'] = null;
      }

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge'
      });

      if (requestedTabIndex === this.getDocumentsTabIndex() && this.reservationDocumentList) {
        this.reservationDocumentList.reload();
      }
    } finally {
      this.isHandlingTabGuard = false;
    }
  }
  
  getTabIndexFromQueryParam(tabParam: string | undefined): number {
    if (!tabParam) {
      return 0;
    }
    switch (tabParam) {
      case 'information':
        return this.isAdmin ? 1 : this.getLeaseTabIndex();
      case 'lease':
        return this.getLeaseTabIndex();
      case 'invoices':
        return this.getInvoicesTabIndex();
      case 'documents':
        return this.getDocumentsTabIndex();
      default:
        return 0;
    }
  }

  getTabParamFromIndex(tabIndex: number): string | null {
    if (tabIndex === (this.isAdmin ? 1 : -1)) {
      return 'information';
    }
    if (tabIndex === this.getLeaseTabIndex()) {
      return 'lease';
    }
    if (tabIndex === this.getInvoicesTabIndex()) {
      return 'invoices';
    }
    if (tabIndex === this.getDocumentsTabIndex()) {
      return 'documents';
    }
    return null;
  }
 
  getReservationDropdownLabel(reservation: ReservationListResponse): string {
    const contacts = this.reservationSection?.contacts || [];
    const contact = contacts.find(c => c.contactId === reservation.contactId) || null;
    return this.utilityService.getReservationDropdownLabel(reservation, contact);
  }

  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
  }

  applyOfficeFromGlobal(officeId: number | null): void {
    if (!this.isAddMode && this.routeReservationId) {
      return;
    }
    if (this.isAddMode && !this.routeReservationId) {
      return;
    }
    if (this.offices.length === 0) {
      this.selectedOfficeId = officeId;
      return;
    }
    if (this.offices.length === 1) {
      this.selectedOfficeId = this.offices[0].officeId;
    } else {
      const resolved = officeId != null && this.offices.some(o => o.officeId === officeId) ? officeId : null;
      this.selectedOfficeId = resolved;
    }
    this.resolveOfficeScope(this.selectedOfficeId);
    this.refreshHeaderReservationOptions();
  }
  // #endregion

  //#region Header Dropdown Mehtods
  async onHeaderReservationDropdownChange(reservationId: string | number | null): Promise<void> {
    const nextReservationId = reservationId == null ? null : String(reservationId);
    const previousReservationId = this.selectedHeaderReservationId;
    this.selectedHeaderReservationId = nextReservationId;
    if (nextReservationId) {
      this.routeReservationId = nextReservationId;
    }
    this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === nextReservationId) || null;
    if (this.selectedReservationSummary) {
      this.applyReservationScope(
        this.selectedReservationSummary.officeId,
        this.selectedReservationSummary.propertyId,
        this.selectedReservationSummary.reservationId
      );
    } else {
      this.clearReservationScope();
    }

    if (this.selectedTabIndex === 0 && this.reservationSection && nextReservationId) {
      const canLeave = await this.reservationSection.confirmNavigationWithUnsavedChanges();
      if (!canLeave) {
        this.selectedHeaderReservationId = previousReservationId;
        this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === previousReservationId) || null;
        return;
      }
      this.reservationSection.loadReservation(nextReservationId);
    }

    this.onHeaderReservationChange();
  }

  onHeaderReservationChange(): void {
    const reservation = this.reservationSection;
    if (!reservation) {
      return;
    }

    if (this.selectedTabIndex === 0) {
      if (!this.selectedHeaderReservationId) {
        return;
      }
      if (reservation.reservation?.reservationId !== this.selectedHeaderReservationId) {
        reservation.loadReservation(this.selectedHeaderReservationId);
      }
      return;
    }
    if (this.selectedTabIndex === this.getDocumentsTabIndex() && this.reservationDocumentList) {
      this.reservationDocumentList.reload();
    }
  }

  onReservationLoaded(): void {
    const reservation = this.reservationSection;
    if (!reservation) {
      return;
    }

    if (!this.routeReservationId) {
      this.routeReservationId = reservation.sharedReservationId ?? reservation.reservation?.reservationId ?? null;
    }
    this.selectedHeaderReservationId = this.routeReservationId ?? reservation.sharedReservationId ?? reservation.reservation?.reservationId ?? null;

    if (this.isAddMode && !this.routeReservationId) {
      if (this.offices.length > 0) {
        this.initializeAddModeOfficeFromShell();
      }
      this.loadReservations();
      this.refreshHeaderReservationOptions();
      return;
    }

    const officeId = reservation.sharedOfficeId;
    const propertyId = reservation.sharedPropertyId;
    if (officeId != null && propertyId) {
      this.applyReservationScope(officeId, propertyId, reservation.sharedReservationId);
    }
    this.loadReservations();
    this.refreshHeaderReservationOptions();
  }

  refreshHeaderReservationOptions(): void {
    const selectedOfficeId = this.selectedOffice?.officeId ?? this.selectedOfficeId;
    const officeFiltered = selectedOfficeId == null
      ? this.reservationList
      : this.reservationList.filter(r => r.officeId === selectedOfficeId);
    this.availableHeaderReservations = officeFiltered.map(r => ({
      value: r.reservationId,
      label: this.getReservationDropdownLabel(r)
    }));

    if (this.selectedHeaderReservationId && !officeFiltered.some(r => r.reservationId === this.selectedHeaderReservationId)) {
      this.selectedHeaderReservationId = null;
    }
    this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === this.selectedHeaderReservationId) || null;
  }
  
  get officeOptions(): SearchableSelectOption[] {
    return this.availableOffices.map(o => ({ value: o.value, label: o.name }));
  }

  /** Add-mode shell office scope; null means All Offices until the user picks one. */
  get addModeOfficeId(): number | null {
    return this.selectedOfficeId;
  }

  initializeAddModeOfficeFromShell(): void {
    if (!this.isAddMode || this.routeReservationId || this.offices.length === 0) {
      return;
    }

    let initialOfficeId: number | null = null;
    const queryOfficeId = this.route.snapshot.queryParamMap.get('officeId');
    if (queryOfficeId) {
      const parsed = Number(queryOfficeId);
      if (!isNaN(parsed) && this.offices.some(office => office.officeId === parsed)) {
        initialOfficeId = parsed;
      }
    }

    this.selectedOfficeId = initialOfficeId;
    this.selectedOffice = initialOfficeId != null
      ? this.offices.find(office => office.officeId === initialOfficeId) ?? null
      : null;
    this.activeOfficeId = initialOfficeId;
    this.reservationSection?.initializeOfficeFromShell(initialOfficeId);
    this.refreshHeaderReservationOptions();
  }

  onShellOfficeDropdownChange(officeId: string | number | null): void {
    if (!this.reservationSection?.isAddMode) {
      return;
    }
    const resolvedOfficeId = officeId == null || officeId === '' ? null : Number(officeId);
    const normalizedOfficeId = resolvedOfficeId != null && !isNaN(resolvedOfficeId) ? resolvedOfficeId : null;
    this.reservationSection.onTitleBarOfficeChange(normalizedOfficeId);
    this.applyReservationScope(normalizedOfficeId, this.reservationSection.sharedPropertyId);
  }

  onShellPropertyCodeDropdownChange(propertyId: string | number | null): void {
    if (!this.reservationSection?.isAddMode) {
      return;
    }
    this.reservationSection.onPropertyDropdownChange(propertyId);
    const officeId = this.reservationSection.sharedOfficeId ?? this.addModeOfficeId;
    const resolvedPropertyId = this.reservationSection.sharedPropertyId;
    this.applyReservationScope(officeId, resolvedPropertyId);
  }

  get selectedPropertyId(): string | null {
    return this.activePropertyId
      ?? this.selectedReservationSummary?.propertyId
      ?? this.reservationSection?.sharedPropertyId
      ?? this.reservationSection?.selectedProperty?.propertyId
      ?? this.reservationSection?.reservation?.propertyId
      ?? this.selectedPropertyIdSeed
      ?? null;
  }
  //#endregion

  //#region Reservation Context Getters
  get activeReservationId(): string | null {
    return this.selectedHeaderReservationId;
  }

  get selectedPropertyCode(): string {
    return this.selectedReservationSummary?.propertyCode ?? this.reservationSection?.sharedPropertyCode ?? 'Code';
  }

  get selectedOfficeName(): string {
    const officeId = this.displayOfficeId;
    return this.selectedOffice?.name ?? this.offices.find(office => office.officeId === officeId)?.name ?? '';
  }

  get displayOfficeId(): number | null {
    return this.activeOfficeId
      ?? this.selectedReservationSummary?.officeId
      ?? this.selectedOfficeId
      ?? this.reservationSection?.sharedOfficeId
      ?? null;
  }

  /** Office and property for the active reservation; set in one call when the reservation is selected. */
  applyReservationScope(officeId: number | null, propertyId: string | null, reservationId?: string | null): void {
    this.activeOfficeId = officeId;
    this.activePropertyId = propertyId?.trim() ? propertyId.trim() : null;
    this.selectedOfficeId = officeId;

    if (officeId != null) {
      this.resolveOfficeScope(officeId);
    } else {
      this.selectedOffice = null;
    }

    if (this.activePropertyId) {
      this.selectedPropertyIdSeed = this.activePropertyId;
    }

    if (reservationId) {
      this.selectedHeaderReservationId = reservationId;
      this.routeReservationId = reservationId;
      this.selectedReservationSummary =
        this.reservationList.find(r => r.reservationId === reservationId) ?? this.selectedReservationSummary;
    }

    this.refreshHeaderReservationOptions();
  }

  clearReservationScope(): void {
    this.activeOfficeId = null;
    this.activePropertyId = null;
  }

  getLeaseTabIndex(): number {
    return this.isAdmin ? 2 : 1;
  }

  getInvoicesTabIndex(): number {
    return this.isAdmin ? 3 : 2;
  }

  getDocumentsTabIndex(): number {
    return this.isAdmin ? 4 : 3;
  }
  //#endregion

  //#region Data Loading Methods
  loadOffices(): void {
    this.officeService.ensureOfficesLoaded(this.organizationId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
    })).subscribe({
      next: () => {
        this.officeService.getAllOffices().pipe(takeUntil(this.destroy$)).subscribe(offices => {
          this.offices = offices || [];
          this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
          this.showOfficeDropdown = this.offices.length > 1;
          if (this.isAddMode && !this.routeReservationId) {
            this.initializeAddModeOfficeFromShell();
          } else if (this.selectedOfficeId != null) {
            this.resolveOfficeScope(this.selectedOfficeId);
            this.refreshHeaderReservationOptions();
          }
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.selectedOfficeId = null;
        this.selectedOffice = null;
      }
    });
  }

  loadSelectedReservationContext(): void {
    if (!this.routeReservationId || this.isAddMode) {
      return;
    }

    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservationContext');
    this.reservationService.getReservationByGuid(this.routeReservationId).pipe(take(1), finalize(() => {
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservationContext');
    })).subscribe({
      next: (reservation: ReservationResponse) => {
        if (reservation?.officeId != null) {
          this.applyReservationScope(
            reservation.officeId,
            reservation.propertyId ?? null,
            reservation.reservationId
          );
        } else if (reservation?.propertyId) {
          this.selectedPropertyIdSeed = reservation.propertyId;
          this.activePropertyId = reservation.propertyId;
        }

        if (reservation?.propertyId) {
          this.loadReservationsByPropertyId(reservation.propertyId);
        } else {
          this.loadReservations();
        }
      },
      error: () => {
        this.loadReservations();
      }
    });
  }

  loadReservations(): void {
    const propertyId = this.selectedPropertyId;
    if (propertyId) {
      this.loadReservationsByPropertyId(propertyId);
      return;
    }

    const reservationIdForPropertyLookup = this.selectedHeaderReservationId ?? this.routeReservationId ?? this.reservationSection?.sharedReservationId ?? null;
    if (reservationIdForPropertyLookup) {
      this.reservationService.getReservationByGuid(reservationIdForPropertyLookup).pipe(take(1)).subscribe({
        next: reservation => {
          if (reservation?.propertyId) {
            this.loadReservationsByPropertyId(reservation.propertyId);
            return;
          }
          this.reservationList = [];
          this.availableHeaderReservations = [];
          this.selectedReservationSummary = null;
        },
        error: () => {
          this.reservationList = [];
          this.availableHeaderReservations = [];
          this.selectedReservationSummary = null;
        }
      });
      return;
    }

    this.reservationList = [];
    this.availableHeaderReservations = [];
    this.selectedReservationSummary = null;
  }

  loadReservationsByPropertyId(propertyId: string): void {
    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1)).subscribe({
      next: reservations => {
        this.reservationList = reservations || [];
        if (!this.selectedHeaderReservationId) {
          const currentReservationId = this.routeReservationId ?? this.reservationSection?.sharedReservationId ?? this.reservationSection?.reservation?.reservationId ?? null;
          if (currentReservationId && this.reservationList.some(r => r.reservationId === currentReservationId)) {
            this.selectedHeaderReservationId = currentReservationId;
          }
        }
        this.selectedReservationSummary = this.reservationList.find(r => r.reservationId === this.selectedHeaderReservationId) || null;
        if (this.selectedReservationSummary) {
          this.applyReservationScope(
            this.selectedReservationSummary.officeId,
            this.selectedReservationSummary.propertyId,
            this.selectedReservationSummary.reservationId
          );
        }
      },
      error: () => {
        this.reservationList = [];
        this.availableHeaderReservations = [];
      }
    });
  }
  //#endregion

  //#region Utility Methods

  canDeactivate(): Promise<boolean> | boolean {
    return this.reservationSection?.canDeactivate() ?? true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  closeEmbeddedInvoiceEditor(): void {
    this.activeInvoiceId = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { invoiceId: null, tab: 'invoices' },
      queryParamsHandling: 'merge'
    });
  }

  onShellBack(): void {
    if (this.activeInvoiceId) {
      this.closeEmbeddedInvoiceEditor();
      return;
    }

    this.reservationSection?.back();
  }
  //#endregion
}
