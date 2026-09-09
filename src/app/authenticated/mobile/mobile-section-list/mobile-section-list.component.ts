import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, finalize, skip, take, takeUntil } from 'rxjs';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { ContactService } from '../../contacts/services/contact.service';
import { EntityType } from '../../contacts/models/contact-enum';
import { MaintenanceService } from '../../maintenance/services/maintenance.service';
import { ReceiptService } from '../../maintenance/services/receipt.service';
import { WorkOrderService } from '../../maintenance/services/work-order.service';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { PropertyService } from '../../properties/services/property.service';
import { ReservationService } from '../../reservations/services/reservation.service';
import { UserGroups } from '../../users/models/user-enums';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MobileListTableComponent } from '../mobile-list-table/mobile-list-table.component';
import { MobileListRow } from '../mobile-list-table/mobile-list.model';

@Component({
  standalone: true,
  selector: 'app-mobile-section-list',
  imports: [MaterialModule, MobileListTableComponent],
  templateUrl: './mobile-section-list.component.html',
  styleUrl: './mobile-section-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileSectionListComponent implements OnInit, OnChanges, OnDestroy {
  @Input() sectionPath = '';
  @Input() tabPath = '';
  private router = inject(Router);
  private authService = inject(AuthService);
  private mappingService = inject(MappingService);
  private utilityService = inject(UtilityService);
  private propertyService = inject(PropertyService);
  private reservationService = inject(ReservationService);
  private contactService = inject(ContactService);
  private maintenanceService = inject(MaintenanceService);
  private receiptService = inject(ReceiptService);
  private workOrderService = inject(WorkOrderService);
  private globalSelectionService = inject(GlobalSelectionService);
  private cdr = inject(ChangeDetectorRef);
  rows: MobileListRow[] = [];
  columns: ColumnSet = {};
  isPageReady = false;
  showFilter = false;
  selectedOfficeId: number | null = null;
  isSuperAdminUser = false;
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['list']));
  destroy$ = new Subject<void>();

  //#region Mobile-Section-List
  ngOnInit(): void {
    this.isSuperAdminUser = this.authService.hasRole(UserGroups.SuperAdmin);
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
      this.reloadList();
    });
    this.loadList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['sectionPath'] || changes['tabPath']) && !changes['sectionPath']?.firstChange && !changes['tabPath']?.firstChange) {
      this.reloadList();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reloadList(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'list');
    this.loadList();
  }

  loadList(): void {
    this.columns = this.getColumns();
    this.showFilter = this.sectionPath === 'properties' || this.sectionPath === 'reservations' || this.sectionPath === 'contacts';
    if (this.sectionPath === 'properties' || this.tabPath === 'inspection' || this.tabPath === 'maintenance') {
      this.loadProperties();
      return;
    }
    if (this.sectionPath === 'reservations') {
      this.loadReservations();
      return;
    }
    if (this.sectionPath === 'contacts') {
      this.loadContacts();
      return;
    }
    if (this.tabPath === 'receipts') {
      this.loadReceipts();
      return;
    }
    if (this.tabPath === 'work-orders') {
      this.loadWorkOrders();
      return;
    }
    this.rows = [];
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list');
    this.markViewForCheck();
  }

  getColumns(): ColumnSet {
    if (this.sectionPath === 'reservations') {
      return {
        property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
        occupant: { displayAs: 'Occupant', maxWidth: '16ch', wrap: false },
        company: { displayAs: 'Company', maxWidth: '14ch', wrap: false },
        arrival: { displayAs: 'Arrival', maxWidth: '14ch', wrap: false },
        departure: { displayAs: 'Departure', maxWidth: '14ch', wrap: false }
      };
    }
    if (this.sectionPath === 'contacts') {
      if (this.tabPath === 'owners') {
        return {
          property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
          contact: { displayAs: 'Contact', maxWidth: '40ch', wrap: false }
        };
      }
      if (this.tabPath === 'companies' || this.tabPath === 'vendors') {
        return {
          contact: { displayAs: 'Contact', maxWidth: '24ch', wrap: false },
          company: { displayAs: 'Company', maxWidth: '24ch', wrap: false }
        };
      }
      return {
        contact: { displayAs: 'Contact', maxWidth: '40ch', wrap: false }
      };
    }
    if (this.tabPath === 'receipts') {
      return {
        amount: { displayAs: 'Amount', maxWidth: '12ch', wrap: false },
        description: { displayAs: 'Description', maxWidth: '40ch', wrap: false }
      };
    }
    if (this.tabPath === 'work-orders') {
      return {
        property: { displayAs: 'Property', maxWidth: '12ch', wrap: false },
        title: { displayAs: 'Title', maxWidth: '40ch', wrap: false }
      };
    }
    return {
      property: { displayAs: 'Property', maxWidth: '12ch', wrap: false }
    };
  }

  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  get rowsClickable(): boolean {
    if (this.sectionPath === 'maintenance' && (this.tabPath === 'receipts' || this.tabPath === 'work-orders')) {
      return true;
    }
    return this.sectionPath === 'contacts'
      || this.sectionPath === 'reservations'
      || this.sectionPath === 'properties'
      || this.sectionPath === 'maintenance';
  }

  addReceipt(): void {
    void this.router.navigate(['/mobile', 'maintenance', 'receipts', 'new']);
  }

  addWorkOrder(): void {
    void this.router.navigate(['/mobile', 'maintenance', 'work-orders', 'new']);
  }

  onRowClick(row: MobileListRow): void {
    if (!row.id) {
      return;
    }
    if (this.sectionPath === 'maintenance' && this.tabPath === 'receipts') {
      void this.router.navigate(['/mobile', this.sectionPath, this.tabPath, row.id]);
      return;
    }
    if (this.sectionPath === 'maintenance' && this.tabPath === 'work-orders') {
      void this.router.navigate(['/mobile', this.sectionPath, this.tabPath, row.id]);
      return;
    }
    if (this.sectionPath !== 'contacts' && this.sectionPath !== 'reservations' && this.sectionPath !== 'properties' && this.sectionPath !== 'maintenance') {
      return;
    }
    if (this.sectionPath === 'maintenance' && this.tabPath !== 'inspection' && this.tabPath !== 'maintenance') {
      return;
    }
    if (this.sectionPath === 'properties') {
      this.router.navigate(['/mobile', 'properties', row.id, 'property']);
      return;
    }
    if (this.tabPath) {
      this.router.navigate(['/mobile', this.sectionPath, this.tabPath, row.id]);
      return;
    }
    this.router.navigate(['/mobile', this.sectionPath, row.id]);
  }
  //#endregion

  //#region Data Loading Methods
  loadProperties(): void {
    const userId = this.authService.getUser()?.userId?.trim() ?? '';
    if (!userId) {
      this.rows = [];
      this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list');
      this.markViewForCheck();
      return;
    }
    if (this.sectionPath === 'maintenance' && (this.tabPath === 'inspection' || this.tabPath === 'maintenance')) {
      this.maintenanceService.getMaintenanceList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list'))).subscribe({
        next: rows => {
          this.rows = (rows || []).filter(row => this.mappingService.matchesMobileOfficeScope(row.officeId, this.selectedOfficeId)).map(row => this.mappingService.mapMobileMaintenanceListDisplay(row));
          this.markViewForCheck();
        },
        error: () => {
          this.rows = [];
          this.markViewForCheck();
        }
      });
      return;
    }
    this.propertyService.getPropertiesBySelectionCriteria(userId).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list'))).subscribe({
      next: properties => {
        this.rows = this.mappingService.mapPropertyListRows(properties || []).filter(property => property.isActive !== false && this.mappingService.matchesMobileOfficeScope(property.officeId, this.selectedOfficeId)).map(property => this.mappingService.mapMobilePropertyListDisplay(property));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  loadReservations(): void {
    this.reservationService.getReservationList().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list'))).subscribe({
      next: reservations => {
        this.rows = this.mappingService.mapReservationList(reservations || []).filter(reservation => reservation.isActive !== false && this.mappingService.matchesMobileOfficeScope(reservation.officeId, this.selectedOfficeId)).map(reservation => this.mappingService.mapMobileReservationListDisplay(reservation));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  loadContacts(): void {
    const entityTypeId = this.getContactEntityType();
    this.contactService.ensureContactsLoaded().pipe(take(1)).subscribe({
      next: () => {
        this.contactService.getAllContacts().pipe(takeUntil(this.destroy$)).subscribe(contacts => {
          this.rows = this.mappingService.mapContacts(contacts || []).filter(contact => contact.isActive !== false && contact.entityTypeId === entityTypeId && this.mappingService.matchesMobileContactOfficeScope(contact, this.selectedOfficeId, this.isSuperAdminUser)).map(contact => this.mappingService.mapMobileContactListDisplay(contact));
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list');
          this.markViewForCheck();
        });
      },
      error: () => {
        this.rows = [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list');
        this.markViewForCheck();
      }
    });
  }

  loadReceipts(): void {
    this.receiptService.getReceipts().pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list'))).subscribe({
      next: receipts => {
        this.rows = (receipts || []).filter(receipt => receipt.isActive !== false && this.mappingService.matchesMobileOfficeScope(receipt.officeId, this.selectedOfficeId)).map(receipt => this.mappingService.mapMobileReceiptListDisplay(receipt));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  loadWorkOrders(): void {
    this.workOrderService.getWorkOrders(null, null).pipe(take(1), finalize(() => this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'list'))).subscribe({
      next: workOrders => {
        this.rows = (workOrders || []).filter(workOrder => workOrder.isActive !== false && this.mappingService.matchesMobileOfficeScope(workOrder.officeId, this.selectedOfficeId)).map(workOrder => this.mappingService.mapMobileWorkOrderListDisplay(workOrder));
        this.markViewForCheck();
      },
      error: () => {
        this.rows = [];
        this.markViewForCheck();
      }
    });
  }

  getContactEntityType(): number {
    if (this.tabPath === 'companies') {
      return EntityType.Company;
    }
    if (this.tabPath === 'owners') {
      return EntityType.Owner;
    }
    if (this.tabPath === 'vendors') {
      return EntityType.Vendor;
    }
    return EntityType.Tenant;
  }
  //#endregion
}
