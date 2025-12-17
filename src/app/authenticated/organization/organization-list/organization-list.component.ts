import { OnInit, Component } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../material.module';
import { OrganizationResponse, OrganizationListDisplay } from '../models/organization.model';
import { OrganizationService } from '../services/organization.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
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

export class OrganizationListComponent implements OnInit {
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

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
  private allOrganizations: OrganizationListDisplay[] = [];
  organizationsDisplay: OrganizationListDisplay[] = [];

  constructor(
    public organizationService: OrganizationService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    private mappingService: MappingService) {
      this.itemsToLoad.push('organizations');
  }

  ngOnInit(): void {
    this.getOrganizations();
  }

  getOrganizations(): void {
    this.organizationService.getOrganizations().pipe(take(1), finalize(() => { this.removeLoadItem('organizations') })).subscribe({
      next: (organizations) => {
        console.log('Organization List Component - Organizations loaded:', organizations);
        this.allOrganizations = this.mapOrganizations(organizations);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Organizations', CommonMessage.ServiceError);
        }
      }
    });
  }

  mapOrganizations(organizations: OrganizationResponse[]): OrganizationListDisplay[] {
    return organizations.map(org => ({
      organizationId: org.organizationId,
      organizationCode: org.organizationCode,
      name: org.name,
      address1: org.address1,
      address2: org.address2,
      suite: org.suite,
      city: org.city,
      state: org.state,
      zip: org.zip,
      phone: this.mappingService.formatPhoneNumber(org.phone),
      website: org.website,
      logoStorageId: org.logoStorageId,
      isActive: org.isActive
    }));
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
          if (err.status !== 400) {
            this.toastr.error('Could not delete organization. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete organization', CommonMessage.Error);
          }
        }
      });
    }
  }

  // Routing methods
  goToOrganization(event: OrganizationListDisplay): void {
    this.router.navigateByUrl(RouterUrl.replaceTokens(RouterUrl.Organization, [event.organizationId]));
  }

  // Filter methods
  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  applyFilters(): void {
    this.organizationsDisplay = this.showInactive
      ? this.allOrganizations
      : this.allOrganizations.filter(org => org.isActive);
  }

  // Utility helpers
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}

