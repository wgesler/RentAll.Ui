import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, skip, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalOfficeSelectionService } from '../../organizations/services/global-office-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { EntityType } from '../models/contact-enum';
import { ContactListDisplay } from '../models/contact.model';
import { ContactService } from '../services/contact.service';

@Component({
    standalone: true,
    selector: 'app-contact-list',
    templateUrl: './contact-list.component.html',
    styleUrls: ['./contact-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ContactListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() entityTypeId?: number;
  @Input() officeId: number | null = null;
  @Input() showInactive: boolean = false;
  @Input() tabIndex?: number;
  @Output() officeIdChange = new EventEmitter<number | null>();
  @Output() showInactiveChange = new EventEmitter<boolean>();
  @Output() openContact = new EventEmitter<{ contactId: string; copyFrom?: string; entityTypeId?: number; tabIndex?: number }>();

  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  allContacts: ContactListDisplay[] = [];
  contactsDisplay: ContactListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;
  officeScopeResolved: boolean = false;

  routerSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  hasInitialLoad: boolean = false;

  private readonly baseColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'contactCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'companyName': { displayAs: 'Company', maxWidth: '20ch' },
    'fullName': { displayAs: 'Name', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  private readonly ownerColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'contactCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'propertyCodesDisplay': { displayAs: 'Properties', maxWidth: '20ch' },
    'fullName': { displayAs: 'Name', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, sort: false, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  get contactsDisplayedColumns(): ColumnSet {
    return this.entityTypeId === EntityType.Owner ? this.ownerColumns : this.baseColumns;
  }

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contacts', 'offices', 'officeScope']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public contactService: ContactService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalOfficeSelectionService: GlobalOfficeSelectionService,
    private route: ActivatedRoute) {
  }

  //#region Contact-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadContacts();

    this.globalOfficeSubscription = this.globalOfficeSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
      if (this.offices.length > 0) {
        this.resolveOfficeScope(officeId);
      }
    });
    
    this.routerSubscription = this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        filter(() => (this.router.url.includes(RouterUrl.Contacts) || this.router.url.includes(RouterUrl.ContactList)) && !this.router.url.includes('/contact/'))
      )
      .subscribe(() => {
        if (this.hasInitialLoad) {
          this.contactService.loadAllContacts().subscribe(contacts => {
            this.allContacts = this.mappingService.mapContacts(contacts || []);
            this.applyFilters();
          });
        }
      });
  }

  addContact(): void {
    this.openContact.emit({
      contactId: 'new',
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex
    });
  }

  deleteContact(contact: ContactListDisplay): void {
    this.contactService.deleteContact(contact.contactId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Contact deleted successfully', CommonMessage.Success);
        this.contactService.getContacts().pipe(take(1)).subscribe({
          next: contacts => {
            this.allContacts = this.mappingService.mapContacts(contacts || []);
            this.applyFilters();
          },
          error: () => {}
        });
      },
      error: () => {}
    });
  }

  goToContact(event: ContactListDisplay): void {
    this.openContact.emit({
      contactId: event.contactId,
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex
    });
  }

  copyContact(event: ContactListDisplay): void {
    this.openContact.emit({
      contactId: 'new',
      copyFrom: event.contactId,
      entityTypeId: this.entityTypeId ?? undefined,
      tabIndex: this.tabIndex
    });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.showInactiveChange.emit(this.showInactive);
    this.applyFilters();
  }

  applyFilters(): void {
    if (!this.officeScopeResolved) {
      return;
    }

    let filtered = this.allContacts;
    
    if (!this.showInactive) {
      filtered = filtered.filter(contact => contact.isActive === true);
    }

    if (this.entityTypeId !== undefined && this.entityTypeId !== null) {
      filtered = filtered.filter(contact => contact.entityTypeId === this.entityTypeId);
    }

    if (this.selectedOffice) {
      filtered = filtered.filter(contact => contact.officeId === this.selectedOffice.officeId);
    }

    this.contactsDisplay = filtered;
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityTypeId']) {
      const newEntityTypeId = changes['entityTypeId'].currentValue;
      const previousEntityTypeId = changes['entityTypeId'].previousValue;
      
      if (previousEntityTypeId === undefined || newEntityTypeId !== previousEntityTypeId) {
        this.applyFilters();
      }
    }
    
    if (changes['officeId']) {
      const newOfficeId = changes['officeId'].currentValue;
      const previousOfficeId = changes['officeId'].previousValue;

      if (previousOfficeId === undefined || newOfficeId !== previousOfficeId) {
        if (this.offices.length > 0) {
          this.resolveOfficeScope(newOfficeId);
        }
      }
    }

    if (changes['showInactive'] && !changes['showInactive'].firstChange) {
      this.applyFilters();
    }

  }
 
  onOfficeChange(): void {
    this.globalOfficeSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.applyFilters();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe(contacts => {
        this.allContacts = this.mappingService.mapContacts(contacts || []);
        this.applyFilters();
        this.hasInitialLoad = true;
      });
    });
  }

  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');

        if (this.offices.length === 1 && (this.officeId === null || this.officeId === undefined)) {
          this.selectedOffice = this.offices[0];
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }

        const preferredOfficeId = this.officeId ?? this.globalOfficeSelectionService.getSelectedOfficeIdValue();
        this.resolveOfficeScope(preferredOfficeId);
      });
    });
  }

  //#endregion

  //#region Utility Methods
  resolveOfficeScope(officeId: number | null): void {
    this.selectedOffice = this.utilityService.resolveSelectedOfficeById(this.offices, officeId);
    this.officeScopeResolved = true;
    this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'officeScope');
    this.applyFilters();
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.globalOfficeSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

