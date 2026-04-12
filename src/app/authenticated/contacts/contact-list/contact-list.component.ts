import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, skip, switchMap, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { AuthService } from '../../../services/auth.service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { GlobalSelectionService } from '../../organizations/services/global-selection.service';
import { OfficeService } from '../../organizations/services/office.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { DataTableFilterActionsDirective } from '../../shared/data-table/data-table-filter-actions.directive';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { TitleBarSelectComponent } from '../../shared/titlebar-select/titlebar-select.component';
import { EntityType } from '../models/contact-enum';
import { ContactListDisplay, ContactRequest, ContactResponse } from '../models/contact.model';
import { ContactService } from '../services/contact.service';

@Component({
    standalone: true,
    selector: 'app-contact-list',
    templateUrl: './contact-list.component.html',
    styleUrls: ['./contact-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, TitleBarSelectComponent, DataTableComponent, DataTableFilterActionsDirective]
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
  user: any;
  isAdmin = false;
  officeScopeResolved: boolean = false;
  organizationId: string = '';
  preferredOfficeId: number | null = null;

  routerSubscription?: Subscription;
  globalOfficeSubscription?: Subscription;
  hasInitialLoad: boolean = false;
  canEditIsActiveCheckbox = false;

  private readonly baseColumns: ColumnSet = {
    'contactCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural' },
    'officeName': { displayAs: 'Office', maxWidth: '15ch', sortType: 'natural' },
    'companyName': { displayAs: 'Company', maxWidth: '30ch' },
    'fullName': { displayAs: 'Contact', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '20ch' }
  };

  private readonly ownerColumns: ColumnSet = {
    'contactCode': { displayAs: 'Code', maxWidth: '15ch', sortType: 'natural' },
    'officeName': { displayAs: 'Office', maxWidth: '15ch', sortType: 'natural' },
    'propertyCodesDisplay': { displayAs: 'Properties', maxWidth: '20ch' },
    'fullName': { displayAs: 'Contact', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'IsActive', isCheckbox: true, checkboxEditable: true, sort: false, wrap: false, alignment: 'center', maxWidth: '20ch' }
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
    private authService: AuthService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private globalSelectionService: GlobalSelectionService,
    private route: ActivatedRoute) {
  }

  //#region Contact-List
  ngOnInit(): void {
    this.user = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.setIsActiveCheckboxEditability();
    this.organizationId = this.user?.organizationId?.trim() ?? '';
    this.preferredOfficeId = this.user?.defaultOfficeId ?? null;
    this.loadOffices();
    this.loadContacts();

    this.globalOfficeSubscription = this.globalSelectionService.getSelectedOfficeId$().pipe(skip(1)).subscribe(officeId => {
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
          this.contactService.refreshContacts().pipe(take(1)).subscribe(contacts => {
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
        this.contactService.refreshContacts().pipe(take(1)).subscribe({
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

  onContactCheckboxChange(event: ContactListDisplay): void {
    if (!this.canEditIsActiveCheckbox) {
      return;
    }

    const changedCheckboxColumn = (event as any)?.__changedCheckboxColumn;
    if (changedCheckboxColumn !== 'isActive') {
      return;
    }

    const previousValue = (event as any)?.__previousCheckboxValue === true;
    const nextValue = (event as any)?.__checkboxValue === true;
    if (previousValue === nextValue) {
      return;
    }

    this.applyContactIsActiveValue(event.contactId, nextValue);

    this.contactService.getContactByGuid(event.contactId).pipe(
      take(1),
      switchMap((contact: ContactResponse) => this.contactService.updateContact(this.buildContactIsActiveUpdateRequest(contact, nextValue)).pipe(take(1))),
      finalize(() => this.applyFilters())
    ).subscribe({
      next: () => {
        this.toastr.success('Contact updated.', CommonMessage.Success);
      },
      error: () => {
        this.applyContactIsActiveValue(event.contactId, previousValue);
        this.toastr.error('Unable to update contact.', CommonMessage.Error);
      }
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
      filtered = filtered.filter(contact => {
        const officeAccess = (contact.officeAccess || []).map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
        if (officeAccess.length > 0) {
          return officeAccess.includes(this.selectedOffice!.officeId);
        }
        return Number(contact.officeId) === this.selectedOffice!.officeId;
      });
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
    this.globalSelectionService.setSelectedOfficeId(this.selectedOffice?.officeId ?? null);
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.applyFilters();
  }

  get officeOptions(): { value: number, label: string }[] {
    return this.offices.map(office => ({
      value: office.officeId,
      label: office.name
    }));
  }

  get selectedOfficeId(): number | null {
    return this.selectedOffice?.officeId ?? null;
  }

  onOfficeDropdownChange(value: string | number | null): void {
    const officeId = value == null || value === '' ? null : Number(value);
    this.selectedOffice = officeId == null
      ? null
      : this.offices.find(office => office.officeId === officeId) || null;
    this.onOfficeChange();
  }
  //#endregion

  //#region Data Loading Methods
  loadContacts(): void {
    this.contactService.ensureContactsLoaded().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
      next: (contacts) => {
        this.allContacts = this.mappingService.mapContacts(contacts || []);
        this.applyFilters();
        this.hasInitialLoad = true;
      },
      error: () => {
        this.allContacts = [];
        this.contactsDisplay = [];
      }
    });
  }

  loadOffices(): void {
    this.globalSelectionService.ensureOfficeScope(this.organizationId, this.preferredOfficeId).pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices'); })).subscribe({
      next: () => {
        this.offices = this.officeService.getAllOfficesValue() || [];
        this.availableOffices = this.mappingService.mapOfficesToDropdown(this.offices);
        this.globalSelectionService.getOfficeUiState$(this.offices, { explicitOfficeId: this.officeId, requireExplicitOfficeUnset: true }).pipe(take(1)).subscribe({
          next: uiState => {
            this.showOfficeDropdown = uiState.showOfficeDropdown;
            this.resolveOfficeScope(uiState.selectedOfficeId);
          }
        });
      },
      error: () => {
        this.offices = [];
        this.availableOffices = [];
        this.resolveOfficeScope(null);
      }
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

  setIsActiveCheckboxEditability(): void {
    this.canEditIsActiveCheckbox = this.isAdmin;
    this.baseColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
    this.ownerColumns['isActive'].checkboxEditable = this.canEditIsActiveCheckbox;
  }

  buildContactIsActiveUpdateRequest(contact: ContactResponse, isActive: boolean): ContactRequest {
    const { fullName: _fullName, officeName: _officeName, ...requestBase } = contact;
    return {
      ...requestBase,
      officeAccess: this.mappingService.normalizeOfficeAccessNumbers(contact.officeAccess),
      isActive
    };
  }

  applyContactIsActiveValue(contactId: string, isActive: boolean): void {
    for (const contact of this.allContacts) {
      if (contact.contactId === contactId) {
        contact.isActive = isActive;
        break;
      }
    }
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

