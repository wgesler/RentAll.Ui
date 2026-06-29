import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {BehaviorSubject, finalize, take, Subject, takeUntil} from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { OrganizationListDisplay } from '../models/organization.model';
import { OrganizationService } from '../services/organization.service';

@Component({
    standalone: true,
    selector: 'app-organization-list',
    templateUrl: './organization-list.component.html',
    styleUrls: ['./organization-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent],
    changeDetection: ChangeDetectionStrategy.OnPush
})

export class OrganizationListComponent implements OnInit, OnDestroy {
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
    'isActive': { displayAs: 'IsActive', isCheckbox: true, wrap: false, alignment: 'center', maxWidth: '15ch' }
  };

  isPageReady = false;
  destroy$ = new Subject<void>();
  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['organizations']));

  constructor(
    public organizationService: OrganizationService,
    public toastr: ToastrService,
    public router: Router,
    private mappingService: MappingService,
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef) {
  }

  //#region Organization-List
  ngOnInit(): void {
    this.itemsToLoad$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.isPageReady = items.size === 0;
      this.markViewForCheck();
    });

    this.getOrganizations();
  }

  getOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'organizations'); })).subscribe({
      next: (organizations) => {
        this.allOrganizations = this.mappingService.mapOrganizations(organizations);
        this.applyFilters();
        this.markViewForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
        this.markViewForCheck();
      }
    });
  }

  addOrganization(): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Organization, ['new']));
  }

  deleteOrganization(organization: OrganizationListDisplay): void {
    this.organizationService.deleteOrganization(organization.organizationId).pipe(take(1)).subscribe({
      next: () => {
        this.toastr.success('Organization deleted successfully', CommonMessage.Success);
        this.getOrganizations();
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) {
          // Handle not found error if business logic requires
        }
      }
    });
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
      ? this.allOrganizations.filter(org => org.isActive === false)
      : this.allOrganizations.filter(org => org.isActive === true);
  }
  //#endregion

  //#region Utility Methods
  markViewForCheck(): void {
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.itemsToLoad$.complete();
  }
  //#endregion
}

