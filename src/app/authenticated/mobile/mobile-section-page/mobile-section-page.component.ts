import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, filter, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { MobileContactDetailComponent } from '../mobile-contact-detail/mobile-contact-detail.component';
import { MobileInspectionDetailComponent } from '../mobile-inspection-detail/mobile-inspection-detail.component';
import { MobileMaintenanceDetailComponent } from '../mobile-maintenance-detail/mobile-maintenance-detail.component';
import { MobilePropertyDetailComponent } from '../mobile-property-detail/mobile-property-detail.component';
import { MobilePropertyLetterComponent } from '../mobile-property-letter/mobile-property-letter.component';
import { MobileReceiptDetailComponent } from '../mobile-receipt-detail/mobile-receipt-detail.component';
import { MobileWorkOrderDetailComponent } from '../mobile-work-order-detail/mobile-work-order-detail.component';
import { MobileReservationDetailComponent } from '../mobile-reservation-detail/mobile-reservation-detail.component';
import { MobileSectionListComponent } from '../mobile-section-list/mobile-section-list.component';
import { MobileTicketDetailComponent } from '../mobile-ticket-detail/mobile-ticket-detail.component';
import { MobileTicketListComponent } from '../mobile-ticket-list/mobile-ticket-list.component';
import { AuthService } from '../../../services/auth.service';
import { MOBILE_PROPERTY_DETAIL_TABS, MobileNavItem, MobileNavTab, MobileTicketFilterMode, getMobileNavItem, getMobileRouteParts, getMobileTab, getMobileTicketFilterMode, getMobileTicketTab, getMobileTicketTabs, getMobilePropertyBackUrl, getMobileReservationBackUrl, resolveMobilePropertyReturnTo, resolveMobileReservationReturnTo } from '../mobile-nav';
import { getMobileTicketReturnRoute } from '../mobile-ticket-return.util';

@Component({
  standalone: true,
  selector: 'app-mobile-section-page',
  imports: [MaterialModule, MobileTicketListComponent, MobileTicketDetailComponent, MobileInspectionDetailComponent, MobileMaintenanceDetailComponent, MobileReceiptDetailComponent, MobileWorkOrderDetailComponent, MobileSectionListComponent, MobileContactDetailComponent, MobileReservationDetailComponent, MobilePropertyDetailComponent, MobilePropertyLetterComponent],
  templateUrl: './mobile-section-page.component.html',
  styleUrl: './mobile-section-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileSectionPageComponent implements OnInit, OnDestroy {
  @ViewChild('contactDetail') contactDetail?: MobileContactDetailComponent;
  @ViewChild('reservationDetail') reservationDetail?: MobileReservationDetailComponent;
  @ViewChild('propertyDetail') propertyDetail?: MobilePropertyDetailComponent;
  @ViewChild('ticketDetail') ticketDetail?: MobileTicketDetailComponent;
  @ViewChild('inspectionDetail') inspectionDetail?: MobileInspectionDetailComponent;
  private router = inject(Router);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  destroy$ = new Subject<void>();
  section: MobileNavItem | null = null;
  tab: MobileNavTab | null = null;
  detailId = '';
  contactDirty = false;
  reservationDirty = false;
  propertyDirty = false;
  ticketDirty = false;
  inspectionDirty = false;
  propertyCode = '';
  receiptDescription = '';
  workOrderTitle = '';
  ticketCode = '';
  ticketFilterMode: MobileTicketFilterMode = 'assignedToMe';
  isAdmin = false;
  reservationReturnTo: 'board' | 'list' = 'list';
  propertyReturnTo: 'board' | 'list' = 'list';
  titleTabs: MobileNavTab[] = [];

  //#region Mobile-Section
  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.syncFromUrl();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntil(this.destroy$)).subscribe(() => {
      this.syncFromUrl();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  onContactDirtyChange(isDirty: boolean): void {
    this.contactDirty = isDirty;
    this.markViewForCheck();
  }

  onReservationDirtyChange(isDirty: boolean): void {
    this.reservationDirty = isDirty;
    this.markViewForCheck();
  }

  onPropertyDirtyChange(isDirty: boolean): void {
    this.propertyDirty = isDirty;
    this.markViewForCheck();
  }

  onPropertyCodeChange(propertyCode: string): void {
    this.propertyCode = propertyCode;
    this.markViewForCheck();
  }

  onReceiptDescriptionChange(description: string): void {
    this.receiptDescription = description;
    this.markViewForCheck();
  }

  onWorkOrderTitleChange(title: string): void {
    this.workOrderTitle = title;
    this.markViewForCheck();
  }

  onTicketDirtyChange(isDirty: boolean): void {
    this.ticketDirty = isDirty;
    this.markViewForCheck();
  }

  onTicketCodeChange(ticketCode: string): void {
    this.ticketCode = ticketCode;
    this.markViewForCheck();
  }

  onInspectionDirtyChange(isDirty: boolean): void {
    this.inspectionDirty = isDirty;
    this.markViewForCheck();
  }

  saveContact(): void {
    this.contactDetail?.saveContact();
  }

  saveReservation(): void {
    this.reservationDetail?.saveReservation();
  }

  saveProperty(): void {
    this.propertyDetail?.saveProperty();
  }

  saveTicket(): void {
    this.ticketDetail?.saveTicket();
  }

  saveInspection(): void {
    this.inspectionDetail?.saveInspection();
  }

  saveDetail(): void {
    if (this.section?.path === 'maintenance' && this.tab?.path === 'inspection' && this.detailId) {
      this.saveInspection();
      return;
    }
    if (this.section?.path === 'tickets') {
      this.saveTicket();
      return;
    }
    if (this.section?.path === 'reservations') {
      this.saveReservation();
      return;
    }
    if (this.section?.path === 'properties') {
      this.saveProperty();
      return;
    }
    this.saveContact();
  }

  getTitleSuffix(): string {
    if (this.section?.path === 'tickets' && this.detailId) {
      return this.tab?.label ?? '';
    }
    if (this.section?.path === 'maintenance' && this.tab?.path === 'receipts' && this.detailId) {
      return this.tab?.label ?? 'Receipts';
    }
    if (this.section?.path === 'maintenance' && this.tab?.path === 'work-orders' && this.detailId) {
      return this.tab?.label ?? 'Work Orders';
    }
    if (this.section?.path === 'maintenance' && this.tab?.path === 'inspection' && this.detailId) {
      return this.tab?.label ?? 'Inspection';
    }
    if (this.section?.path === 'maintenance' && this.tab?.path === 'maintenance' && this.detailId) {
      return this.tab?.label ?? 'Maintenance';
    }
    if (this.section?.path === 'properties' && this.detailId) {
      return this.tab?.label ?? 'Property';
    }
    return this.tab?.label ?? '';
  }

  onTitleTabSelect(menuTab: MobileNavTab): void {
    if (!this.section) {
      return;
    }
    if (this.section.path === 'properties' && this.detailId) {
      this.router.navigate(['/mobile', 'properties', this.detailId, menuTab.path], { queryParamsHandling: 'preserve' });
      return;
    }
    this.router.navigate(['/mobile', this.section.path, menuTab.path]);
  }

  isTitleTabSelected(menuTab: MobileNavTab): boolean {
    return this.tab?.path === menuTab.path;
  }

  backToList(): void {
    if (!this.section) {
      return;
    }
    const queryParams = this.router.parseUrl(this.router.url).queryParams;
    if (this.section.path === 'maintenance' && this.detailId) {
      if (this.tab?.path === 'receipts') {
        const ticketRoute = getMobileTicketReturnRoute(queryParams['returnTicketId'], queryParams['returnTicketTab']);
        if (ticketRoute) {
          void this.router.navigate(ticketRoute);
          return;
        }
      }
      if (this.tab?.path === 'work-orders') {
        const returnReceiptId = String(queryParams['returnReceiptId'] ?? '').trim();
        if (returnReceiptId) {
          void this.router.navigate(['/mobile', 'maintenance', 'receipts', returnReceiptId]);
          return;
        }
        const ticketRoute = getMobileTicketReturnRoute(queryParams['returnTicketId'], queryParams['returnTicketTab']);
        if (ticketRoute) {
          void this.router.navigate(ticketRoute);
          return;
        }
      }
    }
    if (this.section.path === 'reservations' && this.detailId) {
      void this.router.navigateByUrl(getMobileReservationBackUrl(this.reservationReturnTo));
      return;
    }
    if (this.section.path === 'properties' && this.detailId) {
      void this.router.navigateByUrl(getMobilePropertyBackUrl(this.propertyReturnTo));
      return;
    }
    if (this.section.path === 'properties' || !this.tab) {
      this.router.navigate(['/mobile', this.section.path]);
      return;
    }
    this.router.navigate(['/mobile', this.section.path, this.tab.path]);
  }
  //#endregion

  //#region Utility Methods
  syncFromUrl(): void {
    const parts = getMobileRouteParts(this.router.url);
    this.section = getMobileNavItem(parts.sectionPath);
    this.detailId = parts.id;
    if (this.section?.path === 'tickets' && parts.tabPath && !getMobileTicketTab(parts.tabPath, this.isAdmin)) {
      void this.router.navigate(['/mobile', 'tickets', 'my-tickets']);
      return;
    }
    this.titleTabs = this.section?.path === 'properties' && this.detailId
      ? MOBILE_PROPERTY_DETAIL_TABS
      : this.section?.path === 'tickets'
        ? getMobileTicketTabs(this.isAdmin)
        : (this.section?.tabs ?? []);
    this.tab = this.section?.path === 'properties' && this.detailId
      ? (MOBILE_PROPERTY_DETAIL_TABS.find(tab => tab.path === parts.tabPath) ?? MOBILE_PROPERTY_DETAIL_TABS[0])
      : this.section?.path === 'tickets'
        ? getMobileTicketTab(parts.tabPath, this.isAdmin)
        : (this.section ? getMobileTab(this.section, parts.tabPath) : null);
    this.contactDirty = false;
    this.reservationDirty = false;
    this.propertyDirty = false;
    this.ticketDirty = false;
    this.inspectionDirty = false;
    if (!this.detailId) {
      this.propertyCode = '';
      this.receiptDescription = '';
      this.workOrderTitle = '';
      this.ticketCode = '';
    }
    this.ticketFilterMode = getMobileTicketFilterMode(this.tab?.path);
    this.reservationReturnTo = resolveMobileReservationReturnTo(this.router.url);
    this.propertyReturnTo = resolveMobilePropertyReturnTo(this.router.url);
    this.markViewForCheck();
  }
  //#endregion
}
