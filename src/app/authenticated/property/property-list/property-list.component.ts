import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse, PropertyListDisplay } from '../models/property.model';
import { PropertyService } from '../services/property.service';
import { ContactService } from '../../contact/services/contact.service';
import { ContactResponse } from '../../contact/models/contact.model';
import { EntityType } from '../../contact/models/contact-type';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, forkJoin, filter, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../services/mapping.service';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';

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
  contacts: ContactResponse[] = [];

  propertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '20ch', sortType: 'natural' },
    'owner': { displayAs: 'Owner', maxWidth: '30ch' },
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
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private contactService: ContactService) {
  }

  //#region Property-List
  ngOnInit(): void {
    this.loadContacts(); // calls get properties
  }

  addProperty(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, ['new']));
  }

  getProperties(): void {
    this.propertyService.getProperties().pipe(take(1), finalize(() => { this.removeLoadItem('properties'); })).subscribe({
      next: (properties) => {
        this.allProperties = this.mappingService.mapProperties(properties, this.contacts);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
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

  //#region Data Load Methods
  loadContacts():void {
    this.contactService.getAllOwnerContacts().pipe(filter(contacts => contacts && contacts.length > 0), take(1)).subscribe({
      next: (response: ContactResponse[]) => {
        this.contacts = response;
        this.getProperties();
      },
      error: (err: HttpErrorResponse) => {
        this.contacts = [];
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
        this.getProperties();
      }
    });
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
    this.propertiesDisplay = this.showInactive
      ? this.allProperties
      : this.allProperties.filter(property => property.isActive);
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
    this.itemsToLoad$.complete();
  }
  //#endregion
}

