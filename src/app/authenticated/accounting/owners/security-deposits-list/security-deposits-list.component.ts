import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, take, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { RouterUrl } from '../../../app.routes';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { UnreturnedSecurityDepositDisplay } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';

@Component({
  selector: 'app-security-deposits-list',
  standalone: true,
  imports: [CommonModule, MaterialModule, DataTableComponent],
  templateUrl: './security-deposits-list.component.html',
  styleUrl: './security-deposits-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityDepositsListComponent implements OnInit, OnChanges, OnDestroy {

  @Input() officeId: number | null = null;
  @Input() refreshTrigger = 0;

  private reservationService = inject(ReservationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private router = inject(Router);
  private toastr = inject(ToastrService);
  private cdr = inject(ChangeDetectorRef);

  readonly displayedColumns: ColumnSet = {
    reservationCode: { displayAs: 'Reservation', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    propertyCode: { displayAs: 'Property', wrap: false, maxWidth: '15ch', sortType: 'natural' },
    officeName: { displayAs: 'Office', wrap: false, maxWidth: '18ch' },
    tenantName: { displayAs: 'Tenant', wrap: true, maxWidth: '22ch' },
    companyName: { displayAs: 'Company', wrap: true, maxWidth: '22ch' },
    departureDate: { displayAs: 'Departure', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' },
    depositDisplay: { displayAs: 'Deposit', wrap: false, maxWidth: '14ch', alignment: 'right', headerAlignment: 'right' },
    securityDepositReturnDate: { displayAs: 'Return By', wrap: false, maxWidth: '14ch', alignment: 'center', headerAlignment: 'center' }
  };

  rowsDisplay: UnreturnedSecurityDepositDisplay[] = [];
  allRowsDisplay: UnreturnedSecurityDepositDisplay[] = [];
  isPageReady = false;
  isServiceError = false;
  noDataMessage = 'No unreturned security deposits for the selected office access.';
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['securityDeposits']));
  destroy$ = new Subject<void>();
  private loadId = 0;

  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });
    this.loadRows();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadRows();
      return;
    }

    if (changes['officeId'] && !changes['officeId'].firstChange) {
      this.applyOfficeFilter();
      this.markViewForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }

  loadRows(): void {
    const loadId = ++this.loadId;
    this.isServiceError = false;
    this.utilityService.addLoadItem(this.itemsToLoad$, 'securityDeposits');

    this.reservationService.getUnreturnedSecurityDeposits().pipe(
      take(1),
      finalize(() => {
        if (loadId === this.loadId) {
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'securityDeposits');
        }
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: rows => {
        if (loadId !== this.loadId) {
          return;
        }

        this.allRowsDisplay = this.mappingService.mapUnreturnedSecurityDeposits(rows || []);
        this.applyOfficeFilter();
        this.reservationService.setSecurityDepositsOutstanding((rows || []).length > 0);
        this.markViewForCheck();
      },
      error: (error: HttpErrorResponse) => {
        if (loadId !== this.loadId) {
          return;
        }

        this.isServiceError = true;
        this.allRowsDisplay = [];
        this.rowsDisplay = [];
        this.reservationService.setSecurityDepositsOutstanding(false);
        this.toastr.error('Unable to load security deposits.');
        this.markViewForCheck();
      }
    });
  }

  applyOfficeFilter(): void {
    if (this.officeId != null) {
      this.rowsDisplay = this.allRowsDisplay.filter(row => row.officeId === this.officeId);
    } else {
      this.rowsDisplay = [...this.allRowsDisplay];
    }
  }

  openReservation(row: UnreturnedSecurityDepositDisplay): void {
    const reservationId = String(row?.reservationId || '').trim();
    if (!reservationId) {
      return;
    }

    void this.router.navigate([RouterUrl.replaceTokens(RouterUrl.Reservation, [reservationId])]);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
}
