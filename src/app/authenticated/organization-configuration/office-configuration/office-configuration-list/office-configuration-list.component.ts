import { OnInit, Component, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { OfficeConfigurationResponse, OfficeConfigurationListDisplay } from '../models/office-configuration.model';
import { OfficeConfigurationService } from '../services/office-configuration.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize, BehaviorSubject, Observable, map } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';
import { OfficeService } from '../../office/services/office.service';
import { OfficeResponse } from '../../office/models/office.model';
import { AuthService } from '../../../../services/auth.service';
import { FormatterService } from '../../../../services/formatter-service';

@Component({
  selector: 'app-office-configuration-list',
  templateUrl: './office-configuration-list.component.html',
  styleUrls: ['./office-configuration-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class OfficeConfigurationListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() officeConfigurationSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;
  allOfficeConfigurations: OfficeConfigurationListDisplay[] = [];
  officeConfigurationsDisplay: OfficeConfigurationListDisplay[] = [];
  offices: OfficeResponse[] = [];

  officeConfigurationsDisplayedColumns: ColumnSet = {
    'officeCode': { displayAs: 'Code', maxWidth: '15ch' },
    'officeName': { displayAs: 'Office', maxWidth: '25ch' },
    'afterHoursPhone': { displayAs: 'After Hours Phone', maxWidth: '25ch' },
    'maintenanceEmail': { displayAs: 'Maintenance Email', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['officeConfigurations', 'offices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public officeConfigurationService: OfficeConfigurationService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService,
    private officeService: OfficeService,
    private authService: AuthService,
    private formatterService: FormatterService) {
  }

  ngOnInit(): void {
    this.loadOffices();
  }

  addOfficeConfiguration(): void {
    // Office configuration is only used in embedded mode (settings page)
    this.officeConfigurationSelected.emit('new');
  }

  getOfficeConfigurations(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    const orgOffices = this.offices.filter(o => o.organizationId === orgId);
    
    if (orgOffices.length === 0) {
      this.allOfficeConfigurations = [];
      this.applyFilters();
      this.removeLoadItem('officeConfigurations');
      return;
    }

    this.allOfficeConfigurations = [];
    let completedCount = 0;
    const totalOffices = orgOffices.length;

    orgOffices.forEach(office => {
      this.officeConfigurationService.getOfficeConfigurationByOfficeId(office.officeId).pipe(
        take(1)
      ).subscribe({
        next: (config: OfficeConfigurationResponse) => {
          const display: OfficeConfigurationListDisplay = {
            officeId: config.officeId,
            officeCode: office.officeCode || '',
            officeName: office.name || '',
            maintenanceEmail: config.maintenanceEmail,
            afterHoursPhone: this.formatterService.phoneNumber(config.afterHoursPhone),
            defaultDeposit: config.defaultDeposit,
            isActive: config.isActive
          };
          this.allOfficeConfigurations.push(display);
          completedCount++;
          if (completedCount === totalOffices) {
            this.applyFilters();
            this.removeLoadItem('officeConfigurations');
          }
        },
        error: (err: HttpErrorResponse) => {
          // 404 means no configuration exists for this office, which is fine
          completedCount++;
          if (completedCount === totalOffices) {
            this.applyFilters();
            this.removeLoadItem('officeConfigurations');
          }
        }
      });
    });
  }

  deleteOfficeConfiguration(officeConfig: OfficeConfigurationListDisplay): void {
    const officeName = officeConfig.officeName || officeConfig.officeCode || 'this office configuration';
    if (confirm(`Are you sure you want to delete the configuration for ${officeName}?`)) {
      this.officeConfigurationService.deleteOfficeConfiguration(officeConfig.officeId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Office configuration deleted successfully', CommonMessage.Success);
          this.getOfficeConfigurations();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete office configuration. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete office configuration', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToOfficeConfiguration(event: OfficeConfigurationListDisplay): void {
    // Office configuration is only used in embedded mode (settings page)
    this.officeConfigurationSelected.emit(event.officeId);
  }

  // Data Loading Methods
  loadOffices(): void {
    const orgId = this.authService.getUser()?.organizationId || '';
    if (!orgId) {
      this.removeLoadItem('offices');
      return;
    }

    this.officeService.getOffices().pipe(take(1), finalize(() => { 
      this.removeLoadItem('offices');
      this.getOfficeConfigurations();
    })).subscribe({
      next: (offices: OfficeResponse[]) => {
        this.offices = (offices || []).filter(o => o.organizationId === orgId);
      },
      error: (err: HttpErrorResponse) => {
        this.offices = [];
        if (err.status !== 400) {
          this.toastr.error('Could not load offices. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
        }
      }
    });
  }

  // Filtering Methods
  applyFilters(): void {
    this.officeConfigurationsDisplay = this.showInactive
      ? this.allOfficeConfigurations
      : this.allOfficeConfigurations.filter(config => config.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
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
}

