import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, map, of, skip, switchMap, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceResponse } from '../../accounting/models/invoice.model';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-invoice-list-page',
  imports: [MaterialModule, MobileListTableComponent],
  templateUrl: './mobile-invoice-list-page.component.html',
  styleUrl: './mobile-invoice-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileInvoiceListPageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() reservationId = '';
  private router = inject(Router);
  private authService = inject(AuthService);
  private invoiceService = inject(InvoiceService);
  private reservationService = inject(ReservationService);
  private officeService = inject(OfficeService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatter = inject(FormatterService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  rows: MobileListRow[] = [];
  columns: ColumnSet = {};
  private readonly reservationColumns: ColumnSet = {
    property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
    occupant: { displayAs: 'Occupant', maxWidth: '16ch', wrap: false },
    arrival: { displayAs: 'Arrival', maxWidth: '14ch', wrap: false }
  };
  private readonly invoiceColumns: ColumnSet = {
    invoiceCode: { displayAs: 'Invoice Code', maxWidth: '20ch', wrap: false },
    date: { displayAs: 'Date', maxWidth: '12ch', wrap: false },
    amount: { displayAs: 'Amount', maxWidth: '12ch', wrap: false }
  };
  isPageReady = false;
  selectedOfficeId: number | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['invoices']));
  destroy$ = new Subject<void>();

  //#region Mobile-Invoice-List-Page
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
      if (this.authService.isLoggingOut() || !this.authService.getIsLoggedIn() || this.reservationId.trim()) {
        return;
      }
      this.reload();
    });
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'invoices');
    if (this.reservationId.trim()) {
      this.columns = this.invoiceColumns;
      this.loadInvoices();
      return;
    }
    this.columns = this.reservationColumns;
    this.loadReservationList();
  }

  openReservation(row: MobileListRow): void {
    const reservationId = (row.id || '').trim();
    if (!reservationId) {
      return;
    }
    void this.router.navigate(['/mobile', 'reservations', 'invoices', reservationId]);
  }

  openInvoice(row: MobileListRow): void {
    const invoiceId = (row.id || '').trim();
    const reservationId = this.reservationId.trim();
    if (!invoiceId || !reservationId) {
      return;
    }
    void this.router.navigate(['/mobile', 'reservations', 'invoices', reservationId, invoiceId]);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadReservationList(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'))).subscribe({
      next: reservations => {
        this.rows = this.mappingService.mapReservationList(reservations || [])
          .filter(reservation => reservation.isActive !== false && this.mappingService.matchesMobileOfficeScope(reservation.officeId, this.selectedOfficeId))
          .map(reservation => this.mappingService.mapMobileReservationListDisplay(reservation));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  loadInvoices(): void {
    const reservationId = this.reservationId.trim();
    this.resolveOfficeIds().pipe(
      take(1),
      switchMap(officeIds => !reservationId || officeIds.length === 0
        ? of([] as InvoiceResponse[])
        : this.invoiceService.getInvoicesByReservationId(reservationId, officeIds).pipe(take(1))),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'invoices'))
    ).subscribe({
      next: invoices => {
        this.rows = (invoices || [])
          .filter(invoice => invoice.isActive !== false && this.matchesReservation(invoice, reservationId))
          .map(invoice => this.mapInvoiceRow(invoice))
          .sort((left, right) => right['dateSort'].localeCompare(left['dateSort']) || left['invoiceCode'].localeCompare(right['invoiceCode']));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  matchesReservation(invoice: InvoiceResponse, reservationId: string): boolean {
    return (invoice.reservationId || '').trim().toLowerCase() === reservationId.toLowerCase();
  }

  mapInvoiceRow(invoice: InvoiceResponse): MobileListRow {
    const dateSort = String(invoice.invoiceDate || '').slice(0, 10);
    return {
      id: invoice.invoiceId,
      invoiceCode: (invoice.invoiceCode || '').trim(),
      date: this.formatDate(invoice.invoiceDate),
      dateSort,
      amount: this.formatter.currencyUsd(Number(invoice.totalAmount) || 0)
    };
  }

  formatDate(value: string | null | undefined): string {
    const dateOnly = String(value || '').trim().slice(0, 10);
    const [year, month, day] = dateOnly.split('-');
    if (!year || !month || !day) {
      return dateOnly;
    }
    return `${month}/${day}/${year}`;
  }

  resolveOfficeIds() {
    if (this.selectedOfficeId && this.selectedOfficeId > 0) {
      return of([this.selectedOfficeId]);
    }
    const organizationId = this.authService.getUser()?.organizationId?.trim() ?? '';
    if (!organizationId) {
      return of<number[]>([]);
    }
    return this.officeService.getOffices(organizationId).pipe(
      map(offices => (offices || []).map(office => office.officeId).filter(id => id > 0))
    );
  }
  //#endregion
}
