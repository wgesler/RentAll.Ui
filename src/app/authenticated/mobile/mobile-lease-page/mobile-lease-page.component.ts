import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { LeaseComponent } from '../../reservations/lease/lease.component';
import { withMobileEmailCreateRoute } from '../mobile-property-letter/mobile-property-letter-email';
import { ReservationResponse } from '../../reservations/models/reservation-model';
import { ReservationService } from '../../reservations/services/reservation.service';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-lease-page',
  imports: [MaterialModule, MobileListTableComponent, LeaseComponent],
  templateUrl: './mobile-lease-page.component.html',
  styleUrl: './mobile-lease-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileLeasePageComponent implements OnInit, OnChanges, OnDestroy {
  @Input() reservationId = '';
  private router = inject(Router);
  private authService = inject(AuthService);
  private reservationService = inject(ReservationService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  rows: MobileListRow[] = [];
  columns: ColumnSet = {
    property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
    occupant: { displayAs: 'Occupant', maxWidth: '16ch', wrap: false },
    arrival: { displayAs: 'Arrival', maxWidth: '14ch', wrap: false }
  };
  reservation: ReservationResponse | null = null;
  isPageReady = false;
  loadFailed = false;
  isSendingDocuSign = false;
  selectedOfficeId: number | null = null;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['lease']));
  destroy$ = new Subject<void>();
  @ViewChild('leaseHost') leaseHost?: ElementRef<HTMLElement>;
  @ViewChild(LeaseComponent) lease?: LeaseComponent;
  private leaseFitTimer: ReturnType<typeof setInterval> | null = null;

  //#region Mobile-Lease-Page
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
    this.leaseFitTimer = setInterval(() => this.fitLeaseToScreen(), 400);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['reservationId'] && !changes['reservationId'].firstChange) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    if (this.leaseFitTimer) {
      clearInterval(this.leaseFitTimer);
      this.leaseFitTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  fitLeaseToScreen(): void {
    const iframe = this.leaseHost?.nativeElement.querySelector('iframe.preview-iframe') as HTMLIFrameElement | null;
    const doc = iframe?.contentDocument;
    if (!doc?.head || !iframe) {
      return;
    }

    const pageWidth = 8.5 * 96;
    const available = Math.max(iframe.clientWidth - 8, 0);
    if (available <= 0) {
      return;
    }

    const zoom = Math.min(1, available / pageWidth);
    let style = doc.getElementById('mobile-lease-fit') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'mobile-lease-fit';
      doc.head.appendChild(style);
    }

    style.textContent = `
      html {
        zoom: ${zoom};
      }
      body {
        width: 8.5in !important;
        max-width: 8.5in !important;
        margin: 0 !important;
      }
    `;
  }

  reload(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'lease');
    if (this.reservationId.trim()) {
      this.loadReservation();
      return;
    }
    this.reservation = null;
    this.loadFailed = false;
    this.loadReservationList();
  }

  saveLease(): void {
    this.lease?.saveLease();
  }

  emailLease(): void {
    const lease = this.lease;
    if (!lease) {
      return;
    }
    void withMobileEmailCreateRoute(this.router, () => lease.onEmail());
  }

  get canUseDocuSign(): boolean {
    return this.authService.canUseDocuSign();
  }

  async docuSignLease(): Promise<void> {
    const lease = this.lease;
    if (!lease || this.isSendingDocuSign || !this.canUseDocuSign) {
      return;
    }
    this.isSendingDocuSign = true;
    this.markViewForCheck();
    try {
      await lease.onDocuSign();
    } finally {
      this.isSendingDocuSign = false;
      this.markViewForCheck();
    }
  }

  openLease(row: MobileListRow): void {
    const reservationId = (row.id || '').trim();
    if (!reservationId) {
      return;
    }
    void this.router.navigate(['/mobile', 'reservations', 'lease', reservationId]);
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }
  //#endregion

  //#region Data Loading Methods
  loadReservationList(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease'))).subscribe({
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

  loadReservation(): void {
    this.reservation = null;
    this.loadFailed = false;
    this.reservationService.getReservationByGuid(this.reservationId.trim()).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'lease'))).subscribe({
      next: reservation => {
        this.reservation = reservation;
        this.loadFailed = !reservation?.propertyId || !reservation.officeId;
        this.markViewForCheck();
      },
      error: () => {
        this.reservation = null;
        this.loadFailed = true;
        this.markViewForCheck();
      }
    });
  }
  //#endregion
}
