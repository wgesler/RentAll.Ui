import { OnInit, Component, OnDestroy } from '@angular/core';
import { CommonModule } from "@angular/common";
import { Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { OrganizationListDisplay } from '../models/organization.model';
import { OrganizationService } from '../services/organization.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { CommonMessage } from '../../../enums/common-message.enum';
import { RouterUrl } from '../../../app.routes';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { MappingService } from '../../../services/mapping.service';

@Component({
  selector: 'app-organization-list',
  templateUrl: './organization-list.component.html',
  styleUrls: ['./organization-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class OrganizationListComponent implements OnInit, OnDestroy {
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allOrganizations: OrganizationListDisplay[] = [];
  organizationsDisplay: OrganizationListDisplay[] = [];

  organizationsDisplayedColumns: ColumnSet = {
    'organizationCode': { displayAs: 'Code', maxWidth: '84px' },
    'name': { displayAs: 'Name', maxWidth: '30ch' },
    'city': { displayAs: 'City' },
    'state': { displayAs: 'State' },
    'zip': { displayAs: 'Zip' },
    'phone': { displayAs: 'Phone' },
    'website': { displayAs: 'Website' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organizations']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public organizationService: OrganizationService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService) {
  }

  //#region Organization-List
  ngOnInit(): void {
    this.getOrganizations();
  }

  getOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => { this.removeLoadItem('organizations'); })).subscribe({
      next: (organizations) => {
        this.allOrganizations = this.mappingService.mapOrganizations(organizations);
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

  addOrganization(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Organization, ['new']));
  }

  deleteOrganization(organization: OrganizationListDisplay): void {
    if (confirm(`Are you sure you want to delete ${organization.name}?`)) {
      this.organizationService.deleteOrganization(organization.organizationId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Organization deleted successfully', CommonMessage.Success);
          this.getOrganizations(); // Refresh the list
        },
        error: (err: HttpErrorResponse) => {
          if (err.status === 404) {
            // Handle not found error if business logic requires
          }
        }
      });
    }
  }

  goToOrganization(event: OrganizationListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Organization, [event.organizationId]));
  }
  //#endregion

  //#region Filter Methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.organizationsDisplay = this.showInactive
      ? this.allOrganizations
      : this.allOrganizations.filter(org => org.isActive);
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

