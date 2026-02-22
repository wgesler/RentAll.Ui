import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, Observable, Subscription, filter, finalize, map, take } from 'rxjs';
import { RouterUrl } from '../../../app.routes';
import { CommonMessage } from '../../../enums/common-message.enum';
import { MaterialModule } from '../../../material.module';
import { FormatterService } from '../../../services/formatter-service';
import { MappingService } from '../../../services/mapping.service';
import { UtilityService } from '../../../services/utility.service';
import { DataTableComponent } from '../../shared/data-table/data-table.component';
import { ColumnSet } from '../../shared/data-table/models/column-data';
import { AccountingOfficeListDisplay, AccountingOfficeResponse } from '../models/accounting-office.model';
import { OfficeResponse } from '../models/office.model';
import { AccountingOfficeService } from '../services/accounting-office.service';
import { OfficeService } from '../services/office.service';

@Component({
    selector: 'app-accounting-office-list',
    templateUrl: './accounting-office-list.component.html',
    styleUrls: ['./accounting-office-list.component.scss'],
    imports: [CommonModule, MaterialModule, FormsModule, DataTableComponent]
})

export class AccountingOfficeListComponent implements OnInit, OnDestroy {
  @Input() embeddedInSettings: boolean = false;
  @Output() officeSelected = new EventEmitter<string | number | null>();
  panelOpenState: boolean = true;
  isServiceError: boolean = false;
  showInactive: boolean = false;

  offices: OfficeResponse[] = [];
  availableOffices: { value: number, name: string }[] = [];
  officesSubscription?: Subscription;
  selectedOffice: OfficeResponse | null = null;
  
  allAccountingOffices: AccountingOfficeListDisplay[] = [];
  accountingOfficesDisplay: AccountingOfficeListDisplay[] = [];

  accountingOfficesDisplayedColumns: ColumnSet = {
    'officeName': { displayAs: 'Office', maxWidth: '15ch' },
    'name': { displayAs: 'Name', maxWidth: '15ch' },
    'phone': { displayAs: 'Phone', maxWidth: '20ch' },
    'fax': { displayAs: 'Fax', maxWidth: '20ch' },
    'bankName': { displayAs: 'Bank Name', maxWidth: '25ch' },
    'email': { displayAs: 'Email', maxWidth: '40ch' },
    'isActive': { displayAs: 'Is Active', maxWidth: '15ch', isCheckbox: true, sort: false, wrap: false, alignment: 'left' }
  };

  itemsToLoad$ = new BehaviorSubject<Set<string>>(new Set(['offices', 'accountingOffices']));
  isLoading$: Observable<boolean> = this.itemsToLoad$.pipe(map(items => items.size > 0));

  constructor(
    public accountingOfficeService: AccountingOfficeService,
    public toastr: ToastrService,
    public router: Router,
    public formatterService: FormatterService,
    private officeService: OfficeService,
    private mappingService: MappingService,
    private utilityService: UtilityService) {
  }

  //#region Office-List
  ngOnInit(): void {
    // Wait for offices to load before loading accounting offices
    this.loadOffices();
  }

  addAccountingOffice(): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit('new');
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.AccountingOffice, ['new']);
      this.router.navigateByUrl(url);
    }
  }

  getAccountingOffices(): void {
    this.accountingOfficeService.getAccountingOffices().pipe(take(1), finalize(() => { this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices'); })).subscribe({
      next: (response: AccountingOfficeResponse[]) => {
        this.allAccountingOffices = this.mappingService.mapAccountingOffices(response, this.offices);
        this.applyFilters();
      },
      error: (err: HttpErrorResponse) => {
        this.isServiceError = true;
        if (err.status !== 400) {
          this.toastr.error('*****Could not load Accounting Offices', CommonMessage.ServiceError);
        }
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
      }
    });
  }

  deleteAccountingOffice(office: AccountingOfficeListDisplay): void {
    if (confirm(`Are you sure you want to delete ${office.name}?`)) {
      this.accountingOfficeService.deleteAccountingOffice(office.officeId).pipe(take(1)).subscribe({
        next: () => {
          this.toastr.success('Accounting Office deleted successfully', CommonMessage.Success);
          this.utilityService.addLoadItem(this.itemsToLoad$, 'accountingOffices');
          this.getAccountingOffices();
        },
        error: (err: HttpErrorResponse) => {
          if (err.status !== 400) {
            this.toastr.error('Could not delete accounting office. ' + CommonMessage.TryAgain, CommonMessage.ServiceError);
          } else {
            this.toastr.error(err.error?.message || 'Could not delete accounting office', CommonMessage.Error);
          }
        }
      });
    }
  }

  goToAccountingOffice(event: AccountingOfficeListDisplay): void {
    if (this.embeddedInSettings) {
      this.officeSelected.emit(event.officeId);
    } else {
      const url = RouterUrl.replaceTokens(RouterUrl.AccountingOffice, [event.officeId.toString()]);
      this.router.navigateByUrl(url);
    }
  }
  //#endregion

  //#region Data Load Methods
  loadOffices(): void {
    this.officeService.areOfficesLoaded().pipe(filter(loaded => loaded === true), take(1)).subscribe(() => {
      this.officesSubscription = this.officeService.getAllOffices().subscribe(offices => {
        this.offices = offices || [];
        this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'offices');
        if (!this.offices.length) {
          this.allAccountingOffices = [];
          this.accountingOfficesDisplay = [];
          this.utilityService.removeLoadItemFromSet(this.itemsToLoad$, 'accountingOffices');
          return;
        }
        this.getAccountingOffices();
      });
    });
  }
  //#endregion

  //#region Filter methods
  applyFilters(): void {
    this.accountingOfficesDisplay = this.showInactive
      ? this.allAccountingOffices
      : this.allAccountingOffices.filter(office => office.isActive);
  }

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    this.applyFilters();
  }
  //#endregion

  //#region Utility Methods
  ngOnDestroy(): void {
    this.officesSubscription?.unsubscribe();
    this.itemsToLoad$.complete();
  }
  //#endregion
}
