import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { PropertyResponse, PropertyListDisplay } from '../models/property.model';
import { PropertyService } from '../services/property.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, forkJoin } from 'rxjs';
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

export class PropertyListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  propertiesDisplayedColumns: ColumnSet = {
    'propertyCode': { displayAs: 'Code', maxWidth: '10ch' },
    'name': { displayAs: 'Name', maxWidth: '25ch' },
    'owner': { displayAs: 'Owner', maxWidth: '25ch' },
    'phone': { displayAs: 'Unit Phone' },
    'bedrooms': { displayAs: 'Beds' },
    'bathrooms': { displayAs: 'Baths' },
    'squareFeet': { displayAs: 'Sq Ft' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allProperties: PropertyListDisplay[] = [];
  propertiesDisplay: PropertyListDisplay[] = [];

  constructor(
    public propertyService: PropertyService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('properties');
  }

  ngOnInit(): void {
    this.getProperties();
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  goToProperty(event: PropertyListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, [event.propertyId]));
  }

  goToContact(event: PropertyListDisplay): void {
    if (event.contactId) {
      this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Contact, [event.contactId]));
    }
  }

  addProperty(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Property, ['new']));
  }

  deleteProperty(property: PropertyListDisplay): void {
    if (confirm(`Are you sure you want to delete this property?`)) {
      this.propertyService.deleteProperty(property.propertyId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Property deleted successfully', CommonMessage.Success);
          this.getProperties(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete property. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete property', CommonMessage.Error);
          }
        }
      });
    }
  }

  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }

  private getProperties(): void {
    this.propertyService.getProperties().pipe(
      take(1),
      finalize(() => { this.removeLoadItem('properties') })
    ).subscribe({
      next: (properties) => {
        this.allProperties = this.mappingService.mapProperties(properties);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Properties', CommonMessage.ServiceError);
        }
      }
    });
  }

  applyFilters(): void {
    this.propertiesDisplay = this.showInactive
      ? this.allProperties
      : this.allProperties.filter(property => property.isActive);
  }
}

