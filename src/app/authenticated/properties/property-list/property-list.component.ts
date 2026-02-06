import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { PropertyListDisplay } from '../models/property.model';
import { PropertyService } from '../services/property.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map, Subscription } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OfficeService } from '../../organizations/services/office.service';
import { OfficeResponse } from '../../organizations/models/office.model';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-property-list',
  templateUrl: './property-list.component.html',
  styleUrls: ['./property-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class PropertyListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allProperties: PropertyListDisplay[] = [];
  propertiesDisplay: PropertyListDisplay[] = [];

  offices: OfficeResponse[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;

  propertiesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'ownerName': { displayAs: 'Owner', maxWidth: '25ch' },
    'bedrooms': { displayAs: 'Beds' },
    'bathrooms': { displayAs: 'Baths' },
    'accomodates': { displayAs: 'Accoms' },
    'squareFeet': { displayAs: 'Sq Ft' },
    'monthlyRate': { displayAs: 'Monthly' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['properties']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public propertyService: PropertyService,
    public toastr: ToastrService,
    public router: Router,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private authService: AuthService) {
  }

  //#region Property-List
  ngOnInit(): void {
    this.loadOffices();
  }

  addProperty(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, ['new']));
  }

  getProperties(): void {
    this.isServiceError = false;
    this.propertyService.getPropertyList().pipe(take(1), finalize(() => { this.removeLoadItem('properties'); })).subscribe({
      next: (properties) => {
        this.allProperties = this.mappingService.mapProperties(properties);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        this.removeLoadItem('properties'); // Ensure loading state is cleared
        console.error('Error loading properties:', err);
        if (err.status !== 404) {
          this.toastr.error('Could not load properties at this time.', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteProperty(property: PropertyListDisplay): void {
    if (confirm(`Are you sure you want to delete this property?`)) {
      this.propertyService.deleteProperty(property.propertyId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Property deleted successfully', CommonMessage.Success);
          this.getProperties(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }
  //#endregion
  
  //#region Routing Methods
  goToProperty(event: PropertyListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
  }

  goToContact(event: PropertyListDisplay): void {
    if (event.owner1Id) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.owner1Id]));
    }
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  
  applyFilters(): void {
    let filtered = this.allProperties;

    // Filter by active/inactive
    if (!this.showInactive) {
      filtered = filtered.filter(property => property.isActive);
    }

    // Filter by office
    if (this.selectedOffice) {
      filtered = filtered.filter(property => property.officeId === this.selectedOffice.officeId);
    }

    this.propertiesDisplay = filtered;
  }
  //#endregion

  //#region Office Methods
  loadOffices(): void {
    // Offices are already loaded on login, so directly subscribe to changes
    this.officesSubscription = this.officeService.getAllOffices().subscribe(allOffices => {
      // Filter offices by user access
      const user = this.authService.getUser();
      if (user && user.officeAccess && user.officeAccess.length > 0) {
        // User has specific office access - filter to only those offices
        const officeAccessIds = user.officeAccess.map(id => typeof id === 'string' ? parseInt(id, 10) : id);
        this.offices = (allOffices || []).filter(office => officeAccessIds.includes(office.officeId));
      } else {
        // User has no office restrictions - show all offices
        this.offices = allOffices || [];
      }
      this.getProperties();
    });
  }

  onOfficeChange(): void {
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  removeLoadItem(key: string): void {
    const currentSet = this.itemsToLoad$.value;
    if (currentSet.has(key)) {
      const newSet = new Set(currentSet);
      newSet.delete(key);
      this.itemsToLoad$.next(newSet);
    }
  }

  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

