import { OnInit, Component, OnDestroy, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router, ActivatedRoute } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { ContactResponse, ContactListDisplay } from '../models/contact.model';
import { ContactService } from '../services/contact.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, filter, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-contact-list',
  templateUrl: './contact-list.component.html',
  styleUrls: ['./contact-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class ContactListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() entityTypeId?: number; // Optional filter by entity type (Tenant, Owner, Company, Vendor)
  @Input() selectedOffice: OfficeResponse | null = null; // Office selection from parent
  @Output() officeChange = new EventEmitter<OfficeResponse | null>(); // Emit office changes to parent
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allContacts: ContactListDisplay[] = [];
  contactsDisplay: ContactListDisplay[] = [];

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  routerSubscription?: Subscription;
  contactsSubscription?: Subscription;
  showOfficeDropdown: boolean = true;
  hasInitialLoad: boolean = false;
  contactsDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '20ch' },
    'contactCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'contactType': { displayAs: 'Contact Type', maxWidth: '20ch' },
    'fullName': { displayAs: 'Name', maxWidth: '25ch' },
    'phone': { displayAs: 'Phone' },
    'email': { displayAs: 'Email', maxWidth: '25ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['contacts']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public contactService: ContactService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private utilityService: UtilityService,
    private officeService: OfficeService,
    private route: ActivatedRoute) {
  }

  //#region Contacts
  ngOnInit(): void {
    this.loadOffices();
    
    // Subscribe to router events to force refresh when navigating back to contacts page
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        filter(() => (this.router.url.includes(RouterUrl.Contacts) || this.router.url.includes(RouterUrl.ContactList)) && !this.router.url.includes('/contact/'))
      )
      .subscribe(() => {
        // Force refresh when navigating back to contacts page
        if (this.hasInitialLoad) {
          this.contactService.loadAllContacts();
        }
      });
    
    // Subscribe to contacts service to automatically refresh when contacts are reloaded
    // This will fire when loadAllContacts() is called (from contact component or router event)
    // All contact-list components across all tabs will automatically get the update
    this.contactsSubscription = this.contactService.getAllContacts().subscribe(contacts => {
      // Only update if we've done the initial load (to avoid updating before offices are loaded)
      if (this.hasInitialLoad && contacts) {
        this.allContacts = this.mappingService.mapContacts(contacts || []);
        this.applyFilters();
      }
    });
  }

  addContact(): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Contact, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // If entityTypeId is provided, add it as a query parameter to pre-fill the contact type
    if (this.entityTypeId !== undefined && this.entityTypeId !== null) {
      queryParams.entityTypeId = this.entityTypeId;
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  getContacts(): void {
    this.utilityService.addLoadItem(this.itemsToLoad$, 'contacts');
    this.contactService.areContactsLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.contactService.getAllContacts().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'contacts'); })).subscribe({
        next: (response: ContactResponse[]) => {
          this.allContacts = this.mappingService.mapContacts(response || []);
          this.applyFilters();
          this.hasInitialLoad = true;
        },
        error: (err: HttpErrorResponse) => {
          this.isServiceError = true;
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
          this.hasInitialLoad = true;
        }
      });
    });
  }


  deleteContact(contact: ContactListDisplay): void {
    if (confirm(`Are you sure you want to delete ${contact.fullName}?`)) {
      this.contactService.deleteContact(contact.contactId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Contact deleted successfully', CommonMessage.Success);
          this.getContacts(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToContact(event: ContactListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  copyContact(event: ContactListDisplay): void {
    const url = RouterUrl.replaceTokens(RouterUrl.Contact, ['new']);
    const queryParams: any = {};
    
    // Preserve existing query params (like tab)
    const currentParams = this.route.snapshot.queryParams;
    if (currentParams['tab']) {
      queryParams.tab = currentParams['tab'];
    }
    
    // Add copyFrom parameter
    queryParams.copyFrom = event.contactId;
    
    // Preserve officeId if an office is selected
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // If entityTypeId is provided, add it as a query parameter
    if (this.entityTypeId !== undefined && this.entityTypeId !== null) {
      queryParams.entityTypeId = this.entityTypeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: queryParams
    });
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.allContacts;
    
    // Filter by entityTypeId if provided
    if (this.entityTypeId !== undefined && this.entityTypeId !== null) {
      filtered = filtered.filter(contact => contact.entityTypeId === this.entityTypeId);
    }
    
    // Filter by office
    if (this.selectedOffice) {
      filtered = filtered.filter(contact => contact.officeId === this.selectedOffice.officeId);
    }
    
    // Filter by active status
    this.contactsDisplay = this.showInactive
      ? filtered
      : filtered.filter(contact => contact.isActive === true);
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    // Reapply filters when entityTypeId or selectedOffice changes
    if (changes['entityTypeId'] && !changes['entityTypeId'].firstChange) {
      this.applyFilters();
    }
    if (changes['selectedOffice']) {
      // Update local selectedOffice when input changes from parent
      this.selectedOffice = changes['selectedOffice'].currentValue;
      this.applyFilters();
    }
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
      // Offices are already loaded on login, so directly subscribe to changes
      // API already filters offices by user access
      this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
        this.offices = allOffices || [];
        
        // Auto-select if only one office available and no office is already selected from parent
        if (this.offices.length === 1 && !this.selectedOffice) {
          this.selectedOffice = this.offices[0];
          this.officeChange.emit(this.selectedOffice);
          this.showOfficeDropdown = false;
        } else {
          this.showOfficeDropdown = true;
        }
        
        this.getContacts();
    });
  }

  onOfficeChange(): void {
    // Emit office change to parent so all tabs can be updated
    this.officeChange.emit(this.selectedOffice);
    this.applyFilters();
  }
  //#endregion

  //#region Utility methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.contactsSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

