import { OnInit, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from '@angular/router';
import { MaterialModule } from '../../../../material.module';
import { OfficeResponse, OfficeListDisplay } from '../models/office.model';
import { OfficeService } from '../services/office.service';
import { ToastrService } from 'ngx-toastr';
import { FormsModule } from '@angular/forms';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { HttpErrorResponse } from '@angular/common/http';
import { take, finalize } from 'rxjs';
import { MappingService } from '../../../../services/mapping.service';
import { CommonMessage } from '../../../../enums/common-message.enum';
import { RouterUrl } from '../../../../app.routes';
import { ColumnSet } from '../../../shared/data-table/models/column-data';

@Component({
  selector: 'app-office-list',
  templateUrl: './office-list.component.html',
  styleUrls: ['./office-list.component.scss'],
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class OfficeListComponent implements OnInit {
  @Input() embeddedInSettings: boolean = false;
  @Output() officeSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  itemsToLoad: string[] = [];
  isServiceError: boolean = false;
  showInactive: boolean = false;

  officesDisplayedColumns: ColumnSet = {
    'officeCode': { displayAs: 'Code', maxWidth: '15ch' },
    'name': { displayAs: 'Name', maxWidth: '20ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'fax': { displayAs: 'Fax', maxWidth: '20ch' },
    'website': { displayAs: 'Website', maxWidth: '30ch' },
    'isActive': { displayAs: 'Is Active', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };
  private allOffices: OfficeListDisplay[] = [];
  officesDisplay: OfficeListDisplay[] = [];

  constructor(
    public officeService: OfficeService,
    public toastr: ToastrService,
    public route: ActivatedRoute,
    public router: Router,
    public forms: FormsModule,
    public mappingService: MappingService) {
      this.itemsToLoad.push('offices');
  }

  ngOnInit(): void {
    this.getOffices();
  }

  addOffice(): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getOffices(): void {
    this.officeService.getOffices().pipe(take(1), finalize(() => { this.removeLoadItem('offices') })).subscribe({
      next: (response: OfficeResponse[]) => {
        this.allOffices = this.mappingService.mapOffices(response);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('Could not load Offices', CommonMessage.ServiceError);
        }
      }
    });
  }

  deleteOffice(office: OfficeListDisplay): void {
    if (confirm(`Are you sure you want to delete ${office.officeCode}?`)) {
      this.officeService.deleteOffice(office.officeId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Office deleted successfully', CommonMessage.Success);
          this.getOffices();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete office. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete office', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToOffice(event: OfficeListDisplay): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit(event.officeId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.Office, [event.officeId.toString()]);
      this.router.navigateByUrl(url);
    }
  }

  // Filter methods
  applyFilters(): void {
    this.officesDisplay = this.showInactive
      ? this.allOffices
      : this.allOffices.filter(office => office.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }

  // Utility Methods
  removeLoadItem(itemToRemove: string): void {
    this.itemsToLoad = this.itemsToLoad.filter(item => item !== itemToRemove);
  }
}


