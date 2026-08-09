import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { InvoiceResponse } from '../../accounting/models/invoice.model';
import { InvoiceService } from '../../accounting/services/invoice.service';
import { ReservationListDisplay, ReservationListResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { InvoiceHistoryDisplayRow, ReservationHistoryDisplayRow } from '../models/property-reservation-history.model';

@Component({
  standalone: true,
  selector: 'app-property-reservation-history',
  imports: [MaterialModule, DataTableComponent],
  templateUrl: './property-reservation-history.component.html',
  styleUrl: './property-reservation-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyReservationHistoryComponent implements OnInit, OnChanges, OnDestroy {
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private formatterService = inject(FormatterService);
  private invoiceService = inject(InvoiceService);
  private reservationService = inject(ReservationService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  @Input() propertyId: string | null = null;

  reservations: ReservationListResponse[] = [];
  tableData: ReservationHistoryDisplayRow[] = [];
  expandedReservations = new Set<string>();
  isAllExpanded = false;
  invoicesByReservationId = new Map<string, InvoiceHistoryDisplayRow[]>();
  loadingInvoiceReservationIds = new Set<string>();

  isPageReady = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['reservations']));
  destroy$ = new Subject<void>();

  displayedColumns: ColumnSet = {
    expand: { displayAs: ' ', maxWidth: '5ch', sort: false },
    reservationCode: { displayAs: 'Reservation', maxWidth: '15ch', sortType: 'natural' },
    agentCode: { displayAs: 'Agent', maxWidth: '15ch' },
    tenantName: { displayAs: 'Occupant', maxWidth: '28ch' },
    contactName: { displayAs: 'Contact', maxWidth: '28ch' },
    companyName: { displayAs: 'Company', maxWidth: '24ch' },
    arrivalDate: { displayAs: 'Arrival', maxWidth: '20ch', alignment: 'center' },
    departureDate: { displayAs: 'Departure', maxWidth: '20ch', alignment: 'center' }
  };

  invoiceColumns: ColumnSet = {
    invoiceNumber: { displayAs: 'Invoice', maxWidth: '15ch' },
    period: { displayAs: 'Period', maxWidth: '12ch', alignment: 'center' },
    invoiceDate: { displayAs: 'Invoice Date', maxWidth: '15ch', alignment: 'center' },
    dueDate: { displayAs: 'Due Date', maxWidth: '15ch', alignment: 'center' },
    totalAmount: { displayAs: 'Total', maxWidth: '12ch', alignment: 'right' },
    paidAmount: { displayAs: 'Paid', maxWidth: '12ch', alignment: 'right' },
    dueAmount: { displayAs: 'Due', maxWidth: '12ch', alignment: 'right' }
  };

  //#region Property Reservation History
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.loadReservations();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['propertyId'] && !changes['propertyId'].firstChange) {
      this.loadReservations();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion

  //#region Data Loading Methods
  loadReservations(): void {
    const propertyId = String(this.propertyId || '').trim();
    this.utilityService.addLoadItem(this.itemsToLoad$, 'reservations');
    this.expandedReservations.clear();
    this.invoicesByReservationId.clear();
    this.loadingInvoiceReservationIds.clear();
    this.isAllExpanded = false;

    if (!propertyId) {
      this.reservations = [];
      this.refreshTable();
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations');
      return;
    }

    this.reservationService.getReservationsByPropertyId(propertyId).pipe(take(1),
      finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'reservations'))
    ).subscribe({
      next: reservations => {
        this.reservations = reservations || [];
        this.refreshTable();
      },
      error: () => {
        this.reservations = [];
        this.refreshTable();
      }
    });
  }
  //#endregion

  //#region Table Methods
  refreshTable(): void {
    const mapped = this.mappingService.mapReservationList(this.reservations || []);
    this.tableData = mapped
      .filter(reservation => this.isHistoricalReservation(reservation.departureDate))
      .sort((a, b) => this.compareDepartureDateDesc(a.departureDate, b.departureDate))
      .map(reservation => this.toDisplayRow(reservation));
    this.updateIsAllExpanded();
    this.markViewForCheck();
  }

  toDisplayRow(reservation: ReservationListDisplay): ReservationHistoryDisplayRow {
    const reservationId = String(reservation.reservationId || '').trim();
    return {
      ...reservation,
      expand: reservationId,
      expanded: this.expandedReservations.has(reservationId),
      invoices: this.invoicesByReservationId.get(reservationId) ?? [],
      invoicesLoading: this.loadingInvoiceReservationIds.has(reservationId),
      expandClick: (event, item) => this.toggleExpand(event, item)
    };
  }
  //#endregion

  //#region Expand Methods
  toggleExpand(event: Event, row: ReservationHistoryDisplayRow): void {
    event.stopPropagation();
    const reservationId = String(row.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    if (this.expandedReservations.has(reservationId)) {
      this.expandedReservations.delete(reservationId);
      this.refreshTable();
      return;
    }

    this.expandedReservations.add(reservationId);
    this.refreshTable();
    this.ensureInvoicesLoaded(row);
  }

  toggleExpandAll(expanded: boolean): void {
    this.isAllExpanded = expanded;
    if (!expanded) {
      this.expandedReservations.clear();
      this.refreshTable();
      return;
    }

    this.tableData.forEach(row => {
      const reservationId = String(row.reservationId || '').trim();
      if (!reservationId) {
        return;
      }
      this.expandedReservations.add(reservationId);
      this.ensureInvoicesLoaded(row);
    });
    this.refreshTable();
  }

  updateIsAllExpanded(): void {
    const ids = this.tableData
      .map(row => String(row.reservationId || '').trim())
      .filter(id => !!id);
    this.isAllExpanded = ids.length > 0 && ids.every(id => this.expandedReservations.has(id));
  }
  //#endregion

  //#region Invoice Methods
  ensureInvoicesLoaded(row: ReservationHistoryDisplayRow): void {
    const reservationId = String(row.reservationId || '').trim();
    if (!reservationId || this.invoicesByReservationId.has(reservationId) || this.loadingInvoiceReservationIds.has(reservationId)) {
      return;
    }

    const officeId = Number(row.officeId);
    const officeIds = Number.isFinite(officeId) && officeId > 0 ? [officeId] : [];
    this.loadingInvoiceReservationIds.add(reservationId);
    this.refreshTable();

    this.invoiceService.getInvoicesByReservationId(reservationId, officeIds).pipe(take(1)).subscribe({
      next: invoices => {
        this.invoicesByReservationId.set(reservationId, (invoices || []).map(invoice => this.toInvoiceDisplayRow(invoice)));
        this.loadingInvoiceReservationIds.delete(reservationId);
        this.refreshTable();
      },
      error: () => {
        this.invoicesByReservationId.set(reservationId, []);
        this.loadingInvoiceReservationIds.delete(reservationId);
        this.refreshTable();
      }
    });
  }

  toInvoiceDisplayRow(invoice: InvoiceResponse): InvoiceHistoryDisplayRow {
    const totalAmount = Number(invoice.totalAmount || 0);
    const paidAmount = Number(invoice.paidAmount || 0);
    const dueAmount = totalAmount - paidAmount;
    return {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceCode || '',
      period: this.formatterService.formatInvoiceListAccountingPeriod(invoice.accountingPeriod),
      invoiceDate: this.formatterService.formatDateString(invoice.invoiceDate),
      dueDate: this.formatterService.formatDateString(invoice.dueDate),
      totalAmount: '$' + this.formatterService.currency(totalAmount),
      paidAmount: '$' + this.formatterService.currency(paidAmount),
      dueAmount: '$' + this.formatterService.currency(dueAmount),
      source: invoice
    };
  }

  getInvoiceColumnNames(): string[] {
    return Object.keys(this.invoiceColumns);
  }
  //#endregion

  //#region Navigation Methods
  goToReservation(row: ReservationListDisplay): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    const queryParams: Record<string, string> = {
      returnTo: 'property-reservation-history'
    };
    const propertyId = String(row.propertyId || this.propertyId || '').trim();
    if (propertyId) {
      queryParams['propertyId'] = propertyId;
    }

    this.router.navigate(['/' + RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])], {
      queryParams
    });
  }

  goToInvoice(event: Event, invoice: InvoiceHistoryDisplayRow, reservation: ReservationHistoryDisplayRow): void {
    event.stopPropagation();
    const reservationId = String(reservation.reservationId || '').trim();
    const invoiceId = String(invoice.invoiceId || '').trim();
    if (!reservationId || !invoiceId) {
      return;
    }

    const params = [
      'tab=invoices',
      `invoiceId=${encodeURIComponent(invoiceId)}`,
      `reservationId=${encodeURIComponent(reservationId)}`,
      'returnTo=property-reservation-history'
    ];
    const propertyId = String(reservation.propertyId || this.propertyId || '').trim();
    if (propertyId) {
      params.push(`propertyId=${encodeURIComponent(propertyId)}`);
    }
    const officeId = Number(reservation.officeId);
    if (Number.isFinite(officeId) && officeId > 0) {
      params.push(`officeId=${officeId}`);
    }

    const reservationUrl = RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId]);
    this.router.navigateByUrl(`/${reservationUrl}?${params.join('&')}`, {
      state: { prefetchedInvoice: invoice.source }
    });
  }
  //#endregion

  //#region Utility Methods
  compareDepartureDateDesc(left: unknown, right: unknown): number {
    const leftDate = this.utilityService.parseCalendarDateInput(left as string);
    const rightDate = this.utilityService.parseCalendarDateInput(right as string);
    const leftTime = leftDate?.getTime() ?? 0;
    const rightTime = rightDate?.getTime() ?? 0;
    return rightTime - leftTime;
  }

  isHistoricalReservation(departureDateValue: unknown): boolean {
    if (!departureDateValue) {
      return false;
    }
    const departureDate = this.utilityService.parseCalendarDateInput(departureDateValue as string);
    if (!departureDate) {
      return false;
    }
    departureDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return departureDate.getTime() < today.getTime();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion
}
