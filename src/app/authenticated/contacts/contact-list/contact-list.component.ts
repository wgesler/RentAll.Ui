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
  @Input() entityTypeId?: number;
  @Input() officeId: number | null = null;
  @Output() officeIdChange = new EventEmitter<number | null>();
  
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allContacts: ContactListDisplay[] = [];
  contactsDisplay: ContactListDisplay[] = [];

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  showOfficeDropdown: boolean = true;

  routerSubscription?: Subscription;

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

  //#region Contact-List
  ngOnInit(): void {
    this.loadOffices();
    this.loadContacts();
    
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      if (this.officeId !== null && this.offices.length > 0) {
        this.selectedOffice = this.offices.find(o => o.officeId === this.officeId) || null;
        if (this.selectedOffice) {
          this.applyFilters();
        }
      }
      
      this.route.queryParams.subscribe(params => {
        const officeIdParam = params['officeId'];
        
        if (officeIdParam) {
          const parsedOfficeId = parseInt(officeIdParam, 10);
          if (parsedOfficeId) {
            this.selectedOffice = this.offices.find(o => o.officeId === parsedOfficeId) || null;
            if (this.selectedOffice) {
              this.officeIdChange.emit(this.selectedOffice.officeId);
              this.applyFilters();
            }
          }
        } else {
          if (this.officeId === null || this.officeId === undefined) {
            this.selectedOffice = null;
            this.applyFilters();
          }
        }
      });
    });
    
    this.routerSubscription = this.router.events.pipe(
        filter(event => event instanceof NavigationEnd),
        filter(() => (this.router.url.includes(RouterUrl.Contacts) || this.router.url.includes(RouterUrl.ContactList)) && !this.router.url.includes('/contact/'))
      )
      .subscribe(() => {
        if (this.hasInitialLoad) {
          this.contactService.loadAllContacts();
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
    
    if (this.selectedOffice) {
      queryParams.officeId = this.selectedOffice.officeId;
    }
    
    // Navigate with query params
    this.router.navigate([url], {
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined
    });
  }

  deleteContact(contact: ContactListDisplay): void {
    if (confirm(`Are you sure you want to delete ${contact.fullName}?`)) {
        this.contactService.deleteContact(contact.contactId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Contact deleted successfully', CommonMessage.Success);
          this.loadContacts();
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
          this.selectedOffice = newOfficeId ? this.offices.find(o => o.officeId === newOfficeId) || null : null;
          if (this.selectedOffice) {
            this.applyFilters();
          } else {
            this.applyFilters();
          }
        }
      }
    }
  }
 
  onOfficeChange(): void {
    if (this.selectedOffice) {
      this.officeIdChange.emit(this.selectedOffice.officeId);
    } else {
      this.officeIdChange.emit(null);
    }
    this.applyFilters();
  }
  //#endregion

  //#region Data Load Methods
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
        
        if (this.officeId !== null && this.officeId !== undefined) {
          const matchingOffice = this.offices.find(o => o.officeId === this.officeId) || null;
          if (matchingOffice !== this.selectedOffice) {
            this.selectedOffice = matchingOffice;
            if (this.selectedOffice) {
              this.applyFilters();
            } else {
              this.applyFilters();
            }
          }
        } else if (this.selectedOffice && this.offices.length === 1) {
          this.applyFilters();
        }
      });
    });
  }

  //#endregion

  //#region Utility methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

